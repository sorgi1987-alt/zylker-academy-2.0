'use strict';
/**
 * Reconciliation (kickoff-prompt.md §2 "Reconciliation"), exercised against
 * a fake CRM and a fake Datastore. Covers: the overlap window, incremental
 * vs. full-pass queries, checkpoint advancement on success, checkpoint being
 * left untouched on failure, and that reconciliation never regresses a row
 * write-through or an earlier reconciliation run already advanced past.
 *
 * Run with:  node --test functions/zylker_api/test/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const reconciliation = require('../reconciliation.js');
const projections = require('../projections.js');

/* ------------------------------- fake CRM -------------------------------- */

function makeZoho(moduleRows) {
  const calls = [];
  return {
    calls,
    async crmQuery(req, query) {
      calls.push(query);
      const module_ = /from\s+(\w+)/.exec(query)[1];
      if (module_ === 'Boom') throw new Error('upstream unavailable');
      const limitMatch = /limit\s+(\d+),\s*(\d+)/.exec(query);
      const offset = limitMatch ? Number(limitMatch[1]) : 0;
      const count = limitMatch ? Number(limitMatch[2]) : 200;
      const sinceMatch = /Modified_Time > '([^']*)'/.exec(query);
      let rows = moduleRows[module_] || [];
      if (sinceMatch) {
        rows = rows.filter((r) => r.Modified_Time > sinceMatch[1]);
      }
      return rows.slice(offset, offset + count);
    }
  };
}

/* ----------------------------- fake Datastore ----------------------------- */

function makeDs(seedSyncState = {}) {
  const tables = new Map();
  let nextRowId = 1;
  const rowsOf = (t) => { if (!tables.has(t)) tables.set(t, new Map()); return tables.get(t); };

  Object.entries(seedSyncState).forEach(([entity, patch]) => {
    const ROWID = String(nextRowId += 1);
    rowsOf('sync_state').set(ROWID, { ROWID, entity, ...patch });
  });

  return {
    async zcql(req, query) {
      const table = /from\s+(\w+)/.exec(query)[1];
      const rows = [...rowsOf(table).values()];
      const crmIdMatch = /crm_id\s*=\s*'([^']*)'/.exec(query);
      if (crmIdMatch) {
        const found = rows.find((r) => r.crm_id === crmIdMatch[1]);
        return found ? [{ [table]: { ROWID: found.ROWID, source_modified_time: found.source_modified_time } }] : [];
      }
      const entityMatch = /entity\s*=\s*'([^']*)'/.exec(query);
      if (entityMatch) {
        const found = rows.find((r) => r.entity === entityMatch[1]);
        return found ? [{ [table]: found }] : [];
      }
      return [];
    },
    async insertRow(req, table, row) {
      const ROWID = String(nextRowId += 1);
      const stored = { ROWID, ...row };
      rowsOf(table).set(ROWID, stored);
      return stored;
    },
    async updateRow(req, table, row) {
      const merged = { ...rowsOf(table).get(row.ROWID), ...row };
      rowsOf(table).set(row.ROWID, merged);
      return merged;
    },
    syncStateRow(entityKey) {
      return [...rowsOf('sync_state').values()].find((r) => r.entity === entityKey);
    },
    count(table) {
      return rowsOf(table).size;
    },
    rowFor(table, crmId) {
      return [...rowsOf(table).values()].find((r) => r.crm_id === crmId);
    }
  };
}

const req = {};

const rawStudent = (id, modified) => ({
  id: String(id), First_Name: `Student${id}`, Last_Name: 'Test',
  Email: `s${id}@example.com`, Modified_Time: modified
});

/* ---------------------------------- tests --------------------------------- */

test('withOverlap subtracts OVERLAP_MINUTES from a checkpoint', () => {
  const result = reconciliation.withOverlap('2026-08-12T10:00:00+02:00');
  const expected = reconciliation.toCoqlDatetime(
    new Date(Date.parse('2026-08-12T10:00:00+02:00') - reconciliation.OVERLAP_MINUTES * 60000)
  );
  assert.equal(result, expected);
});

/**
 * Found live: the very first Cron-triggered reconciliation run failed on
 * every entity with COQL's "INVALID_QUERY … expected_data_type: datetime" —
 * traced to withOverlap() handing Date#toISOString()'s own format
 * ("…07:49:17.000Z") straight to COQL, which only accepts a plain numeric
 * offset ("…07:49:17+00:00"), confirmed live via a direct COQL call with
 * each format. This asserts the milliseconds-and-"Z" shape can never
 * resurface, not just that today's example input happens to convert right.
 */
test('withOverlap never returns milliseconds or a literal "Z" — the exact shape COQL rejected live', () => {
  const result = reconciliation.withOverlap('2026-08-12T10:00:00+02:00');
  assert.doesNotMatch(result, /\.\d{3}Z$/);
  assert.match(result, /[+-]\d{2}:\d{2}$/);
});

test('withOverlap returns null for an unparseable checkpoint', () => {
  assert.equal(reconciliation.withOverlap('not-a-date'), null);
});

test('with no prior checkpoint, reconciliation does a full pass (same as bootstrap)', async () => {
  const rows = [rawStudent(1, '2026-08-01T10:00:00+02:00'), rawStudent(2, '2026-08-02T10:00:00+02:00')];
  const zoho = makeZoho({ Contacts: rows });
  const ds = makeDs();

  const result = await reconciliation.reconcileEntity(zoho, req, 'students', 'Contacts', ds);

  assert.equal(result.since, null);
  assert.equal(result.processed, 2);
  assert.equal(ds.count('crm_students'), 2);
  assert.equal(ds.syncStateRow('crm.contacts').checkpoint, '2026-08-02T10:00:00+02:00');
});

test('with a prior checkpoint, only records modified after the overlap-adjusted checkpoint are fetched', async () => {
  const checkpoint = '2026-08-05T10:00:00+02:00';
  const before = withOverlapMinus(checkpoint, 10); // outside the 5-minute overlap window entirely
  const withinOverlap = withOverlapMinus(checkpoint, 2); // inside the overlap window
  const after = '2026-08-06T10:00:00+02:00';

  const rows = [
    rawStudent(1, before),
    rawStudent(2, withinOverlap),
    rawStudent(3, after)
  ];
  const zoho = makeZoho({ Contacts: rows });
  const ds = makeDs({ 'crm.contacts': { checkpoint } });

  const result = await reconciliation.reconcileEntity(zoho, req, 'students', 'Contacts', ds);

  assert.equal(result.processed, 2, 'the record before the overlap window is not refetched');
  assert.equal(ds.rowFor('crm_students', '1'), undefined);
  assert.ok(ds.rowFor('crm_students', '2'));
  assert.ok(ds.rowFor('crm_students', '3'));
});

function withOverlapMinus(checkpointIso, minutesBeforeCheckpoint) {
  return new Date(Date.parse(checkpointIso) - minutesBeforeCheckpoint * 60000).toISOString();
}

test('checkpoint advances to the max Modified_Time seen on a successful run', async () => {
  const rows = [rawStudent(1, '2026-08-10T10:00:00+02:00'), rawStudent(2, '2026-08-12T10:00:00+02:00')];
  const zoho = makeZoho({ Contacts: rows });
  const ds = makeDs({ 'crm.contacts': { checkpoint: '2026-08-01T00:00:00+02:00' } });

  await reconciliation.reconcileEntity(zoho, req, 'students', 'Contacts', ds);

  assert.equal(ds.syncStateRow('crm.contacts').checkpoint, '2026-08-12T10:00:00+02:00');
});

test('checkpoint is never advanced on a failed run', async () => {
  const zoho = makeZoho({}); // 'Boom' module throws
  const originalCheckpoint = '2026-08-01T00:00:00+02:00';
  const ds = makeDs({ 'crm.contacts': { checkpoint: originalCheckpoint } });

  await assert.rejects(() => reconciliation.reconcileEntity(zoho, req, 'students', 'Boom', ds));

  const state = ds.syncStateRow('crm.contacts');
  assert.equal(state.sync_status, 'failed');
  assert.equal(state.checkpoint, originalCheckpoint, 'checkpoint must not move on failure');
});

test('reconciliation never overwrites a row write-through already advanced with older data', async () => {
  // Simulates: write-through already projected the newest version of a
  // record moments ago; a slow reconciliation run, started before that
  // write, now delivers a stale copy of the same record.
  const ds = makeDs();
  await projections.upsertProjectionRow(req, 'students',
    rawStudent(1, '2026-08-12T12:00:00+02:00'), ds); // the newer, write-through version

  const zoho = makeZoho({ Contacts: [rawStudent(1, '2026-08-12T10:00:00+02:00')] }); // stale
  const result = await reconciliation.reconcileEntity(zoho, req, 'students', 'Contacts', ds);

  assert.equal(result.skippedStale, 1);
  assert.equal(ds.rowFor('crm_students', '1').source_modified_time, '2026-08-12T12:00:00+02:00');
});

test('reconcileMany runs every requested entity and reports per-entity results', async () => {
  const zoho = makeZoho({
    Contacts: [rawStudent(1, '2026-08-01T10:00:00+02:00')],
    Deals: []
  });
  const ds = makeDs();

  const results = await reconciliation.reconcileMany(zoho, req, ['students', 'applications'], ds);

  assert.equal(results.length, 2);
  assert.equal(results[0].entity, 'students');
  assert.equal(results[0].processed, 1);
  assert.equal(results[1].entity, 'applications');
  assert.equal(results[1].processed, 0);
});

test('SCHEDULE_TIERS covers exactly the 5 projected entities across the 3 kickoff-prompt.md tiers', () => {
  const all = [
    ...reconciliation.SCHEDULE_TIERS.every15Min,
    ...reconciliation.SCHEDULE_TIERS.hourly,
    ...reconciliation.SCHEDULE_TIERS.daily
  ].sort();
  assert.deepEqual(all, ['applications', 'enrolments', 'intakes', 'programmes', 'students']);
});

test('reconciliation_applied_total accumulates across runs (kickoff-prompt.md §2 "Sync health")', async () => {
  const ds = makeDs();
  const zoho1 = makeZoho({ Contacts: [rawStudent(1, '2026-08-01T10:00:00+02:00'), rawStudent(2, '2026-08-01T10:00:00+02:00')] });
  await reconciliation.reconcileEntity(zoho1, req, 'students', 'Contacts', ds);
  assert.equal(ds.syncStateRow('crm.contacts').reconciliation_applied_total, 2);

  // A second run. The overlap window deliberately re-covers records right at
  // the prior checkpoint (records 1 and 2 sit exactly at it), so this run
  // re-applies those two — harmlessly, since upsert is idempotent — on top
  // of the one genuinely new record. The counter reflects applied writes,
  // including safe overlap re-application, not distinct records touched.
  const zoho2 = makeZoho({ Contacts: [
    rawStudent(1, '2026-08-01T10:00:00+02:00'),
    rawStudent(2, '2026-08-01T10:00:00+02:00'),
    rawStudent(3, '2026-08-05T10:00:00+02:00')
  ] });
  await reconciliation.reconcileEntity(zoho2, req, 'students', 'Contacts', ds);
  assert.equal(ds.syncStateRow('crm.contacts').reconciliation_applied_total, 5, 'cumulative, not reset per run: 2 + (2 re-applied + 1 new)');
});

/* ------------------------------ cache invalidation ------------------------- */

test('a reconciliation run that actually updates records invalidates the cache', async () => {
  const zoho = makeZoho({ Contacts: [rawStudent(1, '2026-08-01T10:00:00+02:00')] });
  const ds = makeDs();
  const invalidated = [];
  const fakeCache = { async invalidateForEntity(req, entity) { invalidated.push(entity); } };

  await reconciliation.reconcileEntity(zoho, req, 'students', 'Contacts', ds, fakeCache);
  assert.deepEqual(invalidated, ['students']);
});

test('a reconciliation run that touches nothing does not invalidate the cache', async () => {
  const ds = makeDs({ 'crm.contacts': { checkpoint: '2026-08-01T10:00:00+02:00' } });
  const zoho = makeZoho({ Contacts: [] }); // nothing modified since the checkpoint
  const invalidated = [];
  const fakeCache = { async invalidateForEntity(req, entity) { invalidated.push(entity); } };

  const result = await reconciliation.reconcileEntity(zoho, req, 'students', 'Contacts', ds, fakeCache);
  assert.equal(result.updated, 0);
  assert.deepEqual(invalidated, []);
});
