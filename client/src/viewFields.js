/**
 * Field registries that drive the custom-views filter builder and column
 * picker for Students, Applications and Programmes (ViewManager.jsx).
 *
 * Mirrors the server-side allowlist in functions/zylker_api/viewFields.js —
 * kept as two separate files deliberately: the client and functions deploy
 * as independent bundles in this project, so there is no shared module to
 * import from. Add a field to both when extending custom views to a new
 * column, and keep `key` identical between the two — it is sent to the
 * server as-is in a condition's `field` and in `sortBy`.
 *
 * `type` drives both the operator choices offered in the filter builder and
 * how the value is compared server-side: 'text' | 'enum' | 'number' | 'date'
 * | 'boolean'. An 'enum' field's `options` seed the value dropdown; a caller
 * may override them per-instance (e.g. Applications passes the live stage
 * list from the API's own meta rather than a hard-coded copy).
 */

export const STUDENT_STATUSES = ['Applicant', 'Active', 'Withdrawn', 'Alumni'];
export const ENROLMENT_STATUSES = ['Active', 'Completed', 'Withdrawn', 'Cancelled'];
export const PROGRAMME_LEVELS = ['Foundation', 'Certificate', 'Diploma', 'Undergraduate', 'Postgraduate', 'Professional', 'Other'];
export const PROGRAMME_STATUSES = ['Draft', 'Open for Applications', 'Running', 'Suspended', 'Archived'];

// The first entry in each list is the page's primary/anchor column (the
// linked name) — always shown, never offered in the column picker, but still
// a valid filter/sort field.
export const STUDENT_FIELDS = [
  { key: 'fullName', labelKey: 'views.fields.student.fullName', type: 'text', primary: true },
  { key: 'studentId', labelKey: 'views.fields.student.studentId', type: 'text' },
  { key: 'email', labelKey: 'views.fields.student.email', type: 'text' },
  { key: 'status', labelKey: 'views.fields.student.status', type: 'enum', options: STUDENT_STATUSES },
  { key: 'programme', labelKey: 'views.fields.student.programme', type: 'text' },
  { key: 'enrolmentStatus', labelKey: 'views.fields.student.enrolmentStatus', type: 'enum', options: ENROLMENT_STATUSES },
  { key: 'externalReference', labelKey: 'views.fields.student.externalReference', type: 'text' },
  { key: 'createdTime', labelKey: 'views.fields.student.added', type: 'date' }
];

export const APPLICATION_FIELDS = [
  { key: 'name', labelKey: 'views.fields.application.name', type: 'text', primary: true },
  { key: 'applicantName', labelKey: 'views.fields.application.applicantName', type: 'text' },
  { key: 'applicantEmail', labelKey: 'views.fields.application.applicantEmail', type: 'text' },
  // options overridden at the call site with the live stage list.
  { key: 'stage', labelKey: 'views.fields.application.stage', type: 'enum', options: [] },
  { key: 'programme', labelKey: 'views.fields.application.programme', type: 'text' },
  { key: 'intake', labelKey: 'views.fields.application.intake', type: 'text' },
  { key: 'applicationDate', labelKey: 'views.fields.application.applicationDate', type: 'date' },
  { key: 'expectedDecisionDate', labelKey: 'views.fields.application.expectedDecisionDate', type: 'date' },
  { key: 'tuitionFee', labelKey: 'views.fields.application.tuitionFee', type: 'number' }
];

export const PROGRAMME_FIELDS = [
  { key: 'name', labelKey: 'views.fields.programme.name', type: 'text', primary: true },
  { key: 'code', labelKey: 'views.fields.programme.code', type: 'text' },
  { key: 'academicLevel', labelKey: 'views.fields.programme.academicLevel', type: 'enum', options: PROGRAMME_LEVELS },
  { key: 'status', labelKey: 'views.fields.programme.status', type: 'enum', options: PROGRAMME_STATUSES },
  { key: 'active', labelKey: 'views.fields.programme.active', type: 'boolean' },
  { key: 'department', labelKey: 'views.fields.programme.department', type: 'text' },
  { key: 'tuitionFee', labelKey: 'views.fields.programme.tuitionFee', type: 'number' },
  { key: 'intakeCount', labelKey: 'views.fields.programme.intakeCount', type: 'number' },
  { key: 'enrolmentCount', labelKey: 'views.fields.programme.enrolmentCount', type: 'number' },
  { key: 'applicationCount', labelKey: 'views.fields.programme.applicationCount', type: 'number' }
];
