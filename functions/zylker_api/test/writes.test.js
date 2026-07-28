'use strict';
/**
 * Write-handler rules, exercised against a stubbed Zoho layer.
 *
 * The handlers take `deps.zoho`, so a fake CRM can be substituted whole. Each
 * test asserts an invariant that would otherwise only be observable by
 * corrupting the live org: illegal stage moves, duplicate students, duplicate
 * enrolments on a repeated transition, capacity, and date order.
 *
 * Run with:  node --test functions/zylker_api/test/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const writes = require('../writes.js');

/* ------------------------------- fake CRM ------------------------------- */

/**
 * Minimal in-memory CRM. Records are keyed by module then id; COQL is matched
 * with small regexes covering only the queries the handlers actually issue.
 * Deliberately dumb: a clever fake would hide a bug in the real query strings.
 */
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

      // where id = N
      let m = /where id = (\d+)/.exec(q);
      if (m) return rows.filter((r) => String(r.id) === m[1]);

      // where Email = '...'
      m = /where Email = '([^']*)'/.exec(q);
      if (m) return rows.filter((r) => String(r.Email || '').toLowerCase() === m[1].toLowerCase());

      // where Application = N
      m = /where Application = (\d+)/.exec(q);
      if (m) return rows.filter((r) => r.Application && String(r.Application.id) === m[1]);

      // where <Lookup> = N and Enrolment_Status = '...'
      m = /where (\w+) = (\d+) and Enrolment_Status = '([^']*)'/.exec(q);
      if (m) return rows.filter((r) => r[m[1]] && String(r[m[1]].id) === m[2] && r.Enrolment_Status === m[3]);

      // where Student = N and Programme = N and Intake = N
      m = /where Student = (\d+) and Programme = (\d+) and Intake = (\d+)/.exec(q);
      if (m) {
        return rows.filter((r) => r.Student && String(r.Student.id) === m[1]
          && r.Programme && String(r.Programme.id) === m[2]
          && r.Intake && String(r.Intake.id) === m[3]);
      }

      // where <Lookup> = N
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
    10: { id: '10', Product_Name: 'Data Science', Product_Code: 'PRG-10', Product_Active: true, Modified_Time: 'T0' },
    11: { id: '11', Product_Name: 'Design', Product_Code: 'PRG-11', Product_Active: true, Modified_Time: 'T0' }
  },
  Intakes: {
    20: { id: '20', Name: 'Sept 2026', Programme: { id: '10' }, Capacity: 2, Intake_Status: 'Open', Modified_Time: 'T0' },
    21: { id: '21', Name: 'Jan 2027', Programme: { id: '11' }, Capacity: null, Intake_Status: 'Open', Modified_Time: 'T0' }
  },
  Deals: {
    30: { id: '30', Deal_Name: 'Priya Application', Stage: 'Offer Accepted',
      Contact_Name: { id: '1' }, Programme: { id: '10' }, Intake: { id: '20' },
      External_Application_Ref: 'APP-30', Modified_Time: 'T0' }
  },
  Enrolments: {}
});

const req = (params = {}, body = {}) => ({ params, body, headers: {}, requestId: 'test' });

/* ------------------------------ stage rules ----------------------------- */

test('an illegal stage transition is refused and nothing is written', async () => {
  const zoho = makeZoho(seed());
  // Submitted -> Enrolled is not in the transition table.
  zoho.db.Deals['30'].Stage = 'Submitted';
  await assert.rejects(
    () => writes.applicationTransition({ zoho }, req({ id: '30' }, { toStage: 'Enrolled' })),
    (err) => err.code === 'ILLEGAL_TRANSITION' && err.status === 422
  );
  assert.equal(zoho.calls.filter((c) => c[0] === 'update').length, 0, 'no write should have happened');
});

test('an unknown stage value is refused before any lookup', async () => {
  const zoho = makeZoho(seed());
  await assert.rejects(
    () => writes.applicationTransition({ zoho }, req({ id: '30' }, { toStage: 'Graduated' })),
    (err) => err.code === 'INVALID_STAGE'
  );
});

test('a stale expectedModifiedTime is refused with a conflict', async () => {
  const zoho = makeZoho(seed());
  await assert.rejects(
    () => writes.applicationTransition({ zoho }, req({ id: '30' }, { toStage: 'Enrolled', expectedModifiedTime: 'STALE' })),
    (err) => err.code === 'CONFLICT' && err.status === 409
  );
});

/* -------------------------- enrolment idempotency ----------------------- */

test('repeating the Enrolled transition does not create a second enrolment', async () => {
  const zoho = makeZoho(seed());
  const first = await writes.applicationTransition({ zoho }, req({ id: '30' }, { toStage: 'Enrolled' }));
  assert.equal(first.data.enrolmentCreated, true);
  const enrolmentId = first.data.enrolment.id;
  assert.equal(Object.keys(zoho.db.Enrolments).length, 1);

  // The application is now at Enrolled, which has no onward transitions, so the
  // repeat is refused rather than re-provisioning — either way, still one
  // enrolment, which is the invariant that matters.
  await assert.rejects(
    () => writes.applicationTransition({ zoho }, req({ id: '30' }, { toStage: 'Enrolled' })),
    (err) => err.code === 'ILLEGAL_TRANSITION'
  );
  assert.equal(Object.keys(zoho.db.Enrolments).length, 1, 'still exactly one enrolment');

  // And provisioning called directly a second time reuses the existing record.
  const again = await writes._internals.provisionEnrolment({ zoho }, req(), zoho.db.Deals['30'], {});
  assert.equal(again.created, false, 'the existing enrolment is reused');
  assert.equal(again.enrolment.id, enrolmentId);
  assert.equal(Object.keys(zoho.db.Enrolments).length, 1);
});

test('an enrolled applicant becomes an Active student', async () => {
  const zoho = makeZoho(seed());
  await writes.applicationTransition({ zoho }, req({ id: '30' }, { toStage: 'Enrolled' }));
  assert.equal(zoho.db.Contacts['1'].Student_Status, 'Active');
});

/* ----------------------------- duplicate rules -------------------------- */

test('creating a student with an existing email is refused', async () => {
  const zoho = makeZoho(seed());
  await assert.rejects(
    () => writes.studentCreate({ zoho }, req({}, { lastName: 'Raman', email: 'PRIYA@example.com' })),
    (err) => err.code === 'DUPLICATE_EMAIL' && err.status === 409
  );
});

test('find-or-create reuses a student rather than duplicating them', async () => {
  const zoho = makeZoho(seed());
  const found = await writes._internals.findOrCreateStudentByEmail({ zoho }, req(), 'Priya@Example.com ');
  assert.equal(found.created, false);
  assert.equal(found.id, '1');
  assert.equal(Object.keys(zoho.db.Contacts).length, 1);

  const made = await writes._internals.findOrCreateStudentByEmail({ zoho }, req(), 'new@example.com', { lastName: 'New' });
  assert.equal(made.created, true);
  assert.equal(Object.keys(zoho.db.Contacts).length, 2);
});

/* ------------------------- relationship integrity ----------------------- */

test('an intake belonging to a different programme is refused', async () => {
  const zoho = makeZoho(seed());
  await assert.rejects(
    // Intake 21 belongs to programme 11, not 10.
    () => writes._internals.assertIntakeMatchesProgramme({ zoho }, req(), '21', '10'),
    (err) => err.code === 'INTAKE_PROGRAMME_MISMATCH'
  );
  // The matching pair is accepted.
  await writes._internals.assertIntakeMatchesProgramme({ zoho }, req(), '20', '10');
});

test('creating an application with a mismatched intake is refused', async () => {
  const zoho = makeZoho(seed());
  await assert.rejects(
    () => writes.applicationCreate({ zoho }, req({}, { programmeId: '10', intakeId: '21', studentId: '1' })),
    (err) => err.code === 'INTAKE_PROGRAMME_MISMATCH'
  );
});

test('a student with related records cannot be deleted', async () => {
  const zoho = makeZoho(seed());
  await assert.rejects(
    () => writes.studentDelete({ zoho }, req({ id: '1' })),
    (err) => err.code === 'HAS_RELATED_RECORDS' && err.status === 409
  );
  assert.ok(zoho.db.Contacts['1'], 'the student must still exist');
});

test('a programme with related records cannot be deleted', async () => {
  const zoho = makeZoho(seed());
  await assert.rejects(
    () => writes.programmeDelete({ zoho }, req({ id: '10' })),
    (err) => err.code === 'HAS_RELATED_RECORDS'
  );
  assert.ok(zoho.db.Products['10']);
});

/* -------------------------------- capacity ------------------------------ */

test('capacity is enforced, and only an administrator may override it', async () => {
  const zoho = makeZoho(seed());
  // Fill intake 20 (capacity 2) with two active enrolments.
  zoho.db.Enrolments['40'] = { id: '40', Intake: { id: '20' }, Enrolment_Status: 'Active' };
  zoho.db.Enrolments['41'] = { id: '41', Intake: { id: '20' }, Enrolment_Status: 'Active' };

  await assert.rejects(
    () => writes._internals.assertIntakeCapacity({ zoho }, req(), '20', { allowOverride: false, override: false }),
    (err) => err.code === 'INTAKE_AT_CAPACITY' && err.status === 409
  );

  // The flag alone is not enough: without the permission it is still refused.
  await assert.rejects(
    () => writes._internals.assertIntakeCapacity({ zoho }, req(), '20', { allowOverride: false, override: true }),
    (err) => err.code === 'INTAKE_AT_CAPACITY'
  );

  // With the permission AND the confirmation, it proceeds and says so.
  const r = await writes._internals.assertIntakeCapacity({ zoho }, req(), '20', { allowOverride: true, override: true });
  assert.equal(r.overridden, true);
});

test('a null capacity means unlimited, not zero', async () => {
  const zoho = makeZoho(seed());
  // Intake 21 has Capacity: null.
  const r = await writes._internals.assertIntakeCapacity({ zoho }, req(), '21', {});
  assert.equal(r.enforced, false, 'no limit should be enforced');
});

test('cancelled enrolments do not consume a place', async () => {
  const zoho = makeZoho(seed());
  zoho.db.Enrolments['40'] = { id: '40', Intake: { id: '20' }, Enrolment_Status: 'Cancelled' };
  zoho.db.Enrolments['41'] = { id: '41', Intake: { id: '20' }, Enrolment_Status: 'Withdrawn' };
  const r = await writes._internals.assertIntakeCapacity({ zoho }, req(), '20', {});
  assert.equal(r.used, 0);
});

/* --------------------------------- dates -------------------------------- */

test('an intake whose end date precedes its start date is refused', async () => {
  const zoho = makeZoho(seed());
  await assert.rejects(
    () => writes.intakeCreate({ zoho }, req({}, {
      name: 'Bad dates', programmeId: '10', startDate: '2026-09-01', endDate: '2026-08-01'
    })),
    (err) => err.code === 'INVALID_DATE_RANGE'
  );
});

test('an application deadline before the opening date is refused', async () => {
  const zoho = makeZoho(seed());
  await assert.rejects(
    () => writes.intakeCreate({ zoho }, req({}, {
      name: 'Bad window', programmeId: '10',
      applicationOpenDate: '2026-06-01', applicationDeadline: '2026-05-01'
    })),
    (err) => err.code === 'INVALID_DATE_RANGE'
  );
});

/* ------------------------------- completion ----------------------------- */

test('only an active enrolment can be completed', async () => {
  const zoho = makeZoho(seed());
  zoho.db.Enrolments['40'] = {
    id: '40', Student: { id: '1' }, Intake: { id: '20' },
    Enrolment_Status: 'Cancelled', Modified_Time: 'T0'
  };
  await assert.rejects(
    () => writes.enrolmentComplete({ zoho }, req({ id: '40' }, {})),
    (err) => err.code === 'INVALID_STATE' && err.status === 409
  );
});

test('completing the last active enrolment makes the student an alumnus', async () => {
  const zoho = makeZoho(seed());
  zoho.db.Enrolments['40'] = {
    id: '40', Student: { id: '1' }, Intake: { id: '20' },
    Enrolment_Status: 'Active', Enrolment_Date: '2026-01-10', Modified_Time: 'T0'
  };
  const r = await writes.enrolmentComplete({ zoho }, req({ id: '40' }, {}));
  assert.equal(r.data.status, 'Completed');
  assert.ok(r.data.completionDate, 'a completion date is recorded');
  assert.equal(zoho.db.Contacts['1'].Student_Status, 'Alumni');
});

/* ----------------------- concurrency and field lists --------------------- */

test('the REST field list is sent without the spaces COQL allows', () => {
  const z = require('../zoho.js');
  // COQL tolerates "select id, First_Name from ..."; the record API's `fields`
  // parameter does not — a leading space makes each entry an unknown field.
  assert.equal(
    z.fieldList('id, First_Name, Last_Name, Modified_Time'),
    'id,First_Name,Last_Name,Modified_Time'
  );
  assert.equal(z.fieldList('id,First_Name'), 'id,First_Name');
  assert.equal(z.fieldList('  id ,, First_Name , '), 'id,First_Name');
  assert.equal(z.fieldList(''), '');
  assert.equal(z.fieldList(null), '');
});

test('a record read without a timestamp is a defect, not a conflict', () => {
  const { assertUnchanged } = writes._internals;

  // Opting out is still allowed.
  assertUnchanged({ Modified_Time: 'T1' }, null);
  // Matching timestamps pass.
  assertUnchanged({ Modified_Time: 'T1' }, 'T1');

  // A genuine concurrent edit is a 409 and says so.
  assert.throws(
    () => assertUnchanged({ Modified_Time: 'T2' }, 'T1'),
    (err) => err.status === 409 && err.code === 'CONFLICT'
  );

  // A missing timestamp must NOT masquerade as a conflict — that once made
  // every edit impossible while telling the user to reload.
  assert.throws(
    () => assertUnchanged({ id: '1' }, 'T1'),
    (err) => err.status === 500 && err.code === 'NO_MODIFIED_TIME'
  );
  assert.throws(
    () => assertUnchanged({ id: '1', Modified_Time: null }, 'T1'),
    (err) => err.code === 'NO_MODIFIED_TIME'
  );
});

test('editing a student succeeds when the timestamp matches', async () => {
  const zoho = makeZoho(seed());
  const before = zoho.db.Contacts['1'].Modified_Time;   // 'T0'
  const r = await writes.studentUpdate({ zoho }, req({ id: '1' }, {
    firstName: 'Ines', lastName: 'Duarte',
    email: 'ines@sergiocastanares.com',
    expectedModifiedTime: before
  }));
  assert.equal(r.data.email, 'ines@sergiocastanares.com');
  assert.equal(zoho.db.Contacts['1'].Email, 'ines@sergiocastanares.com');
});

/* --------------------------- date validation ---------------------------- */

test('an implausible year is refused before it reaches CRM', async () => {
  const zoho = makeZoho(seed());
  // Verified against the live CRM org: Closing_Date '0006-08-23' returns
  // INVALID_DATA with HTTP 400 and no field name in the message. Catching it
  // here turns that into something actionable.
  await assert.rejects(
    () => writes.applicationCreate({ zoho }, req({}, {
      programmeId: '10', studentId: '1', closingDate: '0006-08-23'
    })),
    (err) => err.code === 'INVALID_DATE' && /implausible year/.test(err.message)
  );
  assert.equal(zoho.calls.filter((c) => c[0] === 'create').length, 0, 'nothing should have been written');
});

test('a malformed or impossible date is refused', async () => {
  const { dateOrNull } = writes._internals;
  assert.equal(dateOrNull('', 'X'), null, 'blank is allowed and means "not set"');
  assert.equal(dateOrNull('2026-07-13', 'X'), '2026-07-13');

  assert.throws(() => dateOrNull('13/07/2026', 'Application date'), /YYYY-MM-DD/);
  assert.throws(() => dateOrNull('2026-7-3', 'Application date'), /YYYY-MM-DD/);
  assert.throws(() => dateOrNull('0006-08-23', 'Application date'), /implausible year/);
  assert.throws(() => dateOrNull('2026-02-31', 'Application date'), /not a real calendar date/);
  assert.throws(() => dateOrNull('2026-13-01', 'Application date'), /not a real calendar date/);
});

test('CRM validation failures name the offending field instead of just a status', () => {
  const z = require('../zoho.js');

  // The whole-request 400 shape.
  const bare = z.safeError({
    response: {
      status: 400,
      data: { code: 'INVALID_DATA', details: { api_name: 'Closing_Date', expected_data_type: 'date' } }
    }
  }, 'crm');
  assert.equal(bare.code, 'INVALID_DATA');
  assert.equal(bare.field, 'Closing_Date');
  assert.match(bare.detail, /Closing_Date/);
  assert.match(bare.detail, /expected a date/);
  assert.doesNotMatch(bare.detail, /HTTP 400/, 'the status code alone is not a useful message');

  // The per-record envelope shape.
  const wrapped = z.safeError({
    response: {
      status: 400,
      data: { data: [{ code: 'MANDATORY_NOT_FOUND', details: { api_name: 'Last_Name' }, status: 'error' }] }
    }
  }, 'crm');
  assert.equal(wrapped.field, 'Last_Name');
  assert.match(wrapped.detail, /requires a value in "Last_Name"/);

  // An error body carrying no code still degrades to something safe.
  const unknown = z.safeError({ response: { status: 400, data: { nope: true } } }, 'crm');
  assert.equal(unknown.detail, 'Upstream returned HTTP 400.');

  // And a credential must never survive into a message.
  const leaky = z.safeError({ message: 'failed with token abcdefghijklmnopqrstuvwxyz0123456789' }, 'crm');
  assert.match(leaky.detail, /\[redacted\]/);
});

/* ------------------------- payload allow-listing ------------------------ */

test('unknown fields in a request body never reach the CRM payload', async () => {
  const zoho = makeZoho(seed());
  await writes.studentCreate({ zoho }, req({}, {
    lastName: 'Allowed',
    email: 'allowed@example.com',
    // None of these are in any allow-list.
    Owner: { id: 'attacker' },
    Student_Status: 'Active',
    id: '1',
    External_Student_Ref: 'DEMO-INJECTED'
  }));
  const created = zoho.calls.find((c) => c[0] === 'create' && c[1] === 'Contacts')[2];
  assert.deepEqual(
    Object.keys(created).sort(),
    ['Email', 'External_Student_Ref', 'Last_Name', 'Student_Status'].sort()
  );
  assert.equal(created.Student_Status, 'Applicant', 'a raw Student_Status is not honoured');
  assert.notEqual(created.External_Student_Ref, 'DEMO-INJECTED', 'the reference is server-minted');
});
