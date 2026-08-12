'use strict';
/**
 * Signals event handler (kickoff-prompt.md §2a, §4: "a duplicate or
 * out-of-order Signals event is harmless and cannot overwrite newer data
 * with older"). Exercised against a fake Datastore — no live Catalyst
 * session, no live Signals subscription (none exists yet; see signals.js's
 * own header comment on what is and isn't verified about the payload
 * shape).
 *
 * Run with:  node --test functions/zylker_api/test/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const signals = require('../signals.js');

/* ----------------------------- fake Datastore ----------------------------- */

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
    async deleteRow(req, table, rowId) {
      rowsOf(table).delete(rowId);
    },
    rowFor(table, crmId) {
      return [...rowsOf(table).values()].find((r) => r.crm_id === crmId);
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

const crmEvent = (apiName, data) => ({
  data,
  id: 'evt-1',
  time_in_ms: Date.now(),
  source: 'publisher_id:x/service:zohocrm/account:y',
  event_config: { api_name: apiName, id: 'cfg-1' }
});

/* ------------------------------- parseEventConfig ------------------------- */

test('parseEventConfig resolves "<Module> Created/Updated/Deleted" to an entity + action', () => {
  assert.deepEqual(signals.parseEventConfig('Contacts Created'), { entity: 'students', action: 'created' });
  assert.deepEqual(signals.parseEventConfig('Deals Updated'), { entity: 'applications', action: 'updated' });
  assert.deepEqual(signals.parseEventConfig('Enrolments Deleted'), { entity: 'enrolments', action: 'deleted' });
});

test('parseEventConfig returns null for an unrecognised module or malformed name — fails safe, never guesses', () => {
  assert.equal(signals.parseEventConfig('Leads Created'), null); // not one of our 5 projected modules
  assert.equal(signals.parseEventConfig('garbage'), null);
  assert.equal(signals.parseEventConfig(''), null);
  assert.equal(signals.parseEventConfig(undefined), null);
});

/* -------------------------------- processEvent ----------------------------- */

test('a create/update event upserts the projection directly from event.data, no extra fetch', async () => {
  const ds = makeDs();
  const event = crmEvent('Contacts Created', {
    id: '111', First_Name: 'Ada', Last_Name: 'Lovelace', Modified_Time: '2026-08-12T10:00:00+02:00'
  });
  const result = await signals.processEvent(req, event, ds);

  assert.equal(result.outcome, 'inserted');
  assert.equal(ds.rowFor('crm_students', '111').first_name, 'Ada');
});

test('a delete event removes the projection row', async () => {
  const ds = makeDs();
  await signals.processEvent(req, crmEvent('Contacts Created', {
    id: '111', First_Name: 'Ada', Modified_Time: '2026-08-12T10:00:00+02:00'
  }), ds);
  assert.ok(ds.rowFor('crm_students', '111'));

  const result = await signals.processEvent(req, crmEvent('Contacts Deleted', { id: '111' }), ds);

  assert.equal(result.outcome, 'deleted');
  assert.equal(ds.rowFor('crm_students', '111'), undefined);
});

test('a delete event for a row never projected is a harmless no-op', async () => {
  const ds = makeDs();
  const result = await signals.processEvent(req, crmEvent('Contacts Deleted', { id: '999' }), ds);
  assert.equal(result.outcome, 'delete-noop');
});

test('an unrecognised event is reported, not thrown', async () => {
  const ds = makeDs();
  const result = await signals.processEvent(req, crmEvent('Tasks Created', { id: '1' }), ds);
  assert.equal(result.outcome, 'unrecognised');
});

test('an event with no record id is reported, not thrown', async () => {
  const ds = makeDs();
  const result = await signals.processEvent(req, crmEvent('Contacts Created', { First_Name: 'No Id' }), ds);
  assert.equal(result.outcome, 'missing-id');
});

test('a duplicate or out-of-order event is harmless: an older event never overwrites newer projected data', async () => {
  const ds = makeDs();
  await signals.processEvent(req, crmEvent('Contacts Created', {
    id: '111', Student_Status: 'Enrolled', Modified_Time: '2026-08-12T12:00:00+02:00'
  }), ds);

  // The same event delivered again (Signals retries), or an earlier event
  // arriving late — either way, must not regress the projection.
  const result = await signals.processEvent(req, crmEvent('Contacts Updated', {
    id: '111', Student_Status: 'Applicant', Modified_Time: '2026-08-12T10:00:00+02:00'
  }), ds);

  assert.equal(result.outcome, 'skipped-stale');
  assert.equal(ds.rowFor('crm_students', '111').student_status, 'Enrolled');
});

test('processing an event touches sync_state.last_event_received_at for that entity', async () => {
  const ds = makeDs();
  await signals.processEvent(req, crmEvent('Contacts Created', {
    id: '111', Modified_Time: '2026-08-12T10:00:00+02:00'
  }), ds);
  assert.ok(ds.syncStateRow('crm.contacts').last_event_received_at);
});

/* ------------------------------- processEnvelope --------------------------- */

test('processEnvelope processes every event in the batch and tallies outcomes', async () => {
  const ds = makeDs();
  const envelope = {
    events: [
      crmEvent('Contacts Created', { id: '1', Modified_Time: '2026-08-12T10:00:00+02:00' }),
      crmEvent('Deals Created', { id: '2', Modified_Time: '2026-08-12T10:00:00+02:00' })
    ]
  };
  const results = await signals.processEnvelope(req, envelope, ds);
  assert.equal(results.length, 2);
  assert.equal(results[0].outcome, 'inserted');
  assert.equal(results[1].outcome, 'inserted');
});

test('a payload with no events array is rejected as not a Signals envelope', async () => {
  const ds = makeDs();
  await assert.rejects(
    () => signals.processEnvelope(req, { foo: 'bar' }, ds),
    (err) => err.status === 400
  );
});

test('one bad event in a batch does not stop the rest from processing', async () => {
  const ds = makeDs();
  const envelope = {
    events: [
      crmEvent('Contacts Created', { id: '1', Modified_Time: '2026-08-12T10:00:00+02:00' }),
      { data: { id: '2' }, event_config: null }, // malformed event_config
      crmEvent('Deals Created', { id: '3', Modified_Time: '2026-08-12T10:00:00+02:00' })
    ]
  };
  const results = await signals.processEnvelope(req, envelope, ds);
  assert.equal(results.length, 3);
  assert.equal(results[0].outcome, 'inserted');
  assert.equal(results[2].outcome, 'inserted');
  assert.ok(ds.rowFor('crm_students', '1'));
  assert.ok(ds.rowFor('crm_applications', '3'));
});
