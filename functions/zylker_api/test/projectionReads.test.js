'use strict';
/**
 * Round-trip fidelity for the read-model PoC's read path
 * (kickoff-prompt.md §2 "Read path": "Keep the existing response shape
 * exactly — the frontend must not need to change").
 *
 * For each entity: normalise.js(rawCrmRecord) must equal
 * projectionReads.hydrateX(projections.buildRow(entity, rawCrmRecord)) —
 * i.e. flattening a live CRM record into a Datastore row and then hydrating
 * it back must reconstruct exactly what the live-read path already returns.
 * This is what actually guarantees Phase 4/5 are invisible to the frontend,
 * not just a claim in a comment.
 *
 * Run with:  node --test functions/zylker_api/test/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const normalise = require('../normalise.js');
const projections = require('../projections.js');
const reads = require('../projectionReads.js');

function roundTrip(entity, rawRecord) {
  const row = projections.buildRow(entity, rawRecord);
  return reads.HYDRATORS[entity](row);
}

test('student round-trips exactly through flatten -> hydrate', () => {
  const raw = {
    id: '111', First_Name: 'Ada', Last_Name: 'Lovelace', Email: 'ada@example.com',
    Student_ID: 'STU-1', Student_Status: 'Applicant', External_Student_Ref: 'STU-REF-1',
    LMS_Provider: 'Moodle', LMS_User_ID: 'lms-9', Last_LMS_Sync: '2026-08-01T09:00:00+02:00',
    Created_Time: '2026-07-01T09:00:00+02:00', Modified_Time: '2026-08-01T10:00:00+02:00'
  };
  assert.deepEqual(roundTrip('students', raw), normalise.student(raw));
});

test('student with every optional field absent round-trips exactly (all nulls, not undefined-vs-null drift)', () => {
  const raw = { id: '112', Modified_Time: '2026-08-01T10:00:00+02:00' };
  assert.deepEqual(roundTrip('students', raw), normalise.student(raw));
});

test('application round-trips exactly, including all three lookups', () => {
  const raw = {
    id: '222', Deal_Name: 'Ada — MSc CS', Application_ID: 'APP-1', External_Application_Ref: 'APP-REF-1',
    Stage: 'Application Received', Pipeline: 'Admissions',
    Contact_Name: { id: '111', name: 'Ada Lovelace' },
    Programme: { id: '333', name: 'MSc Computer Science' },
    Intake: { id: '444', name: 'Autumn 2026' },
    Application_Date: '2026-06-01', Closing_Date: '2026-07-01', Decision_Date: null,
    Amount: '9500.5', Documents_Status: 'Complete', Preferred_Study_Mode: 'On campus',
    Modified_Time: '2026-08-01T10:00:00+02:00'
  };
  assert.deepEqual(roundTrip('applications', raw), normalise.application(raw));
});

test('application with no lookups resolved round-trips to null lookups, not thrown errors', () => {
  const raw = { id: '223', Deal_Name: 'Orphan', Modified_Time: '2026-08-01T10:00:00+02:00' };
  assert.deepEqual(roundTrip('applications', raw), normalise.application(raw));
});

test('programme round-trips exactly, including the Delivery_Mode array and Product_Code as its meta.reference', () => {
  const raw = {
    id: '333', Product_Name: 'MSc Computer Science', Product_Code: 'MSC-CS',
    Programme_Status: 'Active', Academic_Level: 'Postgraduate', Department: 'Computing',
    Duration_Value: '2', Duration_Unit: 'Years', Delivery_Mode: ['Online', 'On campus'],
    Unit_Price: '9500.5', Award_or_Certificate: 'MSc', Product_Active: true,
    LMS_Provider: 'Moodle', LMS_Course_ID: 'course-1', LMS_Course_URL: 'https://lms.example/course-1',
    Modified_Time: '2026-08-01T10:00:00+02:00'
  };
  const expected = normalise.programme(raw);
  const actual = roundTrip('programmes', raw);
  assert.deepEqual(actual, expected);
  assert.equal(actual.meta.reference, 'MSC-CS');
});

test('a programme with a single (non-array) Delivery_Mode round-trips to a one-element array, same as normalise.js', () => {
  const raw = { id: '334', Product_Name: 'Solo mode', Delivery_Mode: 'Online', Modified_Time: '2026-08-01T10:00:00+02:00' };
  assert.deepEqual(roundTrip('programmes', raw), normalise.programme(raw));
});

test('a programme with no Delivery_Mode at all round-trips to an empty array, not null', () => {
  const raw = { id: '335', Product_Name: 'No mode', Modified_Time: '2026-08-01T10:00:00+02:00' };
  const actual = roundTrip('programmes', raw);
  assert.deepEqual(actual.deliveryMode, []);
  assert.deepEqual(actual, normalise.programme(raw));
});

test('intake round-trips exactly, including its single programme lookup and scalar deliveryMode', () => {
  const raw = {
    id: '444', Name: 'Autumn 2026', Intake_ID: 'INT-1', External_Intake_Reference: 'INT-REF-1',
    Programme: { id: '333', name: 'MSc Computer Science' }, Academic_Year: '2026/27',
    Intake_Status: 'Open', Application_Open_Date: '2026-01-01', Application_Deadline: '2026-08-01',
    Start_Date: '2026-09-15', End_Date: '2027-09-15', Capacity: '40', Delivery_Mode: 'On campus',
    Campus_or_Location: 'Main Campus', LMS_Cohort_or_Group_ID: 'cohort-1',
    Modified_Time: '2026-08-01T10:00:00+02:00'
  };
  assert.deepEqual(roundTrip('intakes', raw), normalise.intake(raw));
});

test('a null Capacity round-trips to null, not zero (kickoff-prompt.md: null capacity means unlimited)', () => {
  const raw = { id: '445', Name: 'Uncapped', Modified_Time: '2026-08-01T10:00:00+02:00' };
  const actual = roundTrip('intakes', raw);
  assert.equal(actual.capacity, null);
  assert.deepEqual(actual, normalise.intake(raw));
});

test('enrolment round-trips exactly, including all four lookups and the lms sub-object', () => {
  const raw = {
    id: '555', Name: 'ENR-1', External_Enrolment_Ref: 'ENR-REF-1',
    Student: { id: '111', name: 'Ada Lovelace' },
    Programme: { id: '333', name: 'MSc Computer Science' },
    Intake: { id: '444', name: 'Autumn 2026' },
    Application: { id: '222', name: 'Ada — MSc CS' },
    Enrolment_Status: 'Active', Enrolment_Date: '2026-09-01', Start_Date: '2026-09-15',
    Completion_Date: null, Finance_Status: 'Paid in full', Certificate_Issued: false,
    LMS_Provider: 'Moodle', LMS_Enrolment_ID: 'lms-enr-1', Progress_Percentage: '42.5',
    Last_LMS_Sync: '2026-08-01T09:00:00+02:00', External_Sync_Status: 'Synced',
    Modified_Time: '2026-08-01T10:00:00+02:00'
  };
  assert.deepEqual(roundTrip('enrolments', raw), normalise.enrolment(raw));
});

test('readAll hydrates every row from a fake Datastore table into the API shape', async () => {
  const rows = [
    { crm_id: '111', first_name: 'Ada', last_name: 'Lovelace', student_status: 'Applicant', source_modified_time: '2026-08-01T10:00:00+02:00' },
    { crm_id: '112', first_name: 'Bob', last_name: 'Babbage', student_status: 'Enrolled', source_modified_time: '2026-08-01T10:00:00+02:00' }
  ];
  const ds = {
    async zcql(req, query) {
      assert.match(query, /from crm_students/);
      return rows.map((r) => ({ crm_students: r }));
    }
  };
  const result = await reads.readAll({}, 'students', ds);
  assert.equal(result.length, 2);
  assert.equal(result[0].fullName, 'Ada Lovelace');
  assert.equal(result[1].status, 'Enrolled');
});
