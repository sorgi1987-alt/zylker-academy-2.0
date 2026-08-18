'use strict';
/**
 * Server-side allowlist of fields custom views may filter or sort by, for
 * each entity that supports them (Students, Applications, Programmes).
 *
 * This is the security boundary for viewFilter.js: a condition or sortBy
 * naming a key not listed here is dropped rather than evaluated. It mirrors
 * client/src/viewFields.js (which drives the filter-builder UI and needs
 * labels/options the server has no use for) but the two are intentionally
 * separate files — the client and functions deploy as independent bundles in
 * this project, so there is nowhere to import a single shared module from.
 * Add a field to both when extending custom views to a new column.
 */

const STUDENT_FIELDS = {
  fullName: { path: 'fullName', type: 'text' },
  studentId: { path: 'studentId', type: 'text' },
  email: { path: 'email', type: 'text' },
  status: { path: 'status', type: 'text' },
  programme: { path: 'programme.name', type: 'text' },
  enrolmentStatus: { path: 'enrolmentStatus', type: 'text' },
  externalReference: { path: 'externalReference', type: 'text' },
  createdTime: { path: 'createdTime', type: 'date' }
};

const APPLICATION_FIELDS = {
  name: { path: 'name', type: 'text' },
  applicantName: { path: 'applicantName', type: 'text' },
  applicantEmail: { path: 'applicantEmail', type: 'text' },
  stage: { path: 'stage', type: 'text' },
  programme: { path: 'programme.name', type: 'text' },
  intake: { path: 'intake.name', type: 'text' },
  applicationDate: { path: 'applicationDate', type: 'date' },
  expectedDecisionDate: { path: 'expectedDecisionDate', type: 'date' },
  tuitionFee: { path: 'tuitionFee', type: 'number' }
};

const PROGRAMME_FIELDS = {
  name: { path: 'name', type: 'text' },
  code: { path: 'code', type: 'text' },
  academicLevel: { path: 'academicLevel', type: 'text' },
  status: { path: 'status', type: 'text' },
  active: { path: 'active', type: 'boolean' },
  department: { path: 'department', type: 'text' },
  tuitionFee: { path: 'tuitionFee', type: 'number' },
  intakeCount: { path: 'counts.intakes', type: 'number' },
  enrolmentCount: { path: 'counts.enrolments', type: 'number' },
  applicationCount: { path: 'counts.applications', type: 'number' }
};

module.exports = { STUDENT_FIELDS, APPLICATION_FIELDS, PROGRAMME_FIELDS };
