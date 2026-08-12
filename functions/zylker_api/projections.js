'use strict';
/**
 * Shared logic between bootstrap, write-through, reconciliation and the
 * Signals event handler (kickoff-prompt.md §2) for writing into the CRM
 * projection tables (`cfg.projections.tables`). Every path that touches
 * crm_students/crm_applications/crm_programmes/crm_intakes/crm_enrolments
 * goes through `upsertProjectionRow` here, so the idempotency rule — never
 * let an older `source_modified_time` overwrite a newer one already stored —
 * is enforced in exactly one place rather than four times independently.
 *
 * Row shapes mirror normalise.js's student()/application()/programme()/
 * intake()/enrolment() exactly: same source fields, just flattened for
 * Datastore — lookup() results become `_id`/`_name` column pairs, `lms`
 * sub-objects become `lms_*` columns. Fields normalise.js only derives at
 * read time (fullName, meta) are not stored; the read path recomputes them
 * the same way normalise.js already does.
 *
 * The Datastore access itself is injectable (the `ds` parameter, default
 * `defaultDs`), the same way books.js/desk.js take an injected `zoho`
 * instead of resolving Catalyst credentials themselves. `catalyst.initialize`
 * needs a genuine Catalyst-signed request, so without this the idempotency
 * logic below — the part actually worth testing — could only be exercised
 * against a live deployment.
 */
const catalyst = require('zcatalyst-sdk-node');
const cfg = require('./config');

const defaultDs = {
  zcql: (req, query) => catalyst.initialize(req).zcql().executeZCQLQuery(query),
  insertRow: (req, table, row) => catalyst.initialize(req).datastore().table(table).insertRow(row),
  updateRow: (req, table, row) => catalyst.initialize(req).datastore().table(table).updateRow(row),
  deleteRow: (req, table, rowId) => catalyst.initialize(req).datastore().table(table).deleteRow(rowId)
};

/** ZCQL has no parameter binding; every value reaching a query is escaped here. */
const q = (v) => String(v == null ? '' : v).replace(/'/g, "''").slice(0, 200);

/** Catalyst returns rows keyed by table name; flatten to the row itself. */
const flattenRows = (rows, table) => (rows || []).map((r) => r[table] || r);

const sqlDatetime = (d) => d.toISOString().replace('T', ' ').slice(0, 19);

const str = (v) => (v === null || v === undefined || v === '' ? null : String(v));
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const lookupId = (v) => (v && v.id ? String(v.id) : null);
const lookupName = (v) => (v && v.id ? (v.name || null) : null);

/* ------------------------------- flatteners ------------------------------ */
// Raw Zoho CRM record -> Datastore row. One builder per entity, matching
// normalise.js's field-by-field mapping.

function studentRow(r) {
  return {
    crm_id: str(r.id),
    student_id: str(r.Student_ID),
    first_name: str(r.First_Name),
    last_name: str(r.Last_Name),
    email: str(r.Email),
    student_status: str(r.Student_Status),
    external_reference: str(r.External_Student_Ref),
    lms_provider: str(r.LMS_Provider),
    lms_user_id: str(r.LMS_User_ID),
    lms_last_sync: str(r.Last_LMS_Sync),
    crm_created_time: str(r.Created_Time),
    source_modified_time: str(r.Modified_Time)
  };
}

function applicationRow(r) {
  return {
    crm_id: str(r.id),
    application_id: str(r.Application_ID),
    deal_name: str(r.Deal_Name),
    external_reference: str(r.External_Application_Ref),
    stage: str(r.Stage),
    pipeline: str(r.Pipeline),
    student_id: lookupId(r.Contact_Name),
    student_name: lookupName(r.Contact_Name),
    programme_id: lookupId(r.Programme),
    programme_name: lookupName(r.Programme),
    intake_id: lookupId(r.Intake),
    intake_name: lookupName(r.Intake),
    application_date: str(r.Application_Date),
    expected_decision_date: str(r.Closing_Date),
    decision_date: str(r.Decision_Date),
    tuition_fee: num(r.Amount),
    documents_status: str(r.Documents_Status),
    study_mode: str(r.Preferred_Study_Mode),
    source_modified_time: str(r.Modified_Time)
  };
}

function programmeRow(r) {
  const deliveryMode = Array.isArray(r.Delivery_Mode)
    ? r.Delivery_Mode
    : (r.Delivery_Mode ? [r.Delivery_Mode] : []);
  return {
    crm_id: str(r.id),
    product_name: str(r.Product_Name),
    product_code: str(r.Product_Code),
    programme_status: str(r.Programme_Status),
    academic_level: str(r.Academic_Level),
    department: str(r.Department),
    duration_value: num(r.Duration_Value),
    duration_unit: str(r.Duration_Unit),
    delivery_mode_json: JSON.stringify(deliveryMode),
    tuition_fee: num(r.Unit_Price),
    award: str(r.Award_or_Certificate),
    active: r.Product_Active === true,
    lms_provider: str(r.LMS_Provider),
    lms_course_id: str(r.LMS_Course_ID),
    lms_course_url: str(r.LMS_Course_URL),
    source_modified_time: str(r.Modified_Time)
  };
}

function intakeRow(r) {
  return {
    crm_id: str(r.id),
    intake_name: str(r.Name),
    intake_id: str(r.Intake_ID),
    external_reference: str(r.External_Intake_Reference),
    programme_id: lookupId(r.Programme),
    programme_name: lookupName(r.Programme),
    academic_year: str(r.Academic_Year),
    intake_status: str(r.Intake_Status),
    application_open_date: str(r.Application_Open_Date),
    application_deadline: str(r.Application_Deadline),
    start_date: str(r.Start_Date),
    end_date: str(r.End_Date),
    capacity: num(r.Capacity),
    delivery_mode: str(r.Delivery_Mode),
    location: str(r.Campus_or_Location),
    lms_cohort_id: str(r.LMS_Cohort_or_Group_ID),
    source_modified_time: str(r.Modified_Time)
  };
}

function enrolmentRow(r) {
  return {
    crm_id: str(r.id),
    enrolment_name: str(r.Name),
    external_reference: str(r.External_Enrolment_Ref),
    student_id: lookupId(r.Student),
    student_name: lookupName(r.Student),
    programme_id: lookupId(r.Programme),
    programme_name: lookupName(r.Programme),
    intake_id: lookupId(r.Intake),
    intake_name: lookupName(r.Intake),
    application_id: lookupId(r.Application),
    application_name: lookupName(r.Application),
    enrolment_status: str(r.Enrolment_Status),
    enrolment_date: str(r.Enrolment_Date),
    start_date: str(r.Start_Date),
    completion_date: str(r.Completion_Date),
    finance_status: str(r.Finance_Status),
    certificate_issued: r.Certificate_Issued === true,
    lms_provider: str(r.LMS_Provider),
    lms_enrolment_id: str(r.LMS_Enrolment_ID),
    lms_progress_percentage: num(r.Progress_Percentage),
    lms_last_sync: str(r.Last_LMS_Sync),
    lms_sync_status: str(r.External_Sync_Status),
    source_modified_time: str(r.Modified_Time)
  };
}

const ROW_BUILDERS = {
  students: studentRow,
  applications: applicationRow,
  programmes: programmeRow,
  intakes: intakeRow,
  enrolments: enrolmentRow
};

function buildRow(entity, rawRecord) {
  const build = ROW_BUILDERS[entity];
  if (!build) throw new Error(`Unknown projection entity: ${entity}`);
  return build(rawRecord);
}

/* --------------------------- idempotent upsert ---------------------------- */

/**
 * Upserts one row into a projection table, keyed by `crm_id`. Never lets an
 * older `source_modified_time` overwrite a newer one already stored — events
 * may arrive more than once, late, or out of order, and bootstrap/
 * reconciliation/write-through/Signals all write to the same table, so this
 * check has to hold regardless of which path calls it.
 *
 * Returns 'inserted' | 'updated' | 'skipped-stale'.
 */
async function upsertProjectionRow(req, entity, rawRecord, ds = defaultDs) {
  const table = cfg.projections.tables[entity];
  if (!table) throw new Error(`Unknown projection entity: ${entity}`);
  const row = buildRow(entity, rawRecord);
  if (!row.crm_id) throw new Error(`Record has no id for projection entity "${entity}".`);

  const found = flattenRows(
    await ds.zcql(req, `select ROWID, source_modified_time from ${table} where crm_id = '${q(row.crm_id)}' limit 1`),
    table
  )[0];

  if (found) {
    const incoming = Date.parse(row.source_modified_time);
    const stored = Date.parse(found.source_modified_time);
    if (Number.isFinite(incoming) && Number.isFinite(stored) && incoming < stored) {
      return 'skipped-stale';
    }
    await ds.updateRow(req, table, { ROWID: found.ROWID, ...row, synced_at: sqlDatetime(new Date()) });
    return 'updated';
  }

  await ds.insertRow(req, table, { ...row, synced_at: sqlDatetime(new Date()) });
  return 'inserted';
}

/**
 * Removes a projection row for a CRM record that was deleted. Not part of
 * the kickoff prompt's write-through spec in so many words, but a "read
 * model" that keeps showing a student after their CRM record is gone is
 * simply wrong — a deletion is as much a projection-affecting write as a
 * create or update is. A no-op (returns false) if the row was never
 * projected in the first place, so this is safe to call unconditionally.
 */
async function deleteProjectionRow(req, entity, crmId, ds = defaultDs) {
  const table = cfg.projections.tables[entity];
  if (!table) throw new Error(`Unknown projection entity: ${entity}`);
  const found = flattenRows(
    await ds.zcql(req, `select ROWID from ${table} where crm_id = '${q(crmId)}' limit 1`),
    table
  )[0];
  if (!found) return false;
  await ds.deleteRow(req, table, found.ROWID);
  return true;
}

module.exports = { buildRow, upsertProjectionRow, deleteProjectionRow, ROW_BUILDERS, sqlDatetime, flattenRows, defaultDs };
