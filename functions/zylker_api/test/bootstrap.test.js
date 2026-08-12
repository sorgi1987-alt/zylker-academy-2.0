'use strict';
/**
 * Bootstrap sync (kickoff-prompt.md §2 "Bootstrap", §3 phase 3), exercised
 * against a fake CRM and a fake Datastore — no live Catalyst session or Zoho
 * org involved. Covers: pagination across COQL pages, sync_state bookkeeping,
 * a per-record failure not being fatal to the run, a CRM-read failure being
 * fatal, and re-running being safe (never wipes existing rows, never
 * duplicates them).
 *
 * Run with:  node --test functions/zylker_api/test/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const bootstrap = require('../bootstrap.js');
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
      return (moduleRows[module_] || []).slice(offset, offset + count);
    }
  };
}

/* ----------------------------- fake Datastore ---------------------------- */

function makeDs() {
  const tables = new Map();
  let nextRowId = 1;
  const rowsOf = (t) => { if (!tables.has(t)) tables.set(t, new Map()); return tables.get(t); };

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
        return found ? [{ [table]: { ROWID: found.ROWID } }] : [];
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
    }
  };
}

const req = {};

const rawStudent = (id, modified) => ({
  id: String(id), First_Name: `Student${id}`, Last_Name: 'Test',
  Email: `s${id}@example.com`, Modified_Time: modified
});

/* ---------------------------------- tests --------------------------------- */

test('bootstrapEntity pages across the full module and upserts every record', async () => {
  const rows = Array.from({ length: 450 }, (_, i) => rawStudent(i + 1, '2026-08-01T10:00:00+02:00'));
  const zoho = makeZoho({ Contacts: rows });
  const ds = makeDs();

  const result = await bootstrap.bootstrapEntity(zoho, req, 'students', 'Contacts', ds);

  assert.equal(result.processed, 450);
  assert.equal(result.updated, 450);
  assert.equal(result.failed, 0);
  assert.equal(ds.count('crm_students'), 450);
  // 450 rows at PAGE_SIZE 200 -> 3 pages (200, 200, 50), plus no trailing
  // empty-page call since the last page is short.
  assert.equal(zoho.calls.length, 3);
});

test('bootstrapEntity records completion in sync_state with a checkpoint at the max Modified_Time seen', async () => {
  const rows = [
    rawStudent(1, '2026-08-01T10:00:00+02:00'),
    rawStudent(2, '2026-08-03T10:00:00+02:00'), // latest
    rawStudent(3, '2026-08-02T10:00:00+02:00')
  ];
  const zoho = makeZoho({ Contacts: rows });
  const ds = makeDs();

  await bootstrap.bootstrapEntity(zoho, req, 'students', 'Contacts', ds);

  const state = ds.syncStateRow('crm.contacts');
  assert.equal(state.sync_status, 'completed');
  assert.equal(state.records_processed, 3);
  assert.equal(state.records_updated, 3);
  assert.equal(state.records_failed, 0);
  assert.equal(state.checkpoint, '2026-08-03T10:00:00+02:00');
});

test('a record missing an id is counted as failed, not fatal to the rest of the run', async () => {
  const rows = [
    rawStudent(1, '2026-08-01T10:00:00+02:00'),
    { First_Name: 'No Id At All', Modified_Time: '2026-08-01T10:00:00+02:00' },
    rawStudent(3, '2026-08-01T10:00:00+02:00')
  ];
  const zoho = makeZoho({ Contacts: rows });
  const ds = makeDs();

  const result = await bootstrap.bootstrapEntity(zoho, req, 'students', 'Contacts', ds);

  assert.equal(result.processed, 3);
  assert.equal(result.updated, 2);
  assert.equal(result.failed, 1);
  assert.equal(ds.count('crm_students'), 2);
});

test('a failure reading the CRM module itself is fatal and marks sync_state failed', async () => {
  const zoho = makeZoho({}); // 'Boom' module is not seeded, crmQuery throws for it
  const ds = makeDs();

  await assert.rejects(() => bootstrap.bootstrapEntity(zoho, req, 'students', 'Boom', ds));

  const state = ds.syncStateRow('crm.contacts');
  assert.equal(state.sync_status, 'failed');
});

test('re-running bootstrap on the same data is safe: no duplicate rows, no rows wiped', async () => {
  const rows = [rawStudent(1, '2026-08-01T10:00:00+02:00'), rawStudent(2, '2026-08-01T10:00:00+02:00')];
  const zoho = makeZoho({ Contacts: rows });
  const ds = makeDs();

  await bootstrap.bootstrapEntity(zoho, req, 'students', 'Contacts', ds);
  assert.equal(ds.count('crm_students'), 2);

  // Re-run from scratch, as if bootstrap were invoked again after a partial
  // failure or just as a retry.
  const result = await bootstrap.bootstrapEntity(zoho, req, 'students', 'Contacts', ds);
  assert.equal(ds.count('crm_students'), 2); // still 2, not 4
  assert.equal(result.processed, 2);
});

test('bootstrapAll runs every entity in order and totals correctly via runBootstrap', async () => {
  const zoho = makeZoho({
    Contacts: [rawStudent(1, '2026-08-01T10:00:00+02:00')],
    Deals: [],
    Products: [],
    Intakes: [],
    Enrolments: []
  });
  const ds = makeDs();

  const { data, meta, audit } = await bootstrap.runBootstrap({ zoho, ds }, req);

  assert.equal(data.length, 5);
  assert.equal(meta.totals.processed, 1);
  assert.equal(meta.totals.failed, 0);
  assert.equal(audit.result, 'success');
  assert.equal(audit.action, 'bootstrap-sync');
});

test('flattening stays wired correctly end to end through the real projections module', async () => {
  const zoho = makeZoho({ Contacts: [{ ...rawStudent(1, '2026-08-01T10:00:00+02:00'), Student_Status: 'Applicant' }] });
  const ds = makeDs();
  await bootstrap.bootstrapEntity(zoho, req, 'students', 'Contacts', ds);
  const row = await projections.upsertProjectionRow(req, 'students', rawStudent(1, '2026-08-01T10:00:00+02:00'), ds);
  // Same Modified_Time as what's already stored -> harmless re-upsert, not an error.
  assert.equal(row, 'updated');
});
