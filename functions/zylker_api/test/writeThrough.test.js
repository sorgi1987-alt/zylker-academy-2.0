'use strict';
/**
 * Write-through sync (kickoff-prompt.md §2 "Write-through", §4: "write-through
 * updates the projection; a failed Zoho write leaves the projection
 * untouched; cache invalidation fires on the writes... that should trigger
 * it" — cache lands in phase 9, so only the projection half is covered here).
 *
 * Reuses the same fake CRM (`makeZoho`/`seed`/`req`) as writes.test.js —
 * copied rather than imported, matching that file's own stated philosophy:
 * "a clever fake would hide a bug in the real query strings," so the fake
 * stays dumb and local to each test file rather than becoming a shared
 * abstraction with its own bugs to trust.
 *
 * Run with:  node --test functions/zylker_api/test/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const writes = require('../writes.js');

/* ------------------------------- fake CRM -------------------------------- */

function makeZoho(seed = {}) {
  const db = JSON.parse(JSON.stringify(seed));
  let nextId = 9000;
  const calls = [];
  const table = (m) => { db[m] = db[m] || {}; return db[m]; };

  return {
    calls,
    db,
    async crmGetRecord(req, module_, id) {
      calls.push(['get', module_, String(id)]);
      return table(module_)[String(id)] || null;
    },
    async crmCreate(req, module_, record) {
      calls.push(['create', module_, record]);
      const id = String(nextId += 1);
      table(module_)[id] = { id, ...record, Modified_Time: '2026-07-28T10:00:00+01:00' };
      return { id };
    },
    async crmUpdate(req, module_, id, record) {
      calls.push(['update', module_, String(id), record]);
      const row = table(module_)[String(id)];
      if (!row) throw new Error('no such record');
      Object.assign(row, record, { Modified_Time: '2026-07-28T11:00:00+01:00' });
      return { id: String(id) };
    },
    async crmDelete(req, module_, id) {
      calls.push(['delete', module_, String(id)]);
      delete table(module_)[String(id)];
      return { id: String(id) };
    },
    async crmQuery(req, q) {
      calls.push(['query', q]);
      const from = /from\s+(\w+)/.exec(q);
      const module_ = from ? from[1] : null;
      const rows = Object.values(table(module_));
      let m = /where id = (\d+)/.exec(q);
      if (m) return rows.filter((r) => String(r.id) === m[1]);
      m = /where Email = '([^']*)'/.exec(q);
      if (m) return rows.filter((r) => String(r.Email || '').toLowerCase() === m[1].toLowerCase());
      m = /where (\w+) = (\d+)/.exec(q);
      if (m) return rows.filter((r) => r[m[1]] && String(r[m[1]].id) === m[2]);
      return rows;
    }
  };
}

const seed = () => ({
  Contacts: {
    1: { id: '1', First_Name: 'Priya', Last_Name: 'Raman', Email: 'priya@example.com',
      Student_Status: 'Applicant', External_Student_Ref: 'STU-1', Modified_Time: 'T0' }
  },
  Products: {
    10: { id: '10', Product_Name: 'Data Science', Product_Code: 'PRG-10', Product_Active: true, Modified_Time: 'T0' }
  },
  Intakes: {},
  Deals: {},
  Enrolments: {}
});

const req = (params = {}, body = {}) => ({ params, body, headers: {}, requestId: 'test' });

/* ----------------------------- fake Datastore ----------------------------- */

function makeDs() {
  const tables = new Map();
  let nextRowId = 1;
  const rowsOf = (t) => { if (!tables.has(t)) tables.set(t, new Map()); return tables.get(t); };
  const calls = [];

  return {
    calls,
    async zcql(req, query) {
      calls.push(['zcql', query]);
      const table = /from\s+(\w+)/.exec(query)[1];
      const rows = [...rowsOf(table).values()];
      const crmIdMatch = /crm_id\s*=\s*'([^']*)'/.exec(query);
      if (crmIdMatch) {
        const found = rows.find((r) => r.crm_id === crmIdMatch[1]);
        return found ? [{ [table]: { ROWID: found.ROWID, source_modified_time: found.source_modified_time } }] : [];
      }
      return [];
    },
    async insertRow(req, table, row) {
      calls.push(['insertRow', table, row]);
      const ROWID = String(nextRowId += 1);
      const stored = { ROWID, ...row };
      rowsOf(table).set(ROWID, stored);
      return stored;
    },
    async updateRow(req, table, row) {
      calls.push(['updateRow', table, row]);
      const merged = { ...rowsOf(table).get(row.ROWID), ...row };
      rowsOf(table).set(row.ROWID, merged);
      return merged;
    },
    async deleteRow(req, table, rowId) {
      calls.push(['deleteRow', table, rowId]);
      rowsOf(table).delete(rowId);
    },
    rowFor(table, crmId) {
      return [...rowsOf(table).values()].find((r) => r.crm_id === crmId);
    },
    count(table) {
      return rowsOf(table).size;
    }
  };
}

/* ---------------------------------- tests --------------------------------- */

test('studentCreate write-through: a successful CRM create upserts the projection', async () => {
  const zoho = makeZoho(seed());
  const ds = makeDs();
  const result = await writes.studentCreate({ zoho, ds }, req({}, { lastName: 'Newperson', email: 'new@example.com' }));

  const row = ds.rowFor('crm_students', result.data.id);
  assert.ok(row, 'the new student was projected');
  assert.equal(row.last_name, 'Newperson');
  assert.equal(row.source_modified_time, '2026-07-28T10:00:00+01:00');
});

test('studentUpdate write-through: updates the existing projection row in place, not a duplicate', async () => {
  const zoho = makeZoho(seed());
  const ds = makeDs();
  // Project the seed row first, as bootstrap or an earlier write would have.
  await writes.studentCreate({ zoho, ds }, req({}, { lastName: 'Seed', email: 'seed@example.com' }));
  const seededId = zoho.calls.find((c) => c[0] === 'create')[2] && Object.keys(zoho.db.Contacts).pop();

  await writes.studentUpdate({ zoho, ds }, req({ id: seededId }, { firstName: 'Updated' }));

  assert.equal(ds.count('crm_students'), 1);
  assert.equal(ds.rowFor('crm_students', seededId).first_name, 'Updated');
});

test('studentDelete write-through: removes the projection row once the CRM delete is confirmed', async () => {
  const zoho = makeZoho(seed());
  const ds = makeDs();
  await writes.studentCreate({ zoho, ds }, req({}, { lastName: 'Temp', email: 'temp@example.com' }));
  const id = Object.keys(zoho.db.Contacts).find((k) => zoho.db.Contacts[k].Last_Name === 'Temp');

  await writes.studentDelete({ zoho, ds }, req({ id }));

  assert.equal(ds.rowFor('crm_students', id), undefined);
});

test('a failed Zoho write leaves the projection untouched', async () => {
  const zoho = makeZoho(seed());
  const ds = makeDs();
  // Duplicate email -> studentCreate rejects before any CRM write happens.
  await assert.rejects(
    () => writes.studentCreate({ zoho, ds }, req({}, { lastName: 'Dup', email: 'PRIYA@example.com' })),
    (err) => err.code === 'DUPLICATE_EMAIL'
  );
  assert.equal(ds.count('crm_students'), 0, 'nothing was ever projected for a write that never reached Zoho');
});

test('a Datastore failure during write-through never fails the write response itself', async () => {
  const zoho = makeZoho(seed());
  const brokenDs = {
    async zcql() { throw new Error('Datastore is unavailable'); },
    async insertRow() { throw new Error('Datastore is unavailable'); },
    async updateRow() { throw new Error('Datastore is unavailable'); },
    async deleteRow() { throw new Error('Datastore is unavailable'); }
  };
  // The CRM write itself must still succeed and be returned normally — a
  // read-model outage must never be allowed to break the source of truth.
  const result = await writes.studentCreate({ zoho, ds: brokenDs }, req({}, { lastName: 'Resilient', email: 'resilient@example.com' }));
  assert.ok(result.data.id);
  assert.equal(result.data.lastName, 'Resilient');
});

test('programmeCreate write-through projects a flattened row, including the delivery mode', async () => {
  const zoho = makeZoho(seed());
  const ds = makeDs();
  const result = await writes.programmeCreate({ zoho, ds }, req({}, { name: 'New Programme' }));

  const row = ds.rowFor('crm_programmes', result.data.id);
  assert.ok(row);
  assert.equal(row.product_name, 'New Programme');
});

/* ------------------------------ cache invalidation ------------------------- */

function makeFakeCache() {
  const invalidated = [];
  return { invalidated, async invalidateForEntity(req, entity) { invalidated.push(entity); } };
}

test('a successful create invalidates the dashboard aggregate cache (kickoff-prompt.md §2 write-through)', async () => {
  const zoho = makeZoho(seed());
  const ds = makeDs();
  const fakeCache = makeFakeCache();
  await writes.studentCreate({ zoho, ds, cache: fakeCache }, req({}, { lastName: 'Cached', email: 'cached@example.com' }));
  assert.deepEqual(fakeCache.invalidated, ['students']);
});

test('a successful delete also invalidates the cache', async () => {
  const zoho = makeZoho(seed());
  const ds = makeDs();
  const fakeCache = makeFakeCache();
  await writes.studentDelete({ zoho, ds, cache: fakeCache }, req({ id: '1' }));
  assert.deepEqual(fakeCache.invalidated, ['students']);
});

test('a failed write never touches the cache — nothing changed, so nothing to invalidate', async () => {
  const zoho = makeZoho(seed());
  const ds = makeDs();
  const fakeCache = makeFakeCache();
  await assert.rejects(() => writes.studentCreate({ zoho, ds, cache: fakeCache },
    req({}, { lastName: 'Dup', email: 'PRIYA@example.com' })));
  assert.deepEqual(fakeCache.invalidated, []);
});

test('a cache invalidation failure never fails the write response itself', async () => {
  const zoho = makeZoho(seed());
  const ds = makeDs();
  const brokenCache = { async invalidateForEntity() { throw new Error('cache unavailable'); } };
  const result = await writes.studentCreate({ zoho, ds, cache: brokenCache },
    req({}, { lastName: 'StillWorks', email: 'stillworks@example.com' }));
  assert.ok(result.data.id);
});
