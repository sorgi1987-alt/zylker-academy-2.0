'use strict';
/**
 * Read path for the read-model PoC (kickoff-prompt.md §2 "Read path").
 * Turns a Datastore projection row back into exactly the shape normalise.js
 * produces from a live CRM record — same field names, same lookup {id,name}
 * shape, same `meta` block — so a caller gets an identical response whether
 * the data came from Zoho live or from the projection table underneath it.
 * `test/projectionReads.test.js` asserts this round-trips bit-for-bit against
 * normalise.js's own output for the same raw CRM record.
 *
 * Datastore access is injectable (`ds`, default `projections.defaultDs`),
 * same reasoning as projections.js: `catalyst.initialize` needs a genuine
 * Catalyst-signed request, so without this the hydration logic could only be
 * tested against a live deployment.
 */
const cfg = require('./config');
const projections = require('./projections');

const str = (v) => (v === null || v === undefined || v === '' ? null : String(v));
/** Catalyst returns the literal string "nu" for a null numeric column, not null. */
const num = (v) => {
  if (v === null || v === undefined || v === '' || v === 'nu') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const bool = (v) => v === true || v === 'true';
const lookup = (id, name) => (id ? { id: str(id), name: name || null } : null);

function meta(module_, crmId, reference) {
  return {
    module: module_,
    reference: reference != null && reference !== '' ? String(reference) : null,
    source: 'crm',
    crmUrl: crmId
      ? `${String(cfg.crm.appUrl).replace(/\/+$/, '')}/crm/tab/${encodeURIComponent(module_)}/${encodeURIComponent(crmId)}`
      : null
  };
}

function hydrateStudent(row) {
  return {
    id: str(row.crm_id),
    studentId: str(row.student_id),
    firstName: str(row.first_name),
    lastName: str(row.last_name),
    fullName: [row.first_name, row.last_name].filter(Boolean).join(' ') || null,
    email: str(row.email),
    status: str(row.student_status),
    externalReference: str(row.external_reference),
    lms: { provider: str(row.lms_provider), userId: str(row.lms_user_id), lastSync: str(row.lms_last_sync) },
    createdTime: str(row.crm_created_time),
    modifiedTime: str(row.source_modified_time),
    meta: meta(cfg.modules.students, row.crm_id, row.external_reference)
  };
}

function hydrateApplication(row) {
  return {
    id: str(row.crm_id),
    applicationId: str(row.application_id),
    name: str(row.deal_name),
    externalReference: str(row.external_reference),
    stage: str(row.stage),
    pipeline: str(row.pipeline),
    student: lookup(row.student_id, row.student_name),
    programme: lookup(row.programme_id, row.programme_name),
    intake: lookup(row.intake_id, row.intake_name),
    applicationDate: str(row.application_date),
    expectedDecisionDate: str(row.expected_decision_date),
    decisionDate: str(row.decision_date),
    tuitionFee: num(row.tuition_fee),
    documentsStatus: str(row.documents_status),
    studyMode: str(row.study_mode),
    modifiedTime: str(row.source_modified_time),
    meta: meta(cfg.modules.applications, row.crm_id, row.external_reference)
  };
}

function hydrateProgramme(row) {
  let deliveryMode = [];
  try {
    const parsed = JSON.parse(row.delivery_mode_json || '[]');
    if (Array.isArray(parsed)) deliveryMode = parsed;
  } catch {
    deliveryMode = [];
  }
  return {
    id: str(row.crm_id),
    name: str(row.product_name),
    code: str(row.product_code),
    status: str(row.programme_status),
    academicLevel: str(row.academic_level),
    department: str(row.department),
    durationValue: num(row.duration_value),
    durationUnit: str(row.duration_unit),
    deliveryMode,
    tuitionFee: num(row.tuition_fee),
    award: str(row.award),
    active: bool(row.active),
    lms: { provider: str(row.lms_provider), courseId: str(row.lms_course_id), courseUrl: str(row.lms_course_url) },
    modifiedTime: str(row.source_modified_time),
    // Programmes have no External_* reference field — Product_Code IS the
    // reference, same as referenceOf() resolves it in references.js.
    meta: meta(cfg.modules.programmes, row.crm_id, row.product_code)
  };
}

function hydrateIntake(row) {
  return {
    id: str(row.crm_id),
    name: str(row.intake_name),
    intakeId: str(row.intake_id),
    externalReference: str(row.external_reference),
    programme: lookup(row.programme_id, row.programme_name),
    academicYear: str(row.academic_year),
    status: str(row.intake_status),
    applicationOpenDate: str(row.application_open_date),
    applicationDeadline: str(row.application_deadline),
    startDate: str(row.start_date),
    endDate: str(row.end_date),
    capacity: num(row.capacity),
    deliveryMode: str(row.delivery_mode),
    location: str(row.location),
    lmsCohortId: str(row.lms_cohort_id),
    modifiedTime: str(row.source_modified_time),
    meta: meta(cfg.modules.intakes, row.crm_id, row.external_reference)
  };
}

function hydrateEnrolment(row) {
  return {
    id: str(row.crm_id),
    reference: str(row.enrolment_name),
    externalReference: str(row.external_reference),
    student: lookup(row.student_id, row.student_name),
    programme: lookup(row.programme_id, row.programme_name),
    intake: lookup(row.intake_id, row.intake_name),
    application: lookup(row.application_id, row.application_name),
    status: str(row.enrolment_status),
    enrolmentDate: str(row.enrolment_date),
    startDate: str(row.start_date),
    completionDate: str(row.completion_date),
    financeStatus: str(row.finance_status),
    certificateIssued: bool(row.certificate_issued),
    lms: {
      provider: str(row.lms_provider),
      enrolmentId: str(row.lms_enrolment_id),
      progressPercentage: num(row.lms_progress_percentage),
      lastSync: str(row.lms_last_sync),
      syncStatus: str(row.lms_sync_status)
    },
    modifiedTime: str(row.source_modified_time),
    meta: meta(cfg.modules.enrolments, row.crm_id, row.external_reference)
  };
}

const HYDRATORS = {
  students: hydrateStudent,
  applications: hydrateApplication,
  programmes: hydrateProgramme,
  intakes: hydrateIntake,
  enrolments: hydrateEnrolment
};

// ZCQL hard-refuses a LIMIT above 300 ("ZCQL CANNOT HAVE MORE THAN 300 ROWS
// in LIMIT" — confirmed live against this project, not assumed) and, worse,
// silently applies some default when no LIMIT is given at all rather than
// returning everything. Found live: with no explicit limit, readAll() was
// one missed row away from silently truncating crm_applications (244 rows,
// just under the 300 cap) the moment this org's data grew past it. Every
// entity here is comfortably below 300 rows today, so this couldn't be
// observed by comparing counts — it had to be reasoned through and fixed
// defensively rather than left until it broke silently at 301 rows.
const PAGE_SIZE = 300;

/** Reads every row of one projection table, hydrated to the API shape. */
async function readAll(req, entity, ds = projections.defaultDs) {
  const table = cfg.projections.tables[entity];
  const hydrate = HYDRATORS[entity];
  if (!table || !hydrate) throw new Error(`Unknown projection entity: ${entity}`);

  const rows = [];
  let offset = 0;
  for (;;) {
    // crm_id is unique per row, so ordering by it alone gives a stable,
    // tie-free sort across separate paginated calls — no second tiebreaker
    // needed, unlike the CRM-side Modified_Time pagination in bootstrap.js/
    // reconciliation.js where many rows can share the same timestamp.
    const page = projections.flattenRows(
      await ds.zcql(req, `select * from ${table} where crm_id is not null order by crm_id asc limit ${offset}, ${PAGE_SIZE}`),
      table
    );
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows.map(hydrate);
}

module.exports = {
  readAll, HYDRATORS,
  hydrateStudent, hydrateApplication, hydrateProgramme, hydrateIntake, hydrateEnrolment
};
