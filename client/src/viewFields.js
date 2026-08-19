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
export const INTAKE_STATUSES = ['Planning', 'Open', 'Full', 'In Progress', 'Completed', 'Cancelled'];
export const DELIVERY_MODES = ['On Campus', 'Online', 'Hybrid'];

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

export const INTAKE_FIELDS = [
  { key: 'name', labelKey: 'views.fields.intake.name', type: 'text', primary: true },
  { key: 'programme', labelKey: 'views.fields.intake.programme', type: 'text' },
  { key: 'status', labelKey: 'views.fields.intake.status', type: 'enum', options: INTAKE_STATUSES },
  { key: 'academicYear', labelKey: 'views.fields.intake.academicYear', type: 'text' },
  { key: 'startDate', labelKey: 'views.fields.intake.startDate', type: 'date' },
  { key: 'endDate', labelKey: 'views.fields.intake.endDate', type: 'date' },
  { key: 'applicationOpenDate', labelKey: 'views.fields.intake.applicationOpenDate', type: 'date' },
  { key: 'applicationDeadline', labelKey: 'views.fields.intake.applicationDeadline', type: 'date' },
  { key: 'capacity', labelKey: 'views.fields.intake.capacity', type: 'number' },
  { key: 'deliveryMode', labelKey: 'views.fields.intake.deliveryMode', type: 'enum', options: DELIVERY_MODES },
  { key: 'location', labelKey: 'views.fields.intake.location', type: 'text' },
  { key: 'applicationCount', labelKey: 'views.fields.intake.applicationCount', type: 'number' },
  { key: 'enrolmentCount', labelKey: 'views.fields.intake.enrolmentCount', type: 'number' }
];

export const ENROLMENT_FIELDS = [
  { key: 'reference', labelKey: 'views.fields.enrolment.reference', type: 'text', primary: true },
  { key: 'studentName', labelKey: 'views.fields.enrolment.student', type: 'text' },
  { key: 'programme', labelKey: 'views.fields.enrolment.programme', type: 'text' },
  { key: 'intake', labelKey: 'views.fields.enrolment.intake', type: 'text' },
  // options overridden at the call site with the live status list, same as
  // Applications does for `stage`.
  { key: 'status', labelKey: 'views.fields.enrolment.status', type: 'enum', options: [] },
  { key: 'enrolmentDate', labelKey: 'views.fields.enrolment.enrolled', type: 'date' },
  { key: 'progress', labelKey: 'views.fields.enrolment.progress', type: 'number' },
  { key: 'lmsSyncStatus', labelKey: 'views.fields.enrolment.lmsSync', type: 'text' },
  { key: 'externalReference', labelKey: 'views.fields.enrolment.externalReference', type: 'text' }
];
