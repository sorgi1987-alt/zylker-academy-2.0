'use strict';
/**
 * CRM write handlers.
 *
 * Authorization happens BEFORE any of these run: index.js gates every write
 * route with requireAuth + requirePermission, so a handler here can assume an
 * authenticated principal with the right permission. What these functions own
 * is correctness — that a write is valid, non-duplicating, and actually landed.
 *
 * Invariants enforced here:
 *   - Field allow-listing: CRM payloads are built ONLY from an explicit
 *     allow-list. req.body is never spread into a write.
 *   - Read-after-write: every mutation re-reads the record and returns that
 *     copy. A write is never reported as succeeded on the strength of the
 *     write call alone.
 *   - Optimistic concurrency: when the caller supplies expectedModifiedTime it
 *     must equal the record's current Modified_Time, else 409.
 *   - Stage transitions are validated against the real CRM Stage picklist.
 *   - Relationship integrity: an intake must belong to its programme; a record
 *     with dependants is not deleted.
 *   - Idempotency: provisioning an enrolment finds before it creates, so a
 *     repeated Enrolled transition cannot produce a second enrolment.
 *   - No external LMS is contacted from here. Enrolment provisioning sets the
 *     existing 'Not Synced' picklist value and reports "Manual action
 *     required"; learning data is owned by the Catalyst LMS connector.
 *
 * The previous build restricted writes to records whose reference began with
 * DEMO-, because it had no authentication and needed *some* boundary. That
 * restriction is gone: identity and role are the boundary now. Pre-existing
 * DEMO- records are ordinary records and are edited under the same rules as
 * any other.
 */
const cfg = require('./config');
const n = require('./normalise');
const refs = require('./references');

/* ------------------------- resolved metadata --------------------------- */
/**
 * Picklist values below were resolved from live CRM field metadata
 * (Deals.Stage, Enrolments.Enrolment_Status / External_Sync_Status,
 * Contacts.Student_Status). They are not invented.
 */
const STAGE = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  DOCUMENTS_PENDING: 'Documents Pending',
  OFFER_ISSUED: 'Offer Issued',
  OFFER_ACCEPTED: 'Offer Accepted',
  ENROLLED: 'Enrolled',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  DEFERRED: 'Deferred'
};
const ALL_STAGES = new Set(Object.values(STAGE));

/**
 * The pipeline read left to right, and the ways out of it.
 *
 * Separated because a stage tracker that shows Rejected as the step after
 * Offer Accepted is telling a lie about the process. Exits are ends, not steps,
 * and the UI renders them differently.
 */
const PIPELINE_ORDER = [
  STAGE.SUBMITTED, STAGE.UNDER_REVIEW, STAGE.DOCUMENTS_PENDING,
  STAGE.OFFER_ISSUED, STAGE.OFFER_ACCEPTED, STAGE.ENROLLED
];
const EXIT_STAGES = [STAGE.REJECTED, STAGE.WITHDRAWN, STAGE.DEFERRED];

/**
 * Stages an application has demonstrably passed through.
 *
 * Derived from position in the pipeline, not from history: the audit trail is
 * the record of what happened, and an application that was created directly at
 * Offer Issued did not "complete" review. Everything before the current step is
 * reported as behind it, which is what a tracker is claiming; for an exit stage
 * nothing is claimed at all.
 */
function completedStages(stage) {
  const i = PIPELINE_ORDER.indexOf(stage);
  return i <= 0 ? [] : PIPELINE_ORDER.slice(0, i);
}

/** Allowed forward transitions within the Student Admissions pipeline. */
const TRANSITIONS = {
  [STAGE.SUBMITTED]: [STAGE.UNDER_REVIEW, STAGE.REJECTED, STAGE.WITHDRAWN],
  [STAGE.UNDER_REVIEW]: [STAGE.DOCUMENTS_PENDING, STAGE.OFFER_ISSUED, STAGE.REJECTED, STAGE.WITHDRAWN],
  [STAGE.DOCUMENTS_PENDING]: [STAGE.UNDER_REVIEW, STAGE.OFFER_ISSUED, STAGE.REJECTED, STAGE.WITHDRAWN],
  [STAGE.OFFER_ISSUED]: [STAGE.OFFER_ACCEPTED, STAGE.REJECTED, STAGE.WITHDRAWN, STAGE.DEFERRED],
  [STAGE.OFFER_ACCEPTED]: [STAGE.ENROLLED, STAGE.WITHDRAWN, STAGE.DEFERRED],
  [STAGE.DEFERRED]: [STAGE.OFFER_ACCEPTED, STAGE.WITHDRAWN],
  [STAGE.ENROLLED]: [],
  [STAGE.REJECTED]: [],
  [STAGE.WITHDRAWN]: []
};
/** Stages at which a decision date is recorded. */
const DECISION_STAGES = new Set([STAGE.OFFER_ISSUED, STAGE.OFFER_ACCEPTED, STAGE.ENROLLED, STAGE.REJECTED, STAGE.WITHDRAWN]);

const ENROLMENT_STATUS = { ACTIVE: 'Active', COMPLETED: 'Completed', WITHDRAWN: 'Withdrawn', CANCELLED: 'Cancelled' };
const SYNC_STATUS_NOT_SYNCED = 'Not Synced';           // existing picklist value
const MANUAL_ACTION = 'Manual action required';        // UI label, not a picklist value
const STUDENT_STATUS = { APPLICANT: 'Applicant', ACTIVE: 'Active', WITHDRAWN: 'Withdrawn', ALUMNI: 'Alumni' };
const PIPELINE = 'Student Admissions';                 // mandatory text field value

/**
 * Loads the record a mutation targets, or 404s. Every handler that changes an
 * EXISTING record starts here so that "does it exist" is answered once, in one
 * place, before any payload is built.
 */
async function loadRecord(deps, req, module_, id, fields, notFoundMsg) {
  const rec = await deps.zoho.crmGetRecord(req, module_, id, fields);
  if (!rec) throw new AppError(404, 'NOT_FOUND', notFoundMsg);
  return rec;
}

/* ------------------------- read-back field sets ------------------------ */
const RB = {
  application: 'id, Deal_Name, Application_ID, External_Application_Ref, Stage, Pipeline, Contact_Name, Programme, Intake, Application_Date, Closing_Date, Decision_Date, Amount, Documents_Status, Preferred_Study_Mode, Modified_Time',
  student: 'id, First_Name, Last_Name, Email, Student_ID, Student_Status, External_Student_Ref, LMS_Provider, LMS_User_ID, Last_LMS_Sync, Created_Time, Modified_Time',
  enrolment: 'id, Name, External_Enrolment_Ref, Student, Programme, Intake, Application, Enrolment_Status, Enrolment_Date, Start_Date, Completion_Date, Finance_Status, Certificate_Issued, LMS_Provider, LMS_Enrolment_ID, Progress_Percentage, Last_LMS_Sync, External_Sync_Status, Modified_Time'
};

/* ------------------------------ helpers -------------------------------- */

/** Typed error the index wrapper converts into a safe HTTP response. */
class AppError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; this.expose = true; }
}

const normEmail = (v) => String(v == null ? '' : v).trim().toLowerCase();
const today = () => new Date().toISOString().slice(0, 10);
const numericId = (v) => String(v == null ? '' : v).replace(/[^0-9]/g, '');
const trimOrNull = (v) => { const s = String(v == null ? '' : v).trim(); return s || null; };
const lookup = (id) => (numericId(id) ? { id: numericId(id) } : null);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Accepts a calendar date, or throws 422 naming the field.
 *
 * A browser date input will happily emit `0006-08-23` when someone mistypes a
 * year, and CRM answers that with a bare HTTP 400 that names no field. Checking
 * it here turns an opaque upstream failure into a message that says which box
 * to fix. The range is deliberately generous — it is a sanity check on the
 * shape of the value, not a business rule about which dates are allowed.
 */
const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

function dateOrNull(value, label) {
  const s = trimOrNull(value);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new AppError(422, 'INVALID_DATE', `${label} must be a date in the form YYYY-MM-DD.`);
  }
  const [y, m, d] = s.split('-').map(Number);
  if (y < MIN_YEAR || y > MAX_YEAR) {
    throw new AppError(422, 'INVALID_DATE', `${label} has an implausible year (${y}). Check the date.`);
  }
  // Rejects 2026-02-31 and similar: JS normalises those, so round-tripping and
  // comparing is the reliable test.
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new AppError(422, 'INVALID_DATE', `${label} is not a real calendar date.`);
  }
  return s;
}

/** COQL string-literal escape: single quotes only, per Zoho COQL. */
const coql = (v) => String(v).replace(/'/g, "\\'");

/**
 * Builds the audit event for a mutation, capturing the CRM record before and
 * after so the activity log can show what actually changed. `before` is the raw
 * pre-write record; `after` is the raw post-write read-back.
 */
function auditEvent(action, entityType, module_, id, changedFields, before, after, result = 'success') {
  return {
    action, entityType,
    recordId: String(id),
    recordRef: refs.referenceOf(module_, after || before),
    changedFields, before, after, result
  };
}

/**
 * Enforces optimistic concurrency when the caller supplied a timestamp.
 *
 * A record with no `Modified_Time` is treated as a fault, not as a conflict.
 * Conflating the two once made every edit impossible while reporting it as
 * "someone else changed this record" — a message that sends the user off to
 * reload forever instead of surfacing the actual defect. If the timestamp is
 * missing, the read is wrong and that is what gets said.
 */
function assertUnchanged(record, expectedModifiedTime) {
  if (!expectedModifiedTime) return; // caller opted out
  if (!record || record.Modified_Time == null) {
    throw new AppError(500, 'NO_MODIFIED_TIME',
      'The record was read without a modification timestamp, so this change cannot be safely applied. This is a defect, not a conflict.');
  }
  if (String(record.Modified_Time) !== String(expectedModifiedTime)) {
    throw new AppError(409, 'CONFLICT',
      'This record changed since you loaded it. Reload and try again.');
  }
}

/**
 * Reads a record back after a write and asserts it exists. `deps` carries the
 * zoho module (injected so the handlers can be unit-tested without Catalyst).
 */
async function readBackRaw(deps, req, module_, id, fields) {
  const rec = await deps.zoho.crmGetRecord(req, module_, id, fields);
  if (!rec) throw new AppError(502, 'READBACK_FAILED', 'The record could not be read back after the write.');
  return rec;
}

async function readBack(deps, req, module_, id, fields, normFn) {
  return normFn(await readBackRaw(deps, req, module_, id, fields));
}

/**
 * An Intake belongs to exactly one Programme. Rejects a pairing where the
 * chosen intake is not an intake OF the chosen programme, which would otherwise
 * create a structurally invalid application or enrolment.
 */
async function assertIntakeMatchesProgramme(deps, req, intakeId, programmeId) {
  if (!numericId(intakeId) || !numericId(programmeId)) return;
  const rows = await deps.zoho.crmQuery(req,
    `select id, Programme from ${cfg.modules.intakes} where id = ${numericId(intakeId)} limit 1`);
  if (!rows || !rows.length) throw new AppError(422, 'INTAKE_NOT_FOUND', 'That intake does not exist.');
  const owner = rows[0].Programme && rows[0].Programme.id ? String(rows[0].Programme.id) : null;
  if (owner && owner !== String(numericId(programmeId))) {
    throw new AppError(422, 'INTAKE_PROGRAMME_MISMATCH',
      'That intake belongs to a different programme. Choose an intake for the selected programme.');
  }
}

/**
 * Refuses an enrolment that would take an intake past its configured capacity.
 *
 * Capacity is only enforced when the intake actually has one — a null Capacity
 * means "not limited", not "limit of zero". An administrator may override with
 * `capacityOverride: true`, which the route only honours for a principal
 * holding intake:capacity-override; the flag alone is not sufficient.
 */
async function assertIntakeCapacity(deps, req, intakeId, { allowOverride = false, override = false } = {}) {
  const id = numericId(intakeId);
  if (!id) return { enforced: false };

  const rows = await deps.zoho.crmQuery(req,
    `select id, Capacity, Name from ${cfg.modules.intakes} where id = ${id} limit 1`);
  if (!rows || !rows.length) throw new AppError(422, 'INTAKE_NOT_FOUND', 'That intake does not exist.');

  const capacity = rows[0].Capacity == null || rows[0].Capacity === '' ? null : Number(rows[0].Capacity);
  if (capacity === null || !Number.isFinite(capacity) || capacity <= 0) return { enforced: false };

  // Only ACTIVE enrolments consume a place; cancelled and withdrawn ones do not.
  const taken = await deps.zoho.crmQuery(req,
    `select id from ${cfg.modules.enrolments} where Intake = ${id} and Enrolment_Status = '${coql(ENROLMENT_STATUS.ACTIVE)}' limit 200`);
  const used = (taken || []).length;
  if (used < capacity) return { enforced: true, capacity, used };

  if (override && allowOverride) {
    return { enforced: true, capacity, used, overridden: true };
  }
  throw new AppError(409, 'INTAKE_AT_CAPACITY',
    `That intake is full (${used} of ${capacity} places taken). An administrator can override this.`);
}

/**
 * Rejects an impossible date range before it reaches CRM. CRM will store an end
 * date that precedes its start date quite happily, so this is the only place
 * the rule exists.
 */
function assertDateOrder(pairs) {
  pairs.forEach(([label, start, end]) => {
    if (!start || !end) return;
    if (String(end) < String(start)) {
      throw new AppError(422, 'INVALID_DATE_RANGE', `${label}: the end date cannot be before the start date.`);
    }
  });
}

/** Finds a Student (Contact) by normalised email, or creates a minimal one. */
async function findOrCreateStudentByEmail(deps, req, email, seed = {}) {
  const e = normEmail(email);
  if (!EMAIL_RE.test(e)) throw new AppError(422, 'INVALID_EMAIL', 'A valid email is required to resolve the student.');
  const rows = await deps.zoho.crmQuery(req,
    `select id, Email from ${cfg.modules.students} where Email = '${coql(e)}' limit 1`);
  if (rows && rows.length) return { id: String(rows[0].id), created: false };

  // A student created while an application is submitted is an APPLICANT.
  // They only become Active when an enrolment is created/activated.
  const payload = {
    Last_Name: trimOrNull(seed.lastName) || 'Applicant',
    Email: e,
    Student_Status: STUDENT_STATUS.APPLICANT,
    External_Student_Ref: refs.mintRef(cfg.modules.students)
  };
  if (trimOrNull(seed.firstName)) payload.First_Name = trimOrNull(seed.firstName);
  const details = await deps.zoho.crmCreate(req, cfg.modules.students, payload);
  return { id: String(details.id), created: true };
}

/* ------------------------------ handlers ------------------------------- */
/**
 * Each handler returns { data, meta?, audit }. The `audit` object is recorded by
 * the index wrapper on success. Handlers throw AppError for expected failures.
 */

async function applicationCreate(deps, req) {
  const b = req.body || {};
  const programmeId = numericId(b.programmeId);
  const intakeId = numericId(b.intakeId);
  if (!programmeId) throw new AppError(422, 'MISSING_PROGRAMME', 'A programme is required.');
  if (intakeId) await assertIntakeMatchesProgramme(deps, req, intakeId, programmeId);

  // Resolve or create the applicant as a Student (Contact).
  let studentId = numericId(b.studentId);
  if (!studentId) {
    const s = await findOrCreateStudentByEmail(deps, req, b.email, { firstName: b.firstName, lastName: b.lastName });
    studentId = s.id;
  }

  const applicant = [trimOrNull(b.firstName), trimOrNull(b.lastName)].filter(Boolean).join(' ') || 'Applicant';
  const appDate = dateOrNull(b.applicationDate, 'Application date') || today();
  const closingDate = dateOrNull(b.closingDate, 'Expected decision date') || appDate;
  // Whitelisted payload only — req.body is never spread.
  const payload = {
    Deal_Name: `${applicant} Application`,
    Stage: STAGE.SUBMITTED,
    Pipeline: PIPELINE,
    Closing_Date: closingDate,                            // Closing_Date is mandatory on Deals
    Application_Date: appDate,
    Contact_Name: lookup(studentId),
    Programme: lookup(programmeId),
    External_Application_Ref: refs.mintRef(cfg.modules.applications)
  };
  if (intakeId) payload.Intake = lookup(intakeId);
  if (b.tuitionFee != null && b.tuitionFee !== '') payload.Amount = Number(b.tuitionFee);
  if (trimOrNull(b.studyMode)) payload.Preferred_Study_Mode = trimOrNull(b.studyMode);

  const details = await deps.zoho.crmCreate(req, cfg.modules.applications, payload);
  const data = await readBack(deps, req, cfg.modules.applications, details.id, RB.application, n.application);
  return { data, meta: { studentId }, audit: { action: 'application:create', entityType: 'application', recordId: String(details.id), changedFields: Object.keys(payload), result: 'success' } };
}

async function applicationUpdate(deps, req) {
  const id = numericId(req.params.id);
  if (!id) throw new AppError(400, 'INVALID_ID', 'A numeric record id is required.');
  const b = req.body || {};

  const current = await loadRecord(deps, req, cfg.modules.applications, id, RB.application, 'No application matches that id.');
  assertUnchanged(current, b.expectedModifiedTime);

  // Editable fields only — Stage is changed through /transition, never here.
  const payload = {};
  const appDate = dateOrNull(b.applicationDate, 'Application date');
  const closingDate = dateOrNull(b.closingDate, 'Expected decision date');
  if (appDate) payload.Application_Date = appDate;
  if (closingDate) payload.Closing_Date = closingDate;
  if (b.tuitionFee != null && b.tuitionFee !== '') payload.Amount = Number(b.tuitionFee);
  if (trimOrNull(b.studyMode)) payload.Preferred_Study_Mode = trimOrNull(b.studyMode);
  if (trimOrNull(b.documentsStatus)) payload.Documents_Status = trimOrNull(b.documentsStatus);

  // Programme/intake must stay compatible after an edit. Resolve the effective
  // pair (whichever side the caller did not change keeps its current value).
  const nextProgramme = numericId(b.programmeId) || (current.Programme && current.Programme.id) || null;
  const nextIntake = numericId(b.intakeId) || (current.Intake && current.Intake.id) || null;
  if (nextProgramme && nextIntake && (numericId(b.programmeId) || numericId(b.intakeId))) {
    await assertIntakeMatchesProgramme(deps, req, nextIntake, nextProgramme);
  }
  if (numericId(b.intakeId)) payload.Intake = lookup(b.intakeId);
  if (numericId(b.programmeId)) payload.Programme = lookup(b.programmeId);
  if (numericId(b.studentId)) payload.Contact_Name = lookup(b.studentId);
  if (!Object.keys(payload).length) throw new AppError(422, 'NO_FIELDS', 'No editable fields were provided.');

  await deps.zoho.crmUpdate(req, cfg.modules.applications, id, payload);
  const raw = await readBackRaw(deps, req, cfg.modules.applications, id, RB.application);
  return { data: n.application(raw), audit: auditEvent('application:update', 'application', cfg.modules.applications, id, Object.keys(payload), current, raw) };
}

async function applicationTransition(deps, req) {
  const id = numericId(req.params.id);
  if (!id) throw new AppError(400, 'INVALID_ID', 'A numeric record id is required.');
  const b = req.body || {};
  const toStage = trimOrNull(b.toStage);
  if (!toStage || !ALL_STAGES.has(toStage)) throw new AppError(422, 'INVALID_STAGE', 'An unknown target stage was requested.');

  const current = await loadRecord(deps, req, cfg.modules.applications, id, RB.application, 'No application matches that id.');
  assertUnchanged(current, b.expectedModifiedTime);

  const from = String(current.Stage || '');
  const allowed = TRANSITIONS[from] || [];
  if (!allowed.includes(toStage)) {
    throw new AppError(422, 'ILLEGAL_TRANSITION', `Cannot move from "${from || 'unknown'}" to "${toStage}".`);
  }

  const payload = { Stage: toStage };

  /*
   * Optional values collected by the transition dialog.
   *
   * Only fields the CRM module actually has are written: Decision_Date and
   * Documents_Status. A follow-up date and a responsible staff member have no
   * field in this module's metadata, so they are not accepted here — inventing
   * an API name would fail at the CRM boundary, and quietly dropping them would
   * be worse. A free-text comment has nowhere to live on the record either, so
   * it is attached to the audit entry instead and the dialog says so.
   */
  if (DECISION_STAGES.has(toStage)) {
    payload.Decision_Date = dateOrNull(b.decisionDate, 'Decision date') || today();
  }
  if (b.documentsStatus !== undefined) {
    const ds = trimOrNull(b.documentsStatus);
    if (ds) payload.Documents_Status = ds;
  }

  await deps.zoho.crmUpdate(req, cfg.modules.applications, id, payload);

  const rawAfter = await readBackRaw(deps, req, cfg.modules.applications, id, RB.application);
  const out = { application: n.application(rawAfter) };
  const changed = Object.keys(payload);
  const note = trimOrNull(b.comment);

  // On Enrolled: provision exactly one Student + Enrolment, idempotently.
  if (toStage === STAGE.ENROLLED) {
    const prov = await provisionEnrolment(deps, req, current, b);
    out.enrolment = prov.enrolment;
    out.studentId = prov.studentId;
    out.lmsProvisioning = MANUAL_ACTION;
    out.enrolmentCreated = prov.created;
  }

  return {
    data: out,
    audit: {
      ...auditEvent('application:transition', 'application', cfg.modules.applications, id,
        changed.concat(toStage === STAGE.ENROLLED ? ['enrolment'] : []), current, rawAfter),
      note
    }
  };
}

/**
 * Idempotently ensures a single Enrolment exists for an application.
 * No external LMS is contacted: sync status is the existing 'Not Synced' value and the
 * caller surfaces "Manual action required".
 */
async function provisionEnrolment(deps, req, deal, body) {
  const dealId = numericId(deal.id);

  // Idempotency: reuse any enrolment already linked to this application.
  const existing = await deps.zoho.crmQuery(req,
    `select id from ${cfg.modules.enrolments} where Application = ${dealId} limit 1`);
  if (existing && existing.length) {
    const enrolment = await readBack(deps, req, cfg.modules.enrolments, existing[0].id, RB.enrolment, n.enrolment);
    const studentId = deal.Contact_Name && deal.Contact_Name.id ? String(deal.Contact_Name.id) : (enrolment.student && enrolment.student.id) || null;
    return { enrolment, studentId, created: false };
  }

  // Resolve the student: the linked Contact, else find-or-create by email.
  let studentId = deal.Contact_Name && deal.Contact_Name.id ? String(deal.Contact_Name.id) : null;
  if (!studentId) {
    if (!body || !body.email) throw new AppError(422, 'NO_STUDENT', 'Cannot enrol: the application has no linked student and no email was supplied.');
    const s = await findOrCreateStudentByEmail(deps, req, body.email);
    studentId = s.id;
  }

  // An enrolment created by a stage transition consumes a place like any other.
  if (deal.Intake && deal.Intake.id) {
    await assertIntakeCapacity(deps, req, deal.Intake.id, {
      allowOverride: req.canOverrideCapacity === true,
      override: body && body.capacityOverride === true
    });
  }

  const payload = {
    Student: lookup(studentId),
    Application: lookup(dealId),
    Enrolment_Status: ENROLMENT_STATUS.ACTIVE,
    Enrolment_Date: today(),
    External_Sync_Status: SYNC_STATUS_NOT_SYNCED,
    External_Enrolment_Ref: refs.mintRef(cfg.modules.enrolments)
  };
  if (deal.Programme && deal.Programme.id) payload.Programme = lookup(deal.Programme.id);
  if (deal.Intake && deal.Intake.id) payload.Intake = lookup(deal.Intake.id);

  const details = await deps.zoho.crmCreate(req, cfg.modules.enrolments, payload);
  const enrolment = await readBack(deps, req, cfg.modules.enrolments, details.id, RB.enrolment, n.enrolment);

  // An enrolled applicant becomes an Active student. Best-effort: the enrolment
  // is the record of truth and must not be rolled back if this trails.
  await activateStudent(deps, req, studentId);

  return { enrolment, studentId, created: true };
}

/** Promotes a student to Active once they hold an enrolment. */
async function activateStudent(deps, req, studentId) {
  if (!numericId(studentId)) return false;
  try {
    const s = await deps.zoho.crmGetRecord(req, cfg.modules.students, studentId, 'id, Student_Status, External_Student_Ref');
    if (!s) return false;
    if (String(s.Student_Status) === STUDENT_STATUS.ACTIVE) return false;
    await deps.zoho.crmUpdate(req, cfg.modules.students, studentId, { Student_Status: STUDENT_STATUS.ACTIVE });
    return true;
  } catch {
    return false;
  }
}

async function applicationArchive(deps, req) {
  const id = numericId(req.params.id);
  if (!id) throw new AppError(400, 'INVALID_ID', 'A numeric record id is required.');
  const current = await loadRecord(deps, req, cfg.modules.applications, id, RB.application, 'No application matches that id.');
  assertUnchanged(current, (req.body || {}).expectedModifiedTime);

  // Archive maps to the real terminal 'Withdrawn' stage.
  const payload = { Stage: STAGE.WITHDRAWN, Decision_Date: today() };
  await deps.zoho.crmUpdate(req, cfg.modules.applications, id, payload);
  const raw = await readBackRaw(deps, req, cfg.modules.applications, id, RB.application);
  return { data: n.application(raw), audit: auditEvent('application:archive', 'application', cfg.modules.applications, id, Object.keys(payload), current, raw) };
}

/**
 * Permanently deletes an application.
 *
 * Requires the application:delete permission, and additionally refuses when a
 * related enrolment would be orphaned: deleting the Deal would leave an
 * Enrolment pointing at a missing Application, which is an invalid state.
 */
async function applicationDelete(deps, req) {
  const id = numericId(req.params.id);
  if (!id) throw new AppError(400, 'INVALID_ID', 'A numeric record id is required.');
  const current = await loadRecord(deps, req, cfg.modules.applications, id, RB.application, 'No application matches that id.');

  const related = await deps.zoho.crmQuery(req,
    `select id, Enrolment_Status from ${cfg.modules.enrolments} where Application = ${id} limit 5`);
  if (related && related.length) {
    throw new AppError(409, 'HAS_RELATED_ENROLMENT',
      `This application has ${related.length} related enrolment${related.length === 1 ? '' : 's'} and cannot be deleted. Cancel or delete the enrolment first, or withdraw the application instead.`);
  }

  await deps.zoho.crmDelete(req, cfg.modules.applications, id);

  // Read-after-delete: confirm the record is actually gone.
  const stillThere = await deps.zoho.crmGetRecord(req, cfg.modules.applications, id, 'id');
  if (stillThere) throw new AppError(502, 'DELETE_UNCONFIRMED', 'The record still exists after the delete call.');
  return { data: { id, deleted: true }, audit: { action: 'application:delete', entityType: 'application', recordId: id, changedFields: [], result: 'success' } };
}

async function studentCreate(deps, req) {
  const b = req.body || {};
  const lastName = trimOrNull(b.lastName);
  if (!lastName) throw new AppError(422, 'MISSING_LAST_NAME', 'A last name is required.');
  const email = trimOrNull(b.email);
  if (email && !EMAIL_RE.test(normEmail(email))) throw new AppError(422, 'INVALID_EMAIL', 'Enter a valid email address.');

  // Duplicate detection on normalised, case-insensitive email.
  if (email) {
    const dup = await deps.zoho.crmQuery(req,
      `select id, Email from ${cfg.modules.students} where Email = '${coql(normEmail(email))}' limit 1`);
    if (dup && dup.length) {
      throw new AppError(409, 'DUPLICATE_EMAIL',
        'A student with this email already exists. Open that record instead, or use a different email.');
    }
  }

  const payload = {
    Last_Name: lastName,
    Student_Status: [STUDENT_STATUS.APPLICANT, STUDENT_STATUS.ACTIVE, STUDENT_STATUS.WITHDRAWN, STUDENT_STATUS.ALUMNI].includes(b.studentStatus) ? b.studentStatus : STUDENT_STATUS.APPLICANT,
    // Server-minted: a client-supplied reference is ignored, so nobody can
    // grant themselves write access to a reference record.
    External_Student_Ref: refs.mintRef(cfg.modules.students)
  };
  if (trimOrNull(b.firstName)) payload.First_Name = trimOrNull(b.firstName);
  if (email) payload.Email = normEmail(email);

  const details = await deps.zoho.crmCreate(req, cfg.modules.students, payload);
  const data = await readBack(deps, req, cfg.modules.students, details.id, RB.student, n.student);
  return { data, audit: { action: 'student:create', entityType: 'student', recordId: String(details.id), changedFields: Object.keys(payload), result: 'success' } };
}

async function studentUpdate(deps, req) {
  const id = numericId(req.params.id);
  if (!id) throw new AppError(400, 'INVALID_ID', 'A numeric record id is required.');
  const b = req.body || {};
  const current = await loadRecord(deps, req, cfg.modules.students, id, RB.student, 'No student matches that id.');
  assertUnchanged(current, b.expectedModifiedTime);

  const payload = {};
  if (trimOrNull(b.firstName)) payload.First_Name = trimOrNull(b.firstName);
  if (trimOrNull(b.lastName)) payload.Last_Name = trimOrNull(b.lastName);
  if (trimOrNull(b.email)) {
    if (!EMAIL_RE.test(normEmail(b.email))) throw new AppError(422, 'INVALID_EMAIL', 'Enter a valid email address.');
    // Changing email must not collide with another student.
    const dup = await deps.zoho.crmQuery(req,
      `select id from ${cfg.modules.students} where Email = '${coql(normEmail(b.email))}' limit 2`);
    if ((dup || []).some((r) => String(r.id) !== String(id))) {
      throw new AppError(409, 'DUPLICATE_EMAIL', 'Another student already uses this email.');
    }
    payload.Email = normEmail(b.email);
  }
  if ([STUDENT_STATUS.APPLICANT, STUDENT_STATUS.ACTIVE, STUDENT_STATUS.WITHDRAWN, STUDENT_STATUS.ALUMNI].includes(b.studentStatus)) payload.Student_Status = b.studentStatus;
  if (!Object.keys(payload).length) throw new AppError(422, 'NO_FIELDS', 'No editable fields were provided.');

  await deps.zoho.crmUpdate(req, cfg.modules.students, id, payload);
  const raw = await readBackRaw(deps, req, cfg.modules.students, id, RB.student);
  return { data: n.student(raw), audit: auditEvent('student:update', 'student', cfg.modules.students, id, Object.keys(payload), current, raw) };
}

async function enrolmentCreate(deps, req) {
  const b = req.body || {};
  const studentId = numericId(b.studentId);
  const applicationId = numericId(b.applicationId);
  if (!studentId) throw new AppError(422, 'MISSING_STUDENT', 'A student is required.');

  // Idempotency: if an enrolment already exists for the application, return it.
  if (applicationId) {
    const existing = await deps.zoho.crmQuery(req,
      `select id from ${cfg.modules.enrolments} where Application = ${applicationId} limit 1`);
    if (existing && existing.length) {
      const data = await readBack(deps, req, cfg.modules.enrolments, existing[0].id, RB.enrolment, n.enrolment);
      return { data, meta: { idempotent: true, learnAccess: MANUAL_ACTION }, audit: { action: 'enrolment:create', entityType: 'enrolment', recordId: String(existing[0].id), changedFields: [], result: 'idempotent' } };
    }
  }

  const programmeId = numericId(b.programmeId);
  const intakeId = numericId(b.intakeId);
  if (!programmeId) throw new AppError(422, 'MISSING_PROGRAMME', 'A programme is required.');
  if (!intakeId) throw new AppError(422, 'MISSING_INTAKE', 'An intake is required.');
  await assertIntakeMatchesProgramme(deps, req, intakeId, programmeId);
  const capacity = await assertIntakeCapacity(deps, req, intakeId, {
    allowOverride: req.canOverrideCapacity === true,
    override: b.capacityOverride === true
  });

  // No duplicate ACTIVE enrolment for the same student + programme + intake.
  const clash = await deps.zoho.crmQuery(req,
    `select id, Enrolment_Status from ${cfg.modules.enrolments} where Student = ${studentId} and Programme = ${programmeId} and Intake = ${intakeId} limit 5`);
  if ((clash || []).some((r) => String(r.Enrolment_Status) === ENROLMENT_STATUS.ACTIVE)) {
    throw new AppError(409, 'DUPLICATE_ENROLMENT',
      'This student already has an active enrolment for that programme and intake.');
  }

  const payload = {
    Student: lookup(studentId),
    Programme: lookup(programmeId),
    Intake: lookup(intakeId),
    Enrolment_Status: ENROLMENT_STATUS.ACTIVE,
    Enrolment_Date: dateOrNull(b.enrolmentDate, 'Enrolment date') || today(),
    External_Sync_Status: SYNC_STATUS_NOT_SYNCED,
    External_Enrolment_Ref: refs.mintRef(cfg.modules.enrolments)
  };
  if (applicationId) payload.Application = lookup(applicationId);
  if (trimOrNull(b.startDate)) payload.Start_Date = dateOrNull(b.startDate, 'Start date');

  const details = await deps.zoho.crmCreate(req, cfg.modules.enrolments, payload);
  const data = await readBack(deps, req, cfg.modules.enrolments, details.id, RB.enrolment, n.enrolment);
  await activateStudent(deps, req, studentId);
  return {
    data,
    meta: { lmsProvisioning: MANUAL_ACTION, capacity },
    audit: { action: 'enrolment:create', entityType: 'enrolment', recordId: String(details.id), changedFields: Object.keys(payload), result: 'success' }
  };
}

async function enrolmentUpdate(deps, req) {
  const id = numericId(req.params.id);
  if (!id) throw new AppError(400, 'INVALID_ID', 'A numeric record id is required.');
  const b = req.body || {};
  const current = await loadRecord(deps, req, cfg.modules.enrolments, id, RB.enrolment, 'No enrolment matches that id.');
  assertUnchanged(current, b.expectedModifiedTime);

  // LMS/sync fields are maintained manually in CRM and are never written here.
  const payload = {};
  if (Object.values(ENROLMENT_STATUS).includes(b.enrolmentStatus)) payload.Enrolment_Status = b.enrolmentStatus;
  if (trimOrNull(b.financeStatus)) payload.Finance_Status = trimOrNull(b.financeStatus);
  if (trimOrNull(b.startDate)) payload.Start_Date = dateOrNull(b.startDate, 'Start date');
  if (trimOrNull(b.completionDate)) payload.Completion_Date = trimOrNull(b.completionDate);
  if (typeof b.certificateIssued === 'boolean') payload.Certificate_Issued = b.certificateIssued;
  if (!Object.keys(payload).length) throw new AppError(422, 'NO_FIELDS', 'No editable fields were provided.');

  await deps.zoho.crmUpdate(req, cfg.modules.enrolments, id, payload);
  const raw = await readBackRaw(deps, req, cfg.modules.enrolments, id, RB.enrolment);
  return { data: n.enrolment(raw), audit: auditEvent('enrolment:update', 'enrolment', cfg.modules.enrolments, id, Object.keys(payload), current, raw) };
}

/* ------------------------------ internal notes ---------------------------- */

/**
 * Records an internal note against a record.
 *
 * Nothing is written to CRM. None of these modules has a notes field this
 * application is allowed to write, and adding one would be a schema change to
 * somebody else's org. The note goes to the audit trail instead, attributed to
 * the authenticated user, and every screen that offers this says plainly that
 * the note lives in the activity history rather than on the CRM record.
 *
 * The record is loaded first so a note cannot be attached to an id that does
 * not exist — an orphaned note is worse than a refused one.
 */
const NOTE_ENTITIES = {
  student: { module: () => cfg.modules.students, rb: () => RB.student, label: 'student' },
  application: { module: () => cfg.modules.applications, rb: () => RB.application, label: 'application' },
  enrolment: { module: () => cfg.modules.enrolments, rb: () => RB.enrolment, label: 'enrolment' }
};

async function noteCreate(deps, req) {
  const b = req.body || {};
  const entityType = trimOrNull(b.entityType);
  const spec = NOTE_ENTITIES[entityType];
  if (!spec) throw new AppError(422, 'INVALID_ENTITY', 'Notes can be recorded against a student, application or enrolment.');

  const id = numericId(b.recordId);
  if (!id) throw new AppError(400, 'INVALID_ID', 'A numeric record id is required.');

  const note = trimOrNull(b.note);
  if (!note) throw new AppError(422, 'EMPTY_NOTE', 'A note cannot be empty.');
  if (note.length > 1000) throw new AppError(422, 'NOTE_TOO_LONG', 'A note is limited to 1000 characters.');

  const current = await loadRecord(deps, req, spec.module(), id, spec.rb(), `No ${spec.label} matches that id.`);

  return {
    data: { recorded: true, entityType, recordId: String(id) },
    audit: {
      ...auditEvent(`${entityType}:note`, entityType, spec.module(), id, [], null, current),
      // No CRM field changed, so nothing is reported as changed.
      changedFields: [],
      note
    }
  };
}

async function enrolmentArchive(deps, req) {
  const id = numericId(req.params.id);
  if (!id) throw new AppError(400, 'INVALID_ID', 'A numeric record id is required.');
  const current = await loadRecord(deps, req, cfg.modules.enrolments, id, RB.enrolment, 'No enrolment matches that id.');
  assertUnchanged(current, (req.body || {}).expectedModifiedTime);

  const payload = { Enrolment_Status: ENROLMENT_STATUS.CANCELLED };
  await deps.zoho.crmUpdate(req, cfg.modules.enrolments, id, payload);
  const raw = await readBackRaw(deps, req, cfg.modules.enrolments, id, RB.enrolment);
  return { data: n.enrolment(raw), audit: auditEvent('enrolment:archive', 'enrolment', cfg.modules.enrolments, id, Object.keys(payload), current, raw) };
}

/* --------------------- programmes and intakes -------------------------- */
/**
 * Programmes and intakes are the delivery structure. They are edited by the
 * academic role and by administrators; deletion is refused whenever anything
 * still points at the record, so removing a programme can never orphan an
 * intake, application or enrolment.
 */
const PROGRAMME_STATUS = ['Draft', 'Open for Applications', 'Running', 'Suspended', 'Archived'];
const ACADEMIC_LEVEL = ['Foundation', 'Certificate', 'Diploma', 'Undergraduate', 'Postgraduate', 'Professional', 'Other'];
const INTAKE_STATUS = ['Planning', 'Open', 'Full', 'In Progress', 'Completed', 'Cancelled'];
const DELIVERY_MODE = ['On Campus', 'Online', 'Hybrid'];

const RB2 = {
  programme: 'id, Product_Name, Product_Code, Programme_Status, Academic_Level, Department, Duration_Value, Duration_Unit, Delivery_Mode, Unit_Price, Award_or_Certificate, Product_Active, LMS_Provider, LMS_Course_ID, LMS_Course_URL, Modified_Time',
  intake: 'id, Name, Intake_ID, External_Intake_Reference, Programme, Academic_Year, Intake_Status, Application_Open_Date, Application_Deadline, Start_Date, End_Date, Capacity, Delivery_Mode, Campus_or_Location, LMS_Cohort_or_Group_ID, Modified_Time'
};

async function programmeCreate(deps, req) {
  const b = req.body || {};
  const name = trimOrNull(b.name);
  if (!name) throw new AppError(422, 'MISSING_NAME', 'A programme name is required.');

  const payload = {
    Product_Name: name,
    // Products has no external-reference field, so the code is the stable
    // identifier. Server-minted; a client-supplied code is ignored.
    Product_Code: refs.mintRef(cfg.modules.programmes),
    Product_Active: b.active !== false
  };
  if (PROGRAMME_STATUS.includes(b.status)) payload.Programme_Status = b.status;
  if (ACADEMIC_LEVEL.includes(b.academicLevel)) payload.Academic_Level = b.academicLevel;
  if (trimOrNull(b.department)) payload.Department = trimOrNull(b.department);
  if (trimOrNull(b.award)) payload.Award_or_Certificate = trimOrNull(b.award);
  if (b.durationValue != null && b.durationValue !== '') payload.Duration_Value = Number(b.durationValue);
  if (trimOrNull(b.durationUnit)) payload.Duration_Unit = trimOrNull(b.durationUnit);
  if (b.tuitionFee != null && b.tuitionFee !== '') payload.Unit_Price = Number(b.tuitionFee);
  // LMS mapping fields stay editable here; the connector also writes them on sync.
  if (trimOrNull(b.lmsCourseId)) payload.LMS_Course_ID = trimOrNull(b.lmsCourseId);
  if (trimOrNull(b.lmsCourseUrl)) payload.LMS_Course_URL = trimOrNull(b.lmsCourseUrl);
  if (trimOrNull(b.lmsProvider)) payload.LMS_Provider = trimOrNull(b.lmsProvider);

  const details = await deps.zoho.crmCreate(req, cfg.modules.programmes, payload);
  const raw = await readBackRaw(deps, req, cfg.modules.programmes, details.id, RB2.programme);
  return { data: n.programme(raw), audit: auditEvent('programme:create', 'programme', cfg.modules.programmes, details.id, Object.keys(payload), null, raw) };
}

async function programmeUpdate(deps, req) {
  const id = numericId(req.params.id);
  if (!id) throw new AppError(400, 'INVALID_ID', 'A numeric record id is required.');
  const b = req.body || {};
  const current = await loadRecord(deps, req, cfg.modules.programmes, id, RB2.programme, 'No programme matches that id.');
  assertUnchanged(current, b.expectedModifiedTime);

  const payload = {};
  if (trimOrNull(b.name)) payload.Product_Name = trimOrNull(b.name);
  if (PROGRAMME_STATUS.includes(b.status)) payload.Programme_Status = b.status;
  if (ACADEMIC_LEVEL.includes(b.academicLevel)) payload.Academic_Level = b.academicLevel;
  if (trimOrNull(b.department)) payload.Department = trimOrNull(b.department);
  if (trimOrNull(b.award)) payload.Award_or_Certificate = trimOrNull(b.award);
  if (b.durationValue != null && b.durationValue !== '') payload.Duration_Value = Number(b.durationValue);
  if (trimOrNull(b.durationUnit)) payload.Duration_Unit = trimOrNull(b.durationUnit);
  if (b.tuitionFee != null && b.tuitionFee !== '') payload.Unit_Price = Number(b.tuitionFee);
  if (typeof b.active === 'boolean') payload.Product_Active = b.active;
  if (trimOrNull(b.lmsCourseId)) payload.LMS_Course_ID = trimOrNull(b.lmsCourseId);
  if (trimOrNull(b.lmsCourseUrl)) payload.LMS_Course_URL = trimOrNull(b.lmsCourseUrl);
  if (!Object.keys(payload).length) throw new AppError(422, 'NO_FIELDS', 'No editable fields were provided.');

  await deps.zoho.crmUpdate(req, cfg.modules.programmes, id, payload);
  const raw = await readBackRaw(deps, req, cfg.modules.programmes, id, RB2.programme);
  return { data: n.programme(raw), audit: auditEvent('programme:update', 'programme', cfg.modules.programmes, id, Object.keys(payload), current, raw) };
}

async function intakeCreate(deps, req) {
  const b = req.body || {};
  const name = trimOrNull(b.name);
  const programmeId = numericId(b.programmeId);
  if (!name) throw new AppError(422, 'MISSING_NAME', 'An intake name is required.');
  if (!programmeId) throw new AppError(422, 'MISSING_PROGRAMME', 'A programme is required.');

  const payload = {
    Name: name,
    Programme: lookup(programmeId),
    External_Intake_Reference: refs.mintRef(cfg.modules.intakes)
  };
  if (INTAKE_STATUS.includes(b.status)) payload.Intake_Status = b.status;
  if (DELIVERY_MODE.includes(b.deliveryMode)) payload.Delivery_Mode = b.deliveryMode;
  if (trimOrNull(b.academicYear)) payload.Academic_Year = trimOrNull(b.academicYear);
  if (trimOrNull(b.startDate)) payload.Start_Date = dateOrNull(b.startDate, 'Start date');
  if (trimOrNull(b.endDate)) payload.End_Date = dateOrNull(b.endDate, 'End date');
  if (trimOrNull(b.applicationOpenDate)) payload.Application_Open_Date = dateOrNull(b.applicationOpenDate, 'Application open date');
  if (trimOrNull(b.applicationDeadline)) payload.Application_Deadline = dateOrNull(b.applicationDeadline, 'Application deadline');
  if (b.capacity != null && b.capacity !== '') payload.Capacity = Number(b.capacity);
  if (trimOrNull(b.location)) payload.Campus_or_Location = trimOrNull(b.location);
  assertDateOrder([
    ['Teaching dates', payload.Start_Date, payload.End_Date],
    ['Application window', payload.Application_Open_Date, payload.Application_Deadline]
  ]);

  const details = await deps.zoho.crmCreate(req, cfg.modules.intakes, payload);
  const raw = await readBackRaw(deps, req, cfg.modules.intakes, details.id, RB2.intake);
  return { data: n.intake(raw), audit: auditEvent('intake:create', 'intake', cfg.modules.intakes, details.id, Object.keys(payload), null, raw) };
}

async function intakeUpdate(deps, req) {
  const id = numericId(req.params.id);
  if (!id) throw new AppError(400, 'INVALID_ID', 'A numeric record id is required.');
  const b = req.body || {};
  const current = await loadRecord(deps, req, cfg.modules.intakes, id, RB2.intake, 'No intake matches that id.');
  assertUnchanged(current, b.expectedModifiedTime);

  const payload = {};
  if (trimOrNull(b.name)) payload.Name = trimOrNull(b.name);
  if (INTAKE_STATUS.includes(b.status)) payload.Intake_Status = b.status;
  if (DELIVERY_MODE.includes(b.deliveryMode)) payload.Delivery_Mode = b.deliveryMode;
  if (trimOrNull(b.academicYear)) payload.Academic_Year = trimOrNull(b.academicYear);
  if (trimOrNull(b.startDate)) payload.Start_Date = dateOrNull(b.startDate, 'Start date');
  if (trimOrNull(b.endDate)) payload.End_Date = dateOrNull(b.endDate, 'End date');
  if (trimOrNull(b.applicationOpenDate)) payload.Application_Open_Date = dateOrNull(b.applicationOpenDate, 'Application open date');
  if (trimOrNull(b.applicationDeadline)) payload.Application_Deadline = dateOrNull(b.applicationDeadline, 'Application deadline');
  if (b.capacity != null && b.capacity !== '') payload.Capacity = Number(b.capacity);
  if (trimOrNull(b.location)) payload.Campus_or_Location = trimOrNull(b.location);
  if (numericId(b.programmeId)) payload.Programme = lookup(b.programmeId);
  if (!Object.keys(payload).length) throw new AppError(422, 'NO_FIELDS', 'No editable fields were provided.');

  // Validate the EFFECTIVE range: a field the caller did not send keeps its
  // current value, so checking only the payload would miss a half-edit.
  assertDateOrder([
    ['Teaching dates',
      payload.Start_Date || current.Start_Date,
      payload.End_Date || current.End_Date],
    ['Application window',
      payload.Application_Open_Date || current.Application_Open_Date,
      payload.Application_Deadline || current.Application_Deadline]
  ]);

  await deps.zoho.crmUpdate(req, cfg.modules.intakes, id, payload);
  const raw = await readBackRaw(deps, req, cfg.modules.intakes, id, RB2.intake);
  return { data: n.intake(raw), audit: auditEvent('intake:update', 'intake', cfg.modules.intakes, id, Object.keys(payload), current, raw) };
}

/** Archives a student by setting the real 'Withdrawn' status value. */
async function studentArchive(deps, req) {
  const id = numericId(req.params.id);
  if (!id) throw new AppError(400, 'INVALID_ID', 'A numeric record id is required.');
  const current = await loadRecord(deps, req, cfg.modules.students, id, RB.student, 'No student matches that id.');
  assertUnchanged(current, (req.body || {}).expectedModifiedTime);

  const payload = { Student_Status: STUDENT_STATUS.WITHDRAWN };
  await deps.zoho.crmUpdate(req, cfg.modules.students, id, payload);
  const raw = await readBackRaw(deps, req, cfg.modules.students, id, RB.student);
  return { data: n.student(raw), audit: auditEvent('student:archive', 'student', cfg.modules.students, id, Object.keys(payload), current, raw) };
}

/**
 * Deletes a demo student, but refuses while applications or enrolments point at
 * them — deleting would orphan those records. The error names the blocking
 * relationship so the UI can offer Archive instead.
 */
async function studentDelete(deps, req) {
  const id = numericId(req.params.id);
  if (!id) throw new AppError(400, 'INVALID_ID', 'A numeric record id is required.');
  await loadRecord(deps, req, cfg.modules.students, id, RB.student, 'No student matches that id.');

  const [apps, enrols] = await Promise.all([
    deps.zoho.crmQuery(req, `select id from ${cfg.modules.applications} where Contact_Name = ${id} limit 5`),
    deps.zoho.crmQuery(req, `select id from ${cfg.modules.enrolments} where Student = ${id} limit 5`)
  ]);
  const blockers = [];
  if (apps && apps.length) blockers.push(`${apps.length} application${apps.length === 1 ? '' : 's'}`);
  if (enrols && enrols.length) blockers.push(`${enrols.length} enrolment${enrols.length === 1 ? '' : 's'}`);
  if (blockers.length) {
    throw new AppError(409, 'HAS_RELATED_RECORDS',
      `This student has ${blockers.join(' and ')} linked to them and cannot be deleted. Archive the student instead.`);
  }

  await deps.zoho.crmDelete(req, cfg.modules.students, id);
  const stillThere = await deps.zoho.crmGetRecord(req, cfg.modules.students, id, 'id');
  if (stillThere) throw new AppError(502, 'DELETE_UNCONFIRMED', 'The record still exists after the delete call.');
  return { data: { id, deleted: true }, audit: { action: 'student:delete', entityType: 'student', recordId: id, changedFields: [], result: 'success' } };
}

/** Deletes a demo enrolment. Nothing depends on an enrolment, so no blockers. */
async function enrolmentDelete(deps, req) {
  const id = numericId(req.params.id);
  if (!id) throw new AppError(400, 'INVALID_ID', 'A numeric record id is required.');
  await loadRecord(deps, req, cfg.modules.enrolments, id, RB.enrolment, 'No enrolment matches that id.');

  await deps.zoho.crmDelete(req, cfg.modules.enrolments, id);
  const stillThere = await deps.zoho.crmGetRecord(req, cfg.modules.enrolments, id, 'id');
  if (stillThere) throw new AppError(502, 'DELETE_UNCONFIRMED', 'The record still exists after the delete call.');
  return { data: { id, deleted: true }, audit: { action: 'enrolment:delete', entityType: 'enrolment', recordId: id, changedFields: [], result: 'success' } };
}


/* ------------------- programme / intake lifecycle ---------------------- */

/**
 * Activates or deactivates a programme. Deactivating is the safe alternative to
 * deleting: related intakes, applications and enrolments keep their links, and
 * the programme simply stops being offered.
 */
async function programmeSetActive(deps, req) {
  const id = numericId(req.params.id);
  if (!id) throw new AppError(400, 'INVALID_ID', 'A numeric record id is required.');
  const b = req.body || {};
  if (typeof b.active !== 'boolean') throw new AppError(422, 'MISSING_ACTIVE', 'Specify whether the programme should be active.');

  const current = await loadRecord(deps, req, cfg.modules.programmes, id, RB2.programme, 'No programme matches that id.');
  assertUnchanged(current, b.expectedModifiedTime);

  const payload = { Product_Active: b.active };
  // Keep the status picklist consistent with the active flag where a matching
  // real value exists, so the two cannot tell different stories.
  if (!b.active && PROGRAMME_STATUS.includes('Suspended')) payload.Programme_Status = 'Suspended';
  if (b.active && String(current.Programme_Status) === 'Suspended') payload.Programme_Status = 'Open for Applications';

  await deps.zoho.crmUpdate(req, cfg.modules.programmes, id, payload);
  const raw = await readBackRaw(deps, req, cfg.modules.programmes, id, RB2.programme);
  return {
    data: n.programme(raw),
    audit: auditEvent(b.active ? 'programme:activate' : 'programme:deactivate', 'programme', cfg.modules.programmes, id, Object.keys(payload), current, raw)
  };
}

/**
 * Deletes a programme, but only when nothing depends on it. A programme is
 * referenced by intakes, applications and enrolments; removing one with
 * dependants would leave those records pointing at nothing. The refusal names
 * every blocking relationship so the UI can suggest deactivating instead.
 */
async function programmeDelete(deps, req) {
  const id = numericId(req.params.id);
  if (!id) throw new AppError(400, 'INVALID_ID', 'A numeric record id is required.');
  await loadRecord(deps, req, cfg.modules.programmes, id, RB2.programme, 'No programme matches that id.');

  const [intakes, apps, enrols] = await Promise.all([
    deps.zoho.crmQuery(req, `select id from ${cfg.modules.intakes} where Programme = ${id} limit 5`),
    deps.zoho.crmQuery(req, `select id from ${cfg.modules.applications} where Programme = ${id} limit 5`),
    deps.zoho.crmQuery(req, `select id from ${cfg.modules.enrolments} where Programme = ${id} limit 5`)
  ]);
  const blockers = [];
  if (intakes && intakes.length) blockers.push(`${intakes.length} intake${intakes.length === 1 ? '' : 's'}`);
  if (apps && apps.length) blockers.push(`${apps.length} application${apps.length === 1 ? '' : 's'}`);
  if (enrols && enrols.length) blockers.push(`${enrols.length} enrolment${enrols.length === 1 ? '' : 's'}`);
  if (blockers.length) {
    throw new AppError(409, 'HAS_RELATED_RECORDS',
      `This programme has ${blockers.join(', ')} linked to it and cannot be deleted. Deactivate it instead.`);
  }

  await deps.zoho.crmDelete(req, cfg.modules.programmes, id);
  const stillThere = await deps.zoho.crmGetRecord(req, cfg.modules.programmes, id, 'id');
  if (stillThere) throw new AppError(502, 'DELETE_UNCONFIRMED', 'The record still exists after the delete call.');
  return { data: { id, deleted: true }, audit: { action: 'programme:delete', entityType: 'programme', recordId: id, changedFields: [], result: 'success' } };
}

/** Opens or closes an intake using the real Intake_Status picklist values. */
async function intakeSetStatus(deps, req) {
  const id = numericId(req.params.id);
  if (!id) throw new AppError(400, 'INVALID_ID', 'A numeric record id is required.');
  const b = req.body || {};
  const status = trimOrNull(b.status);
  if (!status || !INTAKE_STATUS.includes(status)) {
    throw new AppError(422, 'INVALID_STATUS', `Status must be one of: ${INTAKE_STATUS.join(', ')}.`);
  }
  const current = await loadRecord(deps, req, cfg.modules.intakes, id, RB2.intake, 'No intake matches that id.');
  assertUnchanged(current, b.expectedModifiedTime);

  const payload = { Intake_Status: status };
  await deps.zoho.crmUpdate(req, cfg.modules.intakes, id, payload);
  const raw = await readBackRaw(deps, req, cfg.modules.intakes, id, RB2.intake);
  return { data: n.intake(raw), audit: auditEvent('intake:status', 'intake', cfg.modules.intakes, id, Object.keys(payload), current, raw) };
}

/** Deletes an intake only when no application or enrolment points at it. */
async function intakeDelete(deps, req) {
  const id = numericId(req.params.id);
  if (!id) throw new AppError(400, 'INVALID_ID', 'A numeric record id is required.');
  await loadRecord(deps, req, cfg.modules.intakes, id, RB2.intake, 'No intake matches that id.');

  const [apps, enrols] = await Promise.all([
    deps.zoho.crmQuery(req, `select id from ${cfg.modules.applications} where Intake = ${id} limit 5`),
    deps.zoho.crmQuery(req, `select id from ${cfg.modules.enrolments} where Intake = ${id} limit 5`)
  ]);
  const blockers = [];
  if (apps && apps.length) blockers.push(`${apps.length} application${apps.length === 1 ? '' : 's'}`);
  if (enrols && enrols.length) blockers.push(`${enrols.length} enrolment${enrols.length === 1 ? '' : 's'}`);
  if (blockers.length) {
    throw new AppError(409, 'HAS_RELATED_RECORDS',
      `This intake has ${blockers.join(' and ')} linked to it and cannot be deleted. Cancel the intake instead.`);
  }

  await deps.zoho.crmDelete(req, cfg.modules.intakes, id);
  const stillThere = await deps.zoho.crmGetRecord(req, cfg.modules.intakes, id, 'id');
  if (stillThere) throw new AppError(502, 'DELETE_UNCONFIRMED', 'The record still exists after the delete call.');
  return { data: { id, deleted: true }, audit: { action: 'intake:delete', entityType: 'intake', recordId: id, changedFields: [], result: 'success' } };
}

/**
 * Completes an enrolment. Only an Active enrolment can be completed — completing
 * a cancelled or already-completed one is a state error, not a no-op, and is
 * reported as 409 so the caller knows nothing changed.
 */
async function enrolmentComplete(deps, req) {
  const id = numericId(req.params.id);
  if (!id) throw new AppError(400, 'INVALID_ID', 'A numeric record id is required.');
  const b = req.body || {};
  const current = await loadRecord(deps, req, cfg.modules.enrolments, id, RB.enrolment, 'No enrolment matches that id.');
  assertUnchanged(current, b.expectedModifiedTime);

  if (String(current.Enrolment_Status) !== ENROLMENT_STATUS.ACTIVE) {
    throw new AppError(409, 'INVALID_STATE',
      `Only an active enrolment can be completed. This one is "${current.Enrolment_Status || 'unknown'}".`);
  }

  const completionDate = trimOrNull(b.completionDate) || today();
  if (current.Start_Date) assertDateOrder([['Enrolment', current.Start_Date, completionDate]]);

  const payload = { Enrolment_Status: ENROLMENT_STATUS.COMPLETED, Completion_Date: completionDate };
  if (typeof b.certificateIssued === 'boolean') payload.Certificate_Issued = b.certificateIssued;

  await deps.zoho.crmUpdate(req, cfg.modules.enrolments, id, payload);
  const raw = await readBackRaw(deps, req, cfg.modules.enrolments, id, RB.enrolment);

  // A student who has completed is an alumnus, provided they hold no other
  // active enrolment. Best-effort: the enrolment is the record of truth.
  const studentId = current.Student && current.Student.id ? String(current.Student.id) : null;
  if (studentId) {
    try {
      const others = await deps.zoho.crmQuery(req,
        `select id from ${cfg.modules.enrolments} where Student = ${studentId} and Enrolment_Status = '${coql(ENROLMENT_STATUS.ACTIVE)}' limit 1`);
      if (!others || !others.length) {
        await deps.zoho.crmUpdate(req, cfg.modules.students, studentId, { Student_Status: STUDENT_STATUS.ALUMNI });
      }
    } catch { /* status trailing the enrolment is acceptable; the enrolment stands */ }
  }

  return { data: n.enrolment(raw), audit: auditEvent('enrolment:complete', 'enrolment', cfg.modules.enrolments, id, Object.keys(payload), current, raw) };
}

module.exports = {
  AppError,
  STAGE, ALL_STAGES, TRANSITIONS, ENROLMENT_STATUS, STUDENT_STATUS,
  SYNC_STATUS_NOT_SYNCED, MANUAL_ACTION, PIPELINE,
  PIPELINE_ORDER, EXIT_STAGES, DECISION_STAGES, completedStages,
  // handlers
  applicationCreate, applicationUpdate, applicationTransition, applicationArchive, applicationDelete,
  studentCreate, studentUpdate, studentArchive, studentDelete,
  enrolmentCreate, enrolmentUpdate, enrolmentArchive, enrolmentDelete,
  noteCreate,
  programmeCreate, programmeUpdate, programmeSetActive, programmeDelete,
  intakeCreate, intakeUpdate, intakeSetStatus, intakeDelete,
  enrolmentComplete,
  PROGRAMME_STATUS, ACADEMIC_LEVEL, INTAKE_STATUS, DELIVERY_MODE,
  // exposed for tests
  _internals: { dateOrNull, findOrCreateStudentByEmail, provisionEnrolment, assertUnchanged, assertIntakeMatchesProgramme, activateStudent, loadRecord, assertIntakeCapacity }
};
