'use strict';
/**
 * Workflow, notes and permission rules added for the record workspaces.
 *
 * These cover the claims the UI makes on a user's behalf: which stages are
 * shown as passed, which optional values a transition may write, that a comment
 * never reaches CRM, and that recording a note is a distinct permission from
 * changing a record.
 *
 * Run with:  node --test functions/zylker_api/test/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const writes = require('../writes.js');
const perms = require('../permissions.js');

/* ------------------------------- fake CRM -------------------------------- */

function makeZoho(seed = {}) {
  const db = JSON.parse(JSON.stringify(seed));
  const calls = [];
  const table = (m) => { db[m] = db[m] || {}; return db[m]; };
  let nextId = 8000;
  return {
    calls,
    db,
    async crmGetRecord(req, m, id) { calls.push(['get', m, String(id)]); return table(m)[String(id)] || null; },
    async crmCreate(req, m, record) {
      calls.push(['create', m, record]);
      const id = String(nextId += 1);
      table(m)[id] = { id, ...record, Modified_Time: 'T2' };
      return { id };
    },
    async crmUpdate(req, m, id, record) {
      calls.push(['update', m, String(id), record]);
      Object.assign(table(m)[String(id)], record, { Modified_Time: 'T2' });
      return { id: String(id) };
    },
    async crmDelete(req, m, id) { calls.push(['delete', m, String(id)]); delete table(m)[String(id)]; return { id }; },
    async crmQuery(req, q) {
      calls.push(['query', q]);
      const from = /from\s+(\w+)/.exec(q);
      return Object.values(table(from ? from[1] : null));
    }
  };
}

const req = (params = {}, body = {}) => ({ params, body, principal: { id: 'u1', email: 'a@b.c', role: 'admissions' } });

const seed = () => ({
  Contacts: { 1: { id: '1', First_Name: 'Aoife', Last_Name: 'Murphy', Email: 'a@b.c', Modified_Time: 'T1' } },
  Deals: {
    30: {
      id: '30', Deal_Name: 'Murphy — MSc', Stage: 'Under Review', Pipeline: 'Student Admissions',
      Contact_Name: { id: '1', name: 'Aoife Murphy' }, Modified_Time: 'T1'
    }
  },
  Enrolments: {}
});

/* ------------------------------- the tests -------------------------------- */

test('completed stages come from position in the pipeline, and exits claim nothing', () => {
  assert.deepEqual(writes.completedStages('Submitted'), [],
    'the first step has nothing behind it');
  assert.deepEqual(writes.completedStages('Offer Issued'),
    ['Submitted', 'Under Review', 'Documents Pending']);
  assert.deepEqual(writes.completedStages('Enrolled'),
    ['Submitted', 'Under Review', 'Documents Pending', 'Offer Issued', 'Offer Accepted']);

  // An application that left the pipeline is not claimed to have passed any of
  // it — a tracker showing Rejected as a step after Offer Accepted would be
  // describing a process that does not exist.
  assert.deepEqual(writes.completedStages('Rejected'), []);
  assert.deepEqual(writes.completedStages('Withdrawn'), []);
  assert.deepEqual(writes.completedStages(null), []);

  // Exits are not steps.
  writes.EXIT_STAGES.forEach((s) => {
    assert.equal(writes.PIPELINE_ORDER.includes(s), false, `${s} must not be a pipeline step`);
  });
});

test('a transition comment is never written to CRM — it rides on the audit entry', async () => {
  const zoho = makeZoho(seed());
  const r = await writes.applicationTransition({ zoho }, req(
    { id: '30' },
    { toStage: 'Offer Issued', comment: 'Referee reference still outstanding.' }
  ));

  const update = zoho.calls.find((c) => c[0] === 'update' && c[1] === 'Deals');
  assert.ok(update, 'the stage should have been written');
  const payload = update[3];
  assert.equal(payload.Stage, 'Offer Issued');
  assert.equal('comment' in payload, false, 'a comment must not be sent to CRM');
  assert.equal('Comment' in payload, false);
  assert.equal('followUpDate' in payload, false, 'no invented field may be sent');
  assert.equal('responsibleStaff' in payload, false);

  assert.equal(r.audit.note, 'Referee reference still outstanding.',
    'the comment belongs on the audit entry');
});

test('a supplied decision date is used, and only on a decision stage', async () => {
  const zoho = makeZoho(seed());
  await writes.applicationTransition({ zoho }, req(
    { id: '30' }, { toStage: 'Offer Issued', decisionDate: '2026-07-15' }
  ));
  const payload = zoho.calls.find((c) => c[0] === 'update')[3];
  assert.equal(payload.Decision_Date, '2026-07-15');

  // Moving to a non-decision stage records no decision date at all.
  const zoho2 = makeZoho(seed());
  zoho2.db.Deals['30'].Stage = 'Submitted';
  await writes.applicationTransition({ zoho: zoho2 }, req(
    { id: '30' }, { toStage: 'Under Review', decisionDate: '2026-07-15' }
  ));
  const payload2 = zoho2.calls.find((c) => c[0] === 'update')[3];
  assert.equal('Decision_Date' in payload2, false,
    'Under Review is not a decision, so no decision date is invented');
});

test('an impossible decision date is refused rather than sent to CRM', async () => {
  const zoho = makeZoho(seed());
  await assert.rejects(
    () => writes.applicationTransition({ zoho }, req({ id: '30' }, { toStage: 'Offer Issued', decisionDate: '2026-02-31' })),
    (e) => e.code === 'INVALID_DATE'
  );
  assert.equal(zoho.calls.filter((c) => c[0] === 'update').length, 0, 'nothing should have been written');
});

test('documents status is written only when it was supplied', async () => {
  const zoho = makeZoho(seed());
  await writes.applicationTransition({ zoho }, req(
    { id: '30' }, { toStage: 'Documents Pending', documentsStatus: 'Passport, transcript' }
  ));
  assert.equal(zoho.calls.find((c) => c[0] === 'update')[3].Documents_Status, 'Passport, transcript');

  const zoho2 = makeZoho(seed());
  await writes.applicationTransition({ zoho: zoho2 }, req({ id: '30' }, { toStage: 'Documents Pending' }));
  assert.equal('Documents_Status' in zoho2.calls.find((c) => c[0] === 'update')[3], false,
    'an omitted value must not blank the existing one');
});

test('an internal note touches no CRM record and reports no changed fields', async () => {
  const zoho = makeZoho(seed());
  const r = await writes.noteCreate({ zoho }, req({}, {
    entityType: 'application', recordId: '30', note: 'Called the applicant; no answer.'
  }));

  assert.equal(zoho.calls.some((c) => c[0] === 'update' || c[0] === 'create'), false,
    'recording a note must not write to CRM');
  assert.equal(r.data.recorded, true);
  assert.equal(r.audit.note, 'Called the applicant; no answer.');
  assert.deepEqual(r.audit.changedFields, [], 'nothing changed, so nothing is reported as changed');
  assert.equal(r.audit.action, 'application:note');
});

test('a note is refused against an unknown entity, an empty body or a missing record', async () => {
  const zoho = makeZoho(seed());

  await assert.rejects(
    () => writes.noteCreate({ zoho }, req({}, { entityType: 'invoice', recordId: '1', note: 'x' })),
    (e) => e.code === 'INVALID_ENTITY');

  await assert.rejects(
    () => writes.noteCreate({ zoho }, req({}, { entityType: 'student', recordId: '1', note: '   ' })),
    (e) => e.code === 'EMPTY_NOTE');

  await assert.rejects(
    () => writes.noteCreate({ zoho }, req({}, { entityType: 'student', recordId: '1', note: 'x'.repeat(1001) })),
    (e) => e.code === 'NOTE_TOO_LONG');

  // An orphaned note is worse than a refused one.
  await assert.rejects(
    () => writes.noteCreate({ zoho }, req({}, { entityType: 'student', recordId: '999', note: 'x' })),
    (e) => e.status === 404);
});

test('recording a note is its own permission, not a side door into writing records', () => {
  const { ROLES, P, can } = perms;

  // Read-only roles stay read-only.
  assert.equal(can(ROLES.VIEWER, P.ACTIVITY_WRITE), false);
  assert.equal(can(ROLES.FINANCE, P.ACTIVITY_WRITE), false);

  // The roles that work records may annotate them.
  assert.equal(can(ROLES.ADMISSIONS, P.ACTIVITY_WRITE), true);
  assert.equal(can(ROLES.ACADEMIC, P.ACTIVITY_WRITE), true);
  assert.equal(can(ROLES.ADMINISTRATOR, P.ACTIVITY_WRITE), true);

  // Holding it grants nothing else.
  assert.equal(can(ROLES.ACADEMIC, P.STUDENT_WRITE), false,
    'academic may note a student without being able to edit one');
});
