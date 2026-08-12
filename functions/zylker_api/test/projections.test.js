'use strict';
/**
 * Projection flattening and idempotent upsert, exercised against a fake
 * Datastore (see kickoff-prompt.md §4: "a duplicate or out-of-order Signals
 * event is harmless and cannot overwrite newer data with older" and
 * "reconciliation doesn't overwrite a newer row with stale data" — both of
 * those rules live in upsertProjectionRow, shared by every sync path).
 *
 * Run with:  node --test functions/zylker_api/test/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const projections = require('../projections.js');

/* ----------------------------- fake Datastore ---------------------------- */

function makeDs() {
  const tables = new Map(); // tableName -> Map(ROWID -> row)
  let nextRowId = 1;
  const rowsOf = (t) => { if (!tables.has(t)) tables.set(t, new Map()); return tables.get(t); };

  return {
    tables,
    async zcql(req, query) {
      const tableMatch = /from\s+(\w+)/.exec(query);
      const table = tableMatch[1];
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
      const existing = rowsOf(table).get(row.ROWID);
      const merged = { ...existing, ...row };
      rowsOf(table).set(row.ROWID, merged);
      return merged;
    },
    rowFor(table, crmId) {
      return [...rowsOf(table).values()].find((r) => r.crm_id === crmId);
    },
    count(table) {
      return rowsOf(table).size;
    }
  };
}

const req = {}; // ds is faked, so the request object is never actually used

/* --------------------------------- fixtures ------------------------------- */

const rawStudent = {
  id: '111', First_Name: 'Ada', Last_Name: 'Lovelace', Email: 'ada@example.com',
  Student_ID: 'STU-1', Student_Status: 'Applicant', Modified_Time: '2026-08-01T10:00:00+02:00'
};

const rawApplication = {
  id: '222', Deal_Name: 'Ada — MSc CS', Stage: 'Application Received',
  Contact_Name: { id: '111', name: 'Ada Lovelace' },
  Programme: { id: '333', name: 'MSc Computer Science' },
  Intake: { id: '444', name: 'Autumn 2026' },
  Amount: '9500.5', Modified_Time: '2026-08-01T10:00:00+02:00'
};

const rawProgramme = {
  id: '333', Product_Name: 'MSc Computer Science', Delivery_Mode: ['Online', 'On campus'],
  Product_Active: true, Modified_Time: '2026-08-01T10:00:00+02:00'
};

/* ---------------------------------- tests --------------------------------- */

test('flattening mirrors normalise.js: lookups become _id/_name pairs', () => {
  const row = projections.buildRow('applications', rawApplication);
  assert.equal(row.student_id, '111');
  assert.equal(row.student_name, 'Ada Lovelace');
  assert.equal(row.programme_id, '333');
  assert.equal(row.intake_id, '444');
  assert.equal(row.tuition_fee, 9500.5);
});

test('a missing lookup flattens to null id/name, not a thrown error', () => {
  const row = projections.buildRow('applications', { id: '9', Deal_Name: 'X', Modified_Time: '2026-01-01T00:00:00+00:00' });
  assert.equal(row.student_id, null);
  assert.equal(row.student_name, null);
});

test('an array deliveryMode is stored as a JSON string column', () => {
  const row = projections.buildRow('programmes', rawProgramme);
  assert.equal(row.delivery_mode_json, JSON.stringify(['Online', 'On campus']));
  assert.equal(row.active, true);
});

test('a record with no id is refused before any Datastore call', async () => {
  const ds = makeDs();
  await assert.rejects(
    () => projections.upsertProjectionRow(req, 'students', { First_Name: 'No Id' }, ds),
    /no id/i
  );
  assert.equal(ds.count('crm_students'), 0);
});

test('upsertProjectionRow inserts a new row when none exists for that crm_id', async () => {
  const ds = makeDs();
  const result = await projections.upsertProjectionRow(req, 'students', rawStudent, ds);
  assert.equal(result, 'inserted');
  const row = ds.rowFor('crm_students', '111');
  assert.equal(row.first_name, 'Ada');
  assert.equal(row.source_modified_time, '2026-08-01T10:00:00+02:00');
  assert.ok(row.synced_at);
});

test('upsertProjectionRow updates in place when the incoming record is newer', async () => {
  const ds = makeDs();
  await projections.upsertProjectionRow(req, 'students', rawStudent, ds);
  const newer = { ...rawStudent, Student_Status: 'Enrolled', Modified_Time: '2026-08-02T10:00:00+02:00' };
  const result = await projections.upsertProjectionRow(req, 'students', newer, ds);
  assert.equal(result, 'updated');
  assert.equal(ds.count('crm_students'), 1); // no duplicate row
  assert.equal(ds.rowFor('crm_students', '111').student_status, 'Enrolled');
});

test('a duplicate or out-of-order event is harmless: an older Modified_Time never overwrites a newer stored row', async () => {
  const ds = makeDs();
  const newer = { ...rawStudent, Student_Status: 'Enrolled', Modified_Time: '2026-08-02T10:00:00+02:00' };
  await projections.upsertProjectionRow(req, 'students', newer, ds);

  // A late/duplicate delivery of the OLDER event arrives after the newer one
  // already landed — must not clobber it.
  const result = await projections.upsertProjectionRow(req, 'students', rawStudent, ds);
  assert.equal(result, 'skipped-stale');
  assert.equal(ds.rowFor('crm_students', '111').student_status, 'Enrolled');
  assert.equal(ds.count('crm_students'), 1);
});

test('an exact duplicate event (same Modified_Time) is a harmless no-op update, not a skip', async () => {
  const ds = makeDs();
  await projections.upsertProjectionRow(req, 'students', rawStudent, ds);
  const result = await projections.upsertProjectionRow(req, 'students', { ...rawStudent }, ds);
  assert.equal(result, 'updated');
  assert.equal(ds.count('crm_students'), 1);
});
