'use strict';
/**
 * External LMS Connector — Catalyst Data Store.
 *
 * Migration note: this replaces the previous Zoho Learn integration entirely.
 * Course and learning-progress data now live in three Catalyst tables. No
 * request is made to any Zoho Learn endpoint anywhere in the application.
 *
 * WHAT IS SIMULATED AND WHAT IS NOT
 * ---------------------------------
 * The *provider* labels (Moodle, Canvas, TrainerCentral, Generic SCORM LMS)
 * and the learning data (progress, scores, certificates) are a demonstration
 * dataset. There is no network connection to any of those products, and the
 * UI says so on every screen.
 *
 * The *integration* is real: the data persists in Catalyst, maps to live CRM
 * records by id, and the push to CRM performs genuine authenticated writes with
 * read-back. The point being demonstrated is that Catalyst can normalise
 * several providers' shapes into one model and reconcile it with CRM — that
 * part is not simulated.
 *
 * SYSTEM OF RECORD
 * ----------------
 *   CRM      — student identity, application, programme, intake, academic enrolment
 *   Catalyst — external identifiers, provider, delivery metadata, progress,
 *              activity, scores, certificates, synchronisation history
 */
const catalyst = require('zcatalyst-sdk-node');
const cfg = require('./config');

const TABLES = {
  courses: process.env.LMS_COURSES_TABLE || 'lms_courses',
  enrolments: process.env.LMS_ENROLMENTS_TABLE || 'lms_enrolments',
  syncLog: process.env.LMS_SYNC_LOG_TABLE || 'lms_sync_log'
};

/* ------------------------------ vocabulary ------------------------------ */

const PROVIDERS = ['Moodle', 'Canvas', 'TrainerCentral', 'Generic SCORM LMS'];
const DELIVERY_TYPES = ['Self-paced', 'Live', 'Blended', 'Cohort'];
const PUBLICATION_STATUSES = ['Published', 'Draft', 'Retired'];
const LMS_STATUSES = ['Invited', 'Not Started', 'In Progress', 'Completed', 'Failed', 'Withdrawn'];
const CERTIFICATE_STATUSES = ['Not Available', 'Pending', 'Issued'];
const MAPPING_STATUSES = ['Mapped', 'Unmapped', 'Error'];
const SYNC_STATUSES = ['Synced', 'Pending', 'Error'];

/** Typed error the route wrapper turns into a safe HTTP response. */
class LmsError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

/* -------------------------------- helpers ------------------------------- */

const app = (req) => catalyst.initialize(req);

/**
 * ZCQL has no parameter binding, so every value that reaches a query is escaped
 * here and nowhere else. Single quotes are doubled and the length is capped,
 * because an unbounded value in a query string is how injection starts.
 */
const q = (v) => String(v == null ? '' : v).replace(/'/g, "''").slice(0, 200);

/** Row ids and CRM ids are always numeric; anything else is rejected outright. */
const numeric = (v) => String(v == null ? '' : v).replace(/[^0-9]/g, '');

const str = (v) => (v === null || v === undefined || v === '' ? null : String(v));
/**
 * Catalyst returns the literal string "nu" for a null numeric column rather
 * than null, so a naive Number() yields NaN and the UI renders "NaN". Anything
 * that does not parse to a finite number is treated as absent.
 */
const num = (v) => {
  if (v === null || v === undefined || v === '' || v === 'nu') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const nowIso = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

/** Catalyst returns rows keyed by table name; flatten to the row itself. */
const flatten = (rows, table) => (rows || []).map((r) => r[table] || r);

async function zcql(req, query) {
  return await app(req).zcql().executeZCQLQuery(query);
}

const tableOf = (req, name) => app(req).datastore().table(name);

/** Uniqueness is composite in the spec but per-column in Catalyst. */
const courseKey = (provider, externalId) => `${provider}::${externalId}`;
const enrolmentKey = (provider, externalId) => `${provider}::${externalId}`;

/* ------------------------------ normalisers ----------------------------- */

function course(r) {
  return {
    id: str(r.ROWID),
    uniqueKey: str(r.Unique_Key),
    externalCourseId: str(r.External_Course_ID),
    provider: str(r.Provider),
    name: str(r.Course_Name),
    description: str(r.Course_Description),
    deliveryType: str(r.Delivery_Type),
    instructor: str(r.Instructor_Name),
    durationHours: num(r.Duration_Hours),
    level: str(r.Course_Level),
    category: str(r.Category),
    language: str(r.Course_Language),
    publicationStatus: str(r.Publication_Status),
    published: String(r.Publication_Status || '').toLowerCase() === 'published',
    url: str(r.Course_URL),
    crmProgrammeId: str(r.CRM_Programme_ID),
    crmProgrammeReference: str(r.CRM_Programme_Reference),
    mappingStatus: str(r.Mapping_Status) || 'Unmapped',
    syncStatus: str(r.Sync_Status) || 'Pending',
    lastSyncTime: str(r.Last_Sync_Time),
    lastSyncMessage: str(r.Last_Sync_Message),
    archived: r.Is_Archived === true || r.Is_Archived === 'true',
    createdTime: str(r.CREATEDTIME),
    modifiedTime: str(r.MODIFIEDTIME),
    source: 'catalyst-lms',
    demo: true
  };
}

function enrolment(r) {
  return {
    id: str(r.ROWID),
    uniqueKey: str(r.Unique_Key),
    externalEnrolmentId: str(r.External_Enrolment_ID),
    provider: str(r.Provider),
    externalLearnerId: str(r.External_Learner_ID),
    externalCourseId: str(r.External_Course_ID),
    crmStudentId: str(r.CRM_Student_ID),
    crmStudentReference: str(r.CRM_Student_Reference),
    crmEnrolmentId: str(r.CRM_Enrolment_ID),
    crmEnrolmentReference: str(r.CRM_Enrolment_Reference),
    lmsStatus: str(r.LMS_Status),
    progressPercentage: num(r.Progress_Percentage),
    startedDate: str(r.Started_Date),
    lastActivityTime: str(r.Last_Activity_Time),
    completionDate: str(r.Completion_Date),
    assessmentScore: num(r.Assessment_Score),
    certificateStatus: str(r.Certificate_Status),
    certificateUrl: str(r.Certificate_URL),
    mappingStatus: str(r.Mapping_Status) || 'Unmapped',
    syncStatus: str(r.Sync_Status) || 'Pending',
    lastSyncTime: str(r.Last_Sync_Time),
    lastSyncMessage: str(r.Last_Sync_Message),
    createdTime: str(r.CREATEDTIME),
    modifiedTime: str(r.MODIFIEDTIME),
    source: 'catalyst-lms',
    demo: true
  };
}

function syncLogEntry(r) {
  return {
    id: str(r.ROWID),
    requestId: str(r.Request_ID),
    direction: str(r.Direction),
    entityType: str(r.Entity_Type),
    provider: str(r.Provider),
    externalRecordId: str(r.External_Record_ID),
    crmModule: str(r.CRM_Module),
    crmRecordId: str(r.CRM_Record_ID),
    operation: str(r.Operation),
    changedFields: r.Changed_Fields ? String(r.Changed_Fields).split(',').filter(Boolean) : [],
    result: str(r.Result_Status),
    message: str(r.Message),
    triggeredBy: str(r.Triggered_By),
    occurredAt: str(r.CREATEDTIME)
  };
}

/* -------------------------------- sync log ------------------------------ */

/**
 * Appends one line to the synchronisation history. Never throws: losing a log
 * entry must not fail the operation it was describing, and a caller that has
 * already written to CRM cannot be rolled back by a logging failure.
 */
async function log(req, event) {
  try {
    await tableOf(req, TABLES.syncLog).insertRow({
      Request_ID: req.requestId || null,
      Direction: event.direction || 'LMS to CRM',
      Entity_Type: event.entityType || null,
      Provider: event.provider || null,
      External_Record_ID: event.externalRecordId || null,
      CRM_Module: event.crmModule || null,
      CRM_Record_ID: event.crmRecordId || null,
      Operation: event.operation || null,
      Changed_Fields: (event.changedFields || []).join(',').slice(0, 200),
      Result_Status: event.result || null,
      Message: String(event.message || '').slice(0, 200),
      // Attributed to the authenticated principal, so the history says who.
      Triggered_By: (req.principal && req.principal.email) || null
    });
  } catch {
    /* logging is best-effort by design */
  }
}

async function listSyncLog(req, { limit = 50, entityType, result } = {}) {
  const where = [];
  if (entityType) where.push(`Entity_Type = '${q(entityType)}'`);
  if (result) where.push(`Result_Status = '${q(result)}'`);
  const clause = where.length ? ` where ${where.join(' and ')}` : '';
  const n = Math.min(Number(limit) || 50, 200);
  const rows = await zcql(req,
    `select ROWID, Request_ID, Direction, Entity_Type, Provider, External_Record_ID, CRM_Module, CRM_Record_ID, Operation, Changed_Fields, Result_Status, Message, Triggered_By, CREATEDTIME from ${TABLES.syncLog}${clause} order by ROWID desc limit ${n}`);
  return flatten(rows, TABLES.syncLog).map(syncLogEntry);
}

/* -------------------------------- courses ------------------------------- */

const COURSE_COLUMNS = 'ROWID, Unique_Key, External_Course_ID, Provider, Course_Name, Course_Description, Delivery_Type, Instructor_Name, Duration_Hours, Course_Level, Category, Course_Language, Publication_Status, Course_URL, CRM_Programme_ID, CRM_Programme_Reference, Mapping_Status, Sync_Status, Last_Sync_Time, Last_Sync_Message, Is_Archived, CREATEDTIME, MODIFIEDTIME';

async function listCourses(req, { includeArchived = false } = {}) {
  // ZCQL requires a WHERE clause, and ROWID is always populated.
  const rows = await zcql(req,
    `select ${COURSE_COLUMNS} from ${TABLES.courses} where ROWID is not null order by Course_Name asc limit 300`);
  const all = flatten(rows, TABLES.courses).map(course);
  return includeArchived ? all : all.filter((c) => !c.archived);
}

async function getCourse(req, id) {
  const rowid = numeric(id);
  if (!rowid) throw new LmsError(400, 'INVALID_ID', 'A numeric record id is required.');
  const rows = await zcql(req,
    `select ${COURSE_COLUMNS} from ${TABLES.courses} where ROWID = ${rowid} limit 1`);
  const found = flatten(rows, TABLES.courses);
  return found.length ? course(found[0]) : null;
}

async function findCourseByExternalId(req, provider, externalCourseId) {
  const rows = await zcql(req,
    `select ${COURSE_COLUMNS} from ${TABLES.courses} where Unique_Key = '${q(courseKey(provider, externalCourseId))}' limit 1`);
  const found = flatten(rows, TABLES.courses);
  return found.length ? course(found[0]) : null;
}

/**
 * Builds a course row from an explicit allow-list. `body` is never spread, so a
 * caller cannot set Sync_Status, Mapping_Status or the unique key directly —
 * those are decided by this module.
 */
function courseRow(b, { forCreate = false } = {}) {
  const row = {};
  const put = (col, val) => { if (val !== undefined) row[col] = val; };

  if (forCreate) {
    if (!PROVIDERS.includes(b.provider)) {
      throw new LmsError(422, 'INVALID_PROVIDER', `Provider must be one of: ${PROVIDERS.join(', ')}.`);
    }
    const ext = String(b.externalCourseId || '').trim();
    if (!ext) throw new LmsError(422, 'MISSING_EXTERNAL_ID', 'An external course id is required.');
    if (!String(b.name || '').trim()) throw new LmsError(422, 'MISSING_NAME', 'A course name is required.');
    row.Provider = b.provider;
    row.External_Course_ID = ext;
    row.Unique_Key = courseKey(b.provider, ext);
  }

  if (b.name !== undefined) put('Course_Name', String(b.name).trim().slice(0, 200));
  if (b.description !== undefined) put('Course_Description', b.description == null ? null : String(b.description).slice(0, 9000));
  if (b.deliveryType !== undefined) {
    if (b.deliveryType && !DELIVERY_TYPES.includes(b.deliveryType)) {
      throw new LmsError(422, 'INVALID_DELIVERY_TYPE', `Delivery type must be one of: ${DELIVERY_TYPES.join(', ')}.`);
    }
    put('Delivery_Type', b.deliveryType || null);
  }
  if (b.instructor !== undefined) put('Instructor_Name', b.instructor == null ? null : String(b.instructor).slice(0, 120));
  if (b.durationHours !== undefined) put('Duration_Hours', b.durationHours === '' || b.durationHours == null ? null : Number(b.durationHours));
  if (b.level !== undefined) put('Course_Level', b.level == null ? null : String(b.level).slice(0, 40));
  if (b.category !== undefined) put('Category', b.category == null ? null : String(b.category).slice(0, 80));
  if (b.language !== undefined) put('Course_Language', b.language == null ? null : String(b.language).slice(0, 40));
  if (b.publicationStatus !== undefined) {
    if (b.publicationStatus && !PUBLICATION_STATUSES.includes(b.publicationStatus)) {
      throw new LmsError(422, 'INVALID_PUBLICATION_STATUS', `Publication status must be one of: ${PUBLICATION_STATUSES.join(', ')}.`);
    }
    put('Publication_Status', b.publicationStatus || null);
  }
  if (b.url !== undefined) put('Course_URL', b.url == null ? null : String(b.url).slice(0, 200));
  return row;
}

async function createCourse(req, body) {
  const b = body || {};
  const existing = await findCourseByExternalId(req, b.provider, b.externalCourseId);
  if (existing) {
    throw new LmsError(409, 'DUPLICATE_COURSE',
      `${b.provider} already has a course with external id "${b.externalCourseId}".`);
  }
  const row = courseRow(b, { forCreate: true });
  row.Mapping_Status = 'Unmapped';
  row.Sync_Status = 'Pending';
  row.Is_Archived = false;

  const inserted = await tableOf(req, TABLES.courses).insertRow(row);
  const created = await getCourse(req, inserted.ROWID);
  if (!created) throw new LmsError(502, 'READBACK_FAILED', 'The course could not be read back after being created.');
  await log(req, {
    direction: 'LMS to CRM', entityType: 'Course', provider: created.provider,
    externalRecordId: created.externalCourseId, operation: 'Create',
    changedFields: Object.keys(row), result: 'success', message: 'Simulated LMS course created in Catalyst.'
  });
  return created;
}

async function updateCourse(req, id, body) {
  const current = await getCourse(req, id);
  if (!current) throw new LmsError(404, 'NOT_FOUND', 'No LMS course matches that id.');
  assertUnchanged(current, (body || {}).expectedModifiedTime);

  const row = courseRow(body || {});
  if (!Object.keys(row).length) throw new LmsError(422, 'NO_FIELDS', 'No editable fields were provided.');
  row.ROWID = current.id;

  await tableOf(req, TABLES.courses).updateRow(row);
  const after = await getCourse(req, current.id);
  await log(req, {
    entityType: 'Course', provider: after.provider, externalRecordId: after.externalCourseId,
    operation: 'Update', changedFields: Object.keys(row).filter((k) => k !== 'ROWID'),
    result: 'success', message: 'Simulated LMS course updated in Catalyst.'
  });
  return after;
}

async function archiveCourse(req, id) {
  const current = await getCourse(req, id);
  if (!current) throw new LmsError(404, 'NOT_FOUND', 'No LMS course matches that id.');
  await tableOf(req, TABLES.courses).updateRow({ ROWID: current.id, Is_Archived: true });
  await log(req, {
    entityType: 'Course', provider: current.provider, externalRecordId: current.externalCourseId,
    operation: 'Update', changedFields: ['Is_Archived'], result: 'success',
    message: 'Demo course archived.'
  });
  return await getCourse(req, current.id);
}

/**
 * Maps a course to a CRM Programme, or clears the mapping.
 *
 * The Programme is read from CRM first — a mapping to an id that does not exist
 * is worse than no mapping, because everything downstream would then look
 * correct while pointing at nothing.
 */
async function mapCourse(deps, req, id, programmeId) {
  const current = await getCourse(req, id);
  if (!current) throw new LmsError(404, 'NOT_FOUND', 'No LMS course matches that id.');

  if (!programmeId) {
    await tableOf(req, TABLES.courses).updateRow({
      ROWID: current.id, CRM_Programme_ID: null, CRM_Programme_Reference: null,
      Mapping_Status: 'Unmapped', Sync_Status: 'Pending'
    });
    await log(req, {
      entityType: 'Course', provider: current.provider, externalRecordId: current.externalCourseId,
      operation: 'Map', result: 'success', message: 'Mapping cleared.'
    });
    return await getCourse(req, current.id);
  }

  const pid = numeric(programmeId);
  if (!pid) throw new LmsError(400, 'INVALID_ID', 'A numeric CRM Programme id is required.');

  const rows = await deps.zoho.crmQuery(req,
    `select id, Product_Name, Product_Code from ${cfg.modules.programmes} where id = ${pid} limit 1`);
  if (!rows || !rows.length) {
    await tableOf(req, TABLES.courses).updateRow({
      ROWID: current.id, Mapping_Status: 'Error',
      Last_Sync_Message: 'The chosen CRM Programme does not exist.'
    });
    throw new LmsError(422, 'PROGRAMME_NOT_FOUND', 'That CRM Programme does not exist.');
  }

  await tableOf(req, TABLES.courses).updateRow({
    ROWID: current.id,
    CRM_Programme_ID: String(rows[0].id),
    CRM_Programme_Reference: String(rows[0].Product_Code || rows[0].Product_Name || '').slice(0, 120),
    Mapping_Status: 'Mapped',
    // A remap invalidates any previous sync, so it goes back to Pending.
    Sync_Status: 'Pending'
  });
  await log(req, {
    entityType: 'Course', provider: current.provider, externalRecordId: current.externalCourseId,
    crmModule: cfg.modules.programmes, crmRecordId: String(rows[0].id),
    operation: 'Map', result: 'success', message: `Mapped to ${rows[0].Product_Name}.`
  });
  return await getCourse(req, current.id);
}

/* --------------------------- course push to CRM -------------------------- */

/**
 * Fields on the CRM Programme this connector is allowed to write.
 *
 * Deliberately narrow. Programme name, fee, status and every other academic
 * value are owned by CRM and are never touched — §6 of the specification, and
 * the sensible rule regardless: simulated data must not overwrite real
 * academic records.
 */
const PROGRAMME_SYNC_FIELDS = {
  LMS_Provider: (c) => c.provider,
  LMS_Course_ID: (c) => c.externalCourseId,
  LMS_Course_URL: (c) => c.url
};

async function syncCourseToCrm(deps, req, id) {
  const current = await getCourse(req, id);
  if (!current) throw new LmsError(404, 'NOT_FOUND', 'No LMS course matches that id.');

  if (current.mappingStatus !== 'Mapped' || !current.crmProgrammeId) {
    throw new LmsError(422, 'NOT_MAPPED',
      'Map this course to a CRM Programme before syncing.');
  }

  const programmeId = numeric(current.crmProgrammeId);
  const fields = 'id, Product_Name, Product_Code, LMS_Provider, LMS_Course_ID, LMS_Course_URL, Modified_Time';

  try {
    const before = await deps.zoho.crmGetRecord(req, cfg.modules.programmes, programmeId, fields);
    if (!before) throw new LmsError(404, 'PROGRAMME_NOT_FOUND', 'The mapped CRM Programme no longer exists.');

    // Only send values that are actually present. A blank simulated value must
    // never blank out a populated CRM field.
    const payload = {};
    Object.entries(PROGRAMME_SYNC_FIELDS).forEach(([crmField, read]) => {
      const value = read(current);
      if (value !== null && value !== undefined && value !== '') payload[crmField] = value;
    });

    if (!Object.keys(payload).length) {
      throw new LmsError(422, 'NOTHING_TO_SYNC', 'This course has no values to push to CRM.');
    }

    await deps.zoho.crmUpdate(req, cfg.modules.programmes, programmeId, payload);

    // Read-back: the sync is only "Synced" once CRM confirms what it stored.
    const after = await deps.zoho.crmGetRecord(req, cfg.modules.programmes, programmeId, fields);
    if (!after) throw new LmsError(502, 'READBACK_FAILED', 'The Programme could not be read back after the update.');

    const mismatched = Object.keys(payload).filter((f) => String(after[f] || '') !== String(payload[f]));
    if (mismatched.length) {
      throw new LmsError(502, 'READBACK_MISMATCH',
        `CRM accepted the update but returned different values for: ${mismatched.join(', ')}.`);
    }

    await tableOf(req, TABLES.courses).updateRow({
      ROWID: current.id, Sync_Status: 'Synced', Last_Sync_Time: nowIso(),
      Last_Sync_Message: `Pushed ${Object.keys(payload).join(', ')} to ${after.Product_Name}.`
    });
    await log(req, {
      entityType: 'Course', provider: current.provider, externalRecordId: current.externalCourseId,
      crmModule: cfg.modules.programmes, crmRecordId: String(programmeId), operation: 'Update',
      changedFields: Object.keys(payload), result: 'success',
      message: `Synced to ${after.Product_Name}.`
    });
    return { course: await getCourse(req, current.id), crmFieldsWritten: Object.keys(payload) };
  } catch (err) {
    const message = String(err && err.message ? err.message : 'Synchronisation failed.').slice(0, 200);
    await tableOf(req, TABLES.courses).updateRow({
      ROWID: current.id, Sync_Status: 'Error', Last_Sync_Time: nowIso(), Last_Sync_Message: message
    });
    await log(req, {
      entityType: 'Course', provider: current.provider, externalRecordId: current.externalCourseId,
      crmModule: cfg.modules.programmes, crmRecordId: current.crmProgrammeId,
      operation: 'Error', result: 'error', message
    });
    throw err;
  }
}

/**
 * Bulk sync. Each course is independent: one failure is recorded against that
 * course and the rest continue, so a single bad record cannot block the batch.
 */
async function bulkSyncCourses(deps, req) {
  const all = await listCourses(req);
  const mapped = all.filter((c) => c.mappingStatus === 'Mapped' && c.crmProgrammeId);
  const results = [];
  for (const c of mapped) {
    try {
      await syncCourseToCrm(deps, req, c.id);
      results.push({ id: c.id, name: c.name, result: 'success' });
    } catch (err) {
      results.push({ id: c.id, name: c.name, result: 'error', message: String(err.message).slice(0, 200) });
    }
  }
  return {
    attempted: results.length,
    succeeded: results.filter((r) => r.result === 'success').length,
    failed: results.filter((r) => r.result === 'error').length,
    skipped: all.length - mapped.length,
    results
  };
}

/* ------------------------------- enrolments ------------------------------ */

const ENROLMENT_COLUMNS = 'ROWID, Unique_Key, External_Enrolment_ID, Provider, External_Learner_ID, External_Course_ID, CRM_Student_ID, CRM_Student_Reference, CRM_Enrolment_ID, CRM_Enrolment_Reference, LMS_Status, Progress_Percentage, Started_Date, Last_Activity_Time, Completion_Date, Assessment_Score, Certificate_Status, Certificate_URL, Mapping_Status, Sync_Status, Last_Sync_Time, Last_Sync_Message, CREATEDTIME, MODIFIEDTIME';

async function listEnrolments(req) {
  const rows = await zcql(req,
    `select ${ENROLMENT_COLUMNS} from ${TABLES.enrolments} where ROWID is not null order by ROWID desc limit 300`);
  return flatten(rows, TABLES.enrolments).map(enrolment);
}

async function getEnrolment(req, id) {
  const rowid = numeric(id);
  if (!rowid) throw new LmsError(400, 'INVALID_ID', 'A numeric record id is required.');
  const rows = await zcql(req,
    `select ${ENROLMENT_COLUMNS} from ${TABLES.enrolments} where ROWID = ${rowid} limit 1`);
  const found = flatten(rows, TABLES.enrolments);
  return found.length ? enrolment(found[0]) : null;
}

async function findEnrolmentByExternalId(req, provider, externalEnrolmentId) {
  const rows = await zcql(req,
    `select ${ENROLMENT_COLUMNS} from ${TABLES.enrolments} where Unique_Key = '${q(enrolmentKey(provider, externalEnrolmentId))}' limit 1`);
  const found = flatten(rows, TABLES.enrolments);
  return found.length ? enrolment(found[0]) : null;
}

async function enrolmentsForStudent(req, crmStudentId) {
  const sid = numeric(crmStudentId);
  if (!sid) return [];
  const rows = await zcql(req,
    `select ${ENROLMENT_COLUMNS} from ${TABLES.enrolments} where CRM_Student_ID = '${q(sid)}' limit 100`);
  return flatten(rows, TABLES.enrolments).map(enrolment);
}

async function enrolmentsForCrmEnrolment(req, crmEnrolmentId) {
  const eid = numeric(crmEnrolmentId);
  if (!eid) return [];
  const rows = await zcql(req,
    `select ${ENROLMENT_COLUMNS} from ${TABLES.enrolments} where CRM_Enrolment_ID = '${q(eid)}' limit 50`);
  return flatten(rows, TABLES.enrolments).map(enrolment);
}

function enrolmentRow(b, { forCreate = false } = {}) {
  const row = {};
  const put = (col, val) => { if (val !== undefined) row[col] = val; };

  if (forCreate) {
    if (!PROVIDERS.includes(b.provider)) {
      throw new LmsError(422, 'INVALID_PROVIDER', `Provider must be one of: ${PROVIDERS.join(', ')}.`);
    }
    const ext = String(b.externalEnrolmentId || '').trim();
    if (!ext) throw new LmsError(422, 'MISSING_EXTERNAL_ID', 'An external enrolment id is required.');
    row.Provider = b.provider;
    row.External_Enrolment_ID = ext;
    row.Unique_Key = enrolmentKey(b.provider, ext);
  }

  if (b.externalLearnerId !== undefined) put('External_Learner_ID', b.externalLearnerId == null ? null : String(b.externalLearnerId).slice(0, 100));
  if (b.externalCourseId !== undefined) put('External_Course_ID', b.externalCourseId == null ? null : String(b.externalCourseId).slice(0, 100));
  if (b.lmsStatus !== undefined) {
    if (b.lmsStatus && !LMS_STATUSES.includes(b.lmsStatus)) {
      throw new LmsError(422, 'INVALID_LMS_STATUS', `LMS status must be one of: ${LMS_STATUSES.join(', ')}.`);
    }
    put('LMS_Status', b.lmsStatus || null);
  }
  if (b.progressPercentage !== undefined) {
    const p = b.progressPercentage === '' || b.progressPercentage == null ? null : Number(b.progressPercentage);
    if (p !== null && (Number.isNaN(p) || p < 0 || p > 100)) {
      throw new LmsError(422, 'INVALID_PROGRESS', 'Progress must be between 0 and 100.');
    }
    put('Progress_Percentage', p);
  }
  if (b.assessmentScore !== undefined) {
    const s = b.assessmentScore === '' || b.assessmentScore == null ? null : Number(b.assessmentScore);
    if (s !== null && (Number.isNaN(s) || s < 0 || s > 100)) {
      throw new LmsError(422, 'INVALID_SCORE', 'Assessment score must be between 0 and 100.');
    }
    put('Assessment_Score', s);
  }
  if (b.startedDate !== undefined) put('Started_Date', b.startedDate || null);
  if (b.completionDate !== undefined) put('Completion_Date', b.completionDate || null);
  if (b.lastActivityTime !== undefined) put('Last_Activity_Time', b.lastActivityTime || null);
  if (b.certificateStatus !== undefined) {
    if (b.certificateStatus && !CERTIFICATE_STATUSES.includes(b.certificateStatus)) {
      throw new LmsError(422, 'INVALID_CERTIFICATE_STATUS', `Certificate status must be one of: ${CERTIFICATE_STATUSES.join(', ')}.`);
    }
    put('Certificate_Status', b.certificateStatus || null);
  }
  if (b.certificateUrl !== undefined) put('Certificate_URL', b.certificateUrl == null ? null : String(b.certificateUrl).slice(0, 200));
  return row;
}

async function createEnrolment(deps, req, body) {
  const b = body || {};
  const existing = await findEnrolmentByExternalId(req, b.provider, b.externalEnrolmentId);
  if (existing) {
    throw new LmsError(409, 'DUPLICATE_ENROLMENT',
      `${b.provider} already has an enrolment with external id "${b.externalEnrolmentId}".`);
  }
  const row = enrolmentRow(b, { forCreate: true });
  row.Mapping_Status = 'Unmapped';
  row.Sync_Status = 'Pending';

  const inserted = await tableOf(req, TABLES.enrolments).insertRow(row);
  let created = await getEnrolment(req, inserted.ROWID);

  // Map immediately when the caller supplied a student, so a new record is not
  // left unmapped for no reason.
  if (b.crmStudentId || b.studentEmail) {
    try {
      created = await mapEnrolmentStudent(deps, req, created.id, b);
    } catch {
      /* mapping failure is recorded on the row; the record itself still exists */
    }
  }

  await log(req, {
    entityType: 'Enrolment', provider: created.provider, externalRecordId: created.externalEnrolmentId,
    operation: 'Create', changedFields: Object.keys(row), result: 'success',
    message: 'Simulated LMS enrolment created in Catalyst.'
  });
  return created;
}

async function updateEnrolment(req, id, body) {
  const current = await getEnrolment(req, id);
  if (!current) throw new LmsError(404, 'NOT_FOUND', 'No LMS enrolment matches that id.');
  assertUnchanged(current, (body || {}).expectedModifiedTime);

  const row = enrolmentRow(body || {});
  if (!Object.keys(row).length) throw new LmsError(422, 'NO_FIELDS', 'No editable fields were provided.');
  row.ROWID = current.id;
  // Editing the learning data invalidates the last sync.
  row.Sync_Status = 'Pending';

  await tableOf(req, TABLES.enrolments).updateRow(row);
  const after = await getEnrolment(req, current.id);
  await log(req, {
    entityType: 'Enrolment', provider: after.provider, externalRecordId: after.externalEnrolmentId,
    operation: 'Update', changedFields: Object.keys(row).filter((k) => k !== 'ROWID'),
    result: 'success', message: 'Simulated LMS enrolment updated in Catalyst.'
  });
  return after;
}

/**
 * Resolves an LMS enrolment to a CRM Student, following the required priority:
 *
 *   1. an explicitly supplied CRM Student id
 *   2. an existing CRM external student reference
 *   3. an exact, normalised email match
 *   4. leave unmapped
 *
 * Name matching is deliberately absent, and a multi-hit email is recorded as a
 * mapping Error rather than resolved by guessing — picking one of two people
 * and attaching their learning record to the wrong student is not a recoverable
 * mistake.
 */
async function mapEnrolmentStudent(deps, req, id, body) {
  const current = await getEnrolment(req, id);
  if (!current) throw new LmsError(404, 'NOT_FOUND', 'No LMS enrolment matches that id.');
  const b = body || {};

  const setError = async (message) => {
    await tableOf(req, TABLES.enrolments).updateRow({
      ROWID: current.id, Mapping_Status: 'Error', Last_Sync_Message: message.slice(0, 200)
    });
    await log(req, {
      entityType: 'Enrolment', provider: current.provider, externalRecordId: current.externalEnrolmentId,
      operation: 'Error', result: 'error', message
    });
    return await getEnrolment(req, current.id);
  };

  let student = null;

  // 1. Explicit CRM id.
  if (numeric(b.crmStudentId)) {
    const rows = await deps.zoho.crmQuery(req,
      `select id, Full_Name, Email, External_Student_Ref from ${cfg.modules.students} where id = ${numeric(b.crmStudentId)} limit 1`);
    if (!rows || !rows.length) return await setError('The chosen CRM Student does not exist.');
    student = rows[0];
  }

  // 2. Existing CRM external reference.
  if (!student && b.crmStudentReference) {
    const rows = await deps.zoho.crmQuery(req,
      `select id, Full_Name, Email, External_Student_Ref from ${cfg.modules.students} where External_Student_Ref = '${String(b.crmStudentReference).replace(/'/g, "\\'")}' limit 2`);
    if (rows && rows.length === 1) student = rows[0];
    else if (rows && rows.length > 1) return await setError('More than one CRM Student shares that reference.');
  }

  // 3. Exact normalised email.
  if (!student && b.studentEmail) {
    const email = String(b.studentEmail).trim().toLowerCase();
    const rows = await deps.zoho.crmQuery(req,
      `select id, Full_Name, Email, External_Student_Ref from ${cfg.modules.students} where Email = '${email.replace(/'/g, "\\'")}' limit 5`);
    const exact = (rows || []).filter((r) => String(r.Email || '').trim().toLowerCase() === email);
    if (exact.length === 1) [student] = exact;
    else if (exact.length > 1) {
      return await setError(`${exact.length} CRM Students share the email ${email}. Link the correct one manually.`);
    }
  }

  // 4. Leave unmapped.
  if (!student) {
    await tableOf(req, TABLES.enrolments).updateRow({
      ROWID: current.id, Mapping_Status: 'Unmapped',
      Last_Sync_Message: 'No CRM Student could be matched.'
    });
    return await getEnrolment(req, current.id);
  }

  await tableOf(req, TABLES.enrolments).updateRow({
    ROWID: current.id,
    CRM_Student_ID: String(student.id),
    CRM_Student_Reference: String(student.External_Student_Ref || student.Full_Name || '').slice(0, 120),
    Mapping_Status: current.crmEnrolmentId ? 'Mapped' : 'Unmapped',
    Last_Sync_Message: `Matched CRM Student ${student.Full_Name}.`
  });
  await log(req, {
    entityType: 'Enrolment', provider: current.provider, externalRecordId: current.externalEnrolmentId,
    crmModule: cfg.modules.students, crmRecordId: String(student.id),
    operation: 'Map', result: 'success', message: `Mapped to ${student.Full_Name}.`
  });
  return await getEnrolment(req, current.id);
}

/**
 * Links an LMS enrolment to an existing CRM Enrolment, validating that the CRM
 * record actually belongs to the mapped student. Linking learning progress to
 * another student's enrolment would corrupt both records.
 */
async function mapEnrolmentToCrmEnrolment(deps, req, id, crmEnrolmentId) {
  const current = await getEnrolment(req, id);
  if (!current) throw new LmsError(404, 'NOT_FOUND', 'No LMS enrolment matches that id.');

  if (!crmEnrolmentId) {
    await tableOf(req, TABLES.enrolments).updateRow({
      ROWID: current.id, CRM_Enrolment_ID: null, CRM_Enrolment_Reference: null,
      Mapping_Status: 'Unmapped', Sync_Status: 'Pending'
    });
    return await getEnrolment(req, current.id);
  }

  const eid = numeric(crmEnrolmentId);
  if (!eid) throw new LmsError(400, 'INVALID_ID', 'A numeric CRM Enrolment id is required.');

  const rows = await deps.zoho.crmQuery(req,
    `select id, Name, Student, Programme, Intake from ${cfg.modules.enrolments} where id = ${eid} limit 1`);
  if (!rows || !rows.length) throw new LmsError(422, 'ENROLMENT_NOT_FOUND', 'That CRM Enrolment does not exist.');

  const crmEnrolment = rows[0];
  const ownerId = crmEnrolment.Student && crmEnrolment.Student.id ? String(crmEnrolment.Student.id) : null;
  if (current.crmStudentId && ownerId && ownerId !== String(current.crmStudentId)) {
    throw new LmsError(422, 'STUDENT_MISMATCH',
      'That CRM Enrolment belongs to a different student than this LMS record is mapped to.');
  }

  await tableOf(req, TABLES.enrolments).updateRow({
    ROWID: current.id,
    CRM_Enrolment_ID: String(crmEnrolment.id),
    CRM_Enrolment_Reference: String(crmEnrolment.Name || '').slice(0, 120),
    // Adopt the CRM enrolment's student when this record had none.
    CRM_Student_ID: current.crmStudentId || ownerId,
    Mapping_Status: 'Mapped',
    Sync_Status: 'Pending'
  });
  await log(req, {
    entityType: 'Enrolment', provider: current.provider, externalRecordId: current.externalEnrolmentId,
    crmModule: cfg.modules.enrolments, crmRecordId: String(crmEnrolment.id),
    operation: 'Map', result: 'success', message: `Linked to ${crmEnrolment.Name}.`
  });
  return await getEnrolment(req, current.id);
}

/* ------------------------- enrolment push to CRM ------------------------- */

/**
 * CRM Enrolment fields this connector may write, and where each value comes
 * from. Verified against live CRM metadata — every one of these exists.
 *
 * The six fields the specification also lists — LMS status, assessment score,
 * certificate status, certificate URL, external learner id and last activity -
 * do NOT exist on the Enrolments module. They stay in Catalyst and are surfaced
 * in the UI from there. See RECOMMENDED_CRM_FIELDS below.
 */
const ENROLMENT_SYNC_FIELDS = {
  LMS_Provider: (e) => e.provider,
  LMS_Enrolment_ID: (e) => e.externalEnrolmentId,
  Progress_Percentage: (e) => e.progressPercentage,
  Last_LMS_Sync: () => new Date().toISOString().slice(0, 10),
  External_Sync_Status: () => 'Synced'
};

/**
 * Fields that would be needed for a complete sync but are absent from CRM.
 * Reported in the UI and in the final report rather than created automatically —
 * CRM metadata changes are out of scope for this phase.
 */
const RECOMMENDED_CRM_FIELDS = [
  { module: 'Enrolments', apiName: 'LMS_Status', type: 'Picklist', values: LMS_STATUSES },
  { module: 'Enrolments', apiName: 'Assessment_Score', type: 'Decimal (2dp, 0-100)' },
  { module: 'Enrolments', apiName: 'Certificate_Status', type: 'Picklist', values: CERTIFICATE_STATUSES },
  { module: 'Enrolments', apiName: 'Certificate_URL', type: 'URL' },
  { module: 'Enrolments', apiName: 'External_Learner_ID', type: 'Single Line' },
  { module: 'Enrolments', apiName: 'Last_Activity_Time', type: 'Date/Time' }
];

async function syncEnrolmentToCrm(deps, req, id) {
  const current = await getEnrolment(req, id);
  if (!current) throw new LmsError(404, 'NOT_FOUND', 'No LMS enrolment matches that id.');
  if (!current.crmEnrolmentId) {
    throw new LmsError(422, 'NO_CRM_ENROLMENT',
      'This LMS record is not linked to a CRM Enrolment. Link one, or create it first.');
  }

  const crmId = numeric(current.crmEnrolmentId);
  const fields = 'id, Name, Student, Programme, Intake, LMS_Provider, LMS_Enrolment_ID, Progress_Percentage, Last_LMS_Sync, External_Sync_Status, Modified_Time';

  try {
    const before = await deps.zoho.crmGetRecord(req, cfg.modules.enrolments, crmId, fields);
    if (!before) throw new LmsError(404, 'ENROLMENT_NOT_FOUND', 'The linked CRM Enrolment no longer exists.');

    // Relationship revalidated at push time, not just at link time — the CRM
    // record may have been reassigned since.
    const ownerId = before.Student && before.Student.id ? String(before.Student.id) : null;
    if (current.crmStudentId && ownerId && ownerId !== String(current.crmStudentId)) {
      throw new LmsError(422, 'STUDENT_MISMATCH',
        'The CRM Enrolment now belongs to a different student. Re-link before syncing.');
    }

    const payload = {};
    Object.entries(ENROLMENT_SYNC_FIELDS).forEach(([crmField, read]) => {
      const value = read(current);
      if (value !== null && value !== undefined && value !== '') payload[crmField] = value;
    });
    if (!Object.keys(payload).length) {
      throw new LmsError(422, 'NOTHING_TO_SYNC', 'This enrolment has no values to push to CRM.');
    }

    await deps.zoho.crmUpdate(req, cfg.modules.enrolments, crmId, payload);

    const after = await deps.zoho.crmGetRecord(req, cfg.modules.enrolments, crmId, fields);
    if (!after) throw new LmsError(502, 'READBACK_FAILED', 'The Enrolment could not be read back after the update.');

    await tableOf(req, TABLES.enrolments).updateRow({
      ROWID: current.id, Sync_Status: 'Synced', Last_Sync_Time: nowIso(),
      Last_Sync_Message: `Pushed ${Object.keys(payload).join(', ')} to ${after.Name}.`
    });
    await log(req, {
      entityType: 'Enrolment', provider: current.provider, externalRecordId: current.externalEnrolmentId,
      crmModule: cfg.modules.enrolments, crmRecordId: String(crmId), operation: 'Update',
      changedFields: Object.keys(payload), result: 'success', message: `Synced to ${after.Name}.`
    });
    return {
      enrolment: await getEnrolment(req, current.id),
      crmFieldsWritten: Object.keys(payload),
      fieldsHeldInCatalyst: RECOMMENDED_CRM_FIELDS.map((f) => f.apiName)
    };
  } catch (err) {
    const message = String(err && err.message ? err.message : 'Synchronisation failed.').slice(0, 200);
    await tableOf(req, TABLES.enrolments).updateRow({
      ROWID: current.id, Sync_Status: 'Error', Last_Sync_Time: nowIso(), Last_Sync_Message: message
    });
    await log(req, {
      entityType: 'Enrolment', provider: current.provider, externalRecordId: current.externalEnrolmentId,
      crmModule: cfg.modules.enrolments, crmRecordId: current.crmEnrolmentId,
      operation: 'Error', result: 'error', message
    });
    throw err;
  }
}

/**
 * Creates the missing CRM Enrolment for an LMS record.
 *
 * Idempotent by search, not by flag: before creating anything it looks for an
 * existing CRM Enrolment with the same student, programme and intake, and
 * adopts it if one is found. A repeated call therefore links rather than
 * duplicating, which is the guarantee that matters when this is retried.
 */
async function createCrmEnrolmentFor(deps, req, id, body) {
  const current = await getEnrolment(req, id);
  if (!current) throw new LmsError(404, 'NOT_FOUND', 'No LMS enrolment matches that id.');
  const b = body || {};

  if (current.crmEnrolmentId) {
    return { enrolment: current, created: false, reason: 'This LMS record is already linked to a CRM Enrolment.' };
  }
  if (!current.crmStudentId) {
    throw new LmsError(422, 'NO_STUDENT', 'Map this LMS record to a CRM Student first.');
  }

  // The programme comes from the mapped course, not from the caller.
  const linkedCourse = current.externalCourseId
    ? await findCourseByExternalId(req, current.provider, current.externalCourseId)
    : null;
  const programmeId = numeric((linkedCourse && linkedCourse.crmProgrammeId) || b.programmeId);
  if (!programmeId) {
    throw new LmsError(422, 'NO_PROGRAMME',
      'The LMS course for this record is not mapped to a CRM Programme, so the enrolment has no programme.');
  }

  const intakeId = numeric(b.intakeId);
  if (!intakeId) throw new LmsError(422, 'NO_INTAKE', 'Choose a CRM Intake for the new enrolment.');

  // The intake must belong to the programme, or the enrolment is structurally invalid.
  const intakeRows = await deps.zoho.crmQuery(req,
    `select id, Name, Programme from ${cfg.modules.intakes} where id = ${intakeId} limit 1`);
  if (!intakeRows || !intakeRows.length) throw new LmsError(422, 'INTAKE_NOT_FOUND', 'That intake does not exist.');
  const intakeProgramme = intakeRows[0].Programme && intakeRows[0].Programme.id
    ? String(intakeRows[0].Programme.id) : null;
  if (intakeProgramme && intakeProgramme !== String(programmeId)) {
    throw new LmsError(422, 'INTAKE_PROGRAMME_MISMATCH',
      'That intake belongs to a different programme than the mapped LMS course.');
  }

  // Idempotency: adopt an existing CRM Enrolment rather than creating a second.
  const clash = await deps.zoho.crmQuery(req,
    `select id, Name from ${cfg.modules.enrolments} where Student = ${numeric(current.crmStudentId)} and Programme = ${programmeId} and Intake = ${intakeId} limit 1`);
  if (clash && clash.length) {
    const linked = await mapEnrolmentToCrmEnrolment(deps, req, current.id, clash[0].id);
    await log(req, {
      entityType: 'Enrolment', provider: current.provider, externalRecordId: current.externalEnrolmentId,
      crmModule: cfg.modules.enrolments, crmRecordId: String(clash[0].id), operation: 'Skip',
      result: 'success', message: 'An existing CRM Enrolment matched; linked instead of creating a duplicate.'
    });
    return { enrolment: linked, created: false, reason: 'A matching CRM Enrolment already existed and was linked.' };
  }

  const payload = {
    Student: { id: numeric(current.crmStudentId) },
    Programme: { id: programmeId },
    Intake: { id: intakeId },
    Enrolment_Status: 'Active',
    Enrolment_Date: new Date().toISOString().slice(0, 10),
    External_Sync_Status: 'Not Synced',
    External_Enrolment_Ref: `LMS-${current.provider.slice(0, 6).toUpperCase()}-${current.externalEnrolmentId}`.slice(0, 100)
  };

  const details = await deps.zoho.crmCreate(req, cfg.modules.enrolments, payload);
  const created = await deps.zoho.crmGetRecord(req, cfg.modules.enrolments, details.id,
    'id, Name, Student, Programme, Intake, Enrolment_Status, Modified_Time');
  if (!created) throw new LmsError(502, 'READBACK_FAILED', 'The CRM Enrolment could not be read back after creation.');

  await tableOf(req, TABLES.enrolments).updateRow({
    ROWID: current.id,
    CRM_Enrolment_ID: String(created.id),
    CRM_Enrolment_Reference: String(created.Name || '').slice(0, 120),
    Mapping_Status: 'Mapped',
    Sync_Status: 'Pending',
    Last_Sync_Message: `CRM Enrolment ${created.Name} created from this LMS record.`
  });
  await log(req, {
    entityType: 'Enrolment', provider: current.provider, externalRecordId: current.externalEnrolmentId,
    crmModule: cfg.modules.enrolments, crmRecordId: String(created.id), operation: 'Create',
    changedFields: Object.keys(payload), result: 'success', message: `Created CRM Enrolment ${created.Name}.`
  });

  return {
    enrolment: await getEnrolment(req, current.id),
    created: true,
    crmEnrolment: { id: String(created.id), name: str(created.Name) }
  };
}

/* ------------------------------- concurrency ----------------------------- */

/**
 * Optimistic concurrency against the Catalyst row's MODIFIEDTIME. A row read
 * without one is a fault rather than a conflict, and says so — conflating the
 * two makes every edit fail while telling the user to reload.
 */
function assertUnchanged(record, expectedModifiedTime) {
  if (!expectedModifiedTime) return;
  if (!record || record.modifiedTime == null) {
    throw new LmsError(500, 'NO_MODIFIED_TIME',
      'The record was read without a modification timestamp, so this change cannot be applied safely.');
  }
  if (String(record.modifiedTime) !== String(expectedModifiedTime)) {
    throw new LmsError(409, 'CONFLICT', 'This record changed since you loaded it. Reload and try again.');
  }
}

/* ------------------------------- aggregates ------------------------------ */

/** Connector health and counts for the Integration Status page and dashboard. */
async function status(req) {
  try {
    const [courses, enrolments, recentLog] = await Promise.all([
      listCourses(req, { includeArchived: true }),
      listEnrolments(req),
      listSyncLog(req, { limit: 15 })
    ]);

    const byProvider = (rows) => rows.reduce((acc, r) => {
      const k = r.provider || 'Unknown';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    const withProgress = enrolments.filter((e) => e.progressPercentage !== null);
    const avgProgress = withProgress.length
      ? Math.round(withProgress.reduce((s, e) => s + e.progressPercentage, 0) / withProgress.length)
      : null;

    return {
      status: 'connected',
      label: 'Connected — Catalyst Data Store',
      demonstrationDataset: true,
      tables: TABLES,
      counts: {
        courses: courses.length,
        activeCourses: courses.filter((c) => !c.archived).length,
        enrolments: enrolments.length,
        coursesMapped: courses.filter((c) => c.mappingStatus === 'Mapped').length,
        coursesUnmapped: courses.filter((c) => c.mappingStatus !== 'Mapped').length,
        enrolmentsMapped: enrolments.filter((e) => e.mappingStatus === 'Mapped').length,
        enrolmentsUnmapped: enrolments.filter((e) => e.mappingStatus !== 'Mapped').length,
        syncedCourses: courses.filter((c) => c.syncStatus === 'Synced').length,
        syncedEnrolments: enrolments.filter((e) => e.syncStatus === 'Synced').length,
        failedSyncs: courses.filter((c) => c.syncStatus === 'Error').length
          + enrolments.filter((e) => e.syncStatus === 'Error').length,
        certificatesIssued: enrolments.filter((e) => e.certificateStatus === 'Issued').length,
        completed: enrolments.filter((e) => e.lmsStatus === 'Completed').length,
        // Learners in progress with no recorded activity for 30 days. Counted
        // here because this function already holds every enrolment, so the
        // dashboard and the attention queue read one figure rather than two
        // that could drift apart.
        inactiveLearners: enrolments.filter((e) => {
          if (e.lmsStatus !== 'In Progress') return false;
          const seen = e.lastActivityTime || e.startedDate;
          if (!seen) return false;
          const t = Date.parse(seen);
          return !Number.isNaN(t) && (Date.now() - t) >= 30 * 86400000;
        }).length
      },
      averageProgress: avgProgress,
      coursesByProvider: byProvider(courses),
      enrolmentsByProvider: byProvider(enrolments),
      learnersByStatus: enrolments.reduce((acc, e) => {
        const k = e.lmsStatus || 'Unknown';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {}),
      lastSync: [...courses, ...enrolments]
        .map((r) => r.lastSyncTime).filter(Boolean).sort().pop() || null,
      recentLog,
      recommendedCrmFields: RECOMMENDED_CRM_FIELDS
    };
  } catch (err) {
    // The connector reports its own unavailability rather than throwing, so a
    // Data Store problem degrades one card instead of a whole page.
    return {
      status: 'unavailable',
      label: 'Catalyst Data Store unavailable',
      demonstrationDataset: true,
      detail: String(err && err.message ? err.message : 'Unknown error').slice(0, 200),
      counts: null
    };
  }
}

module.exports = {
  LmsError, TABLES, PROVIDERS, DELIVERY_TYPES, PUBLICATION_STATUSES,
  LMS_STATUSES, CERTIFICATE_STATUSES, MAPPING_STATUSES, SYNC_STATUSES,
  RECOMMENDED_CRM_FIELDS, PROGRAMME_SYNC_FIELDS, ENROLMENT_SYNC_FIELDS,
  // courses
  listCourses, getCourse, findCourseByExternalId, createCourse, updateCourse,
  archiveCourse, mapCourse, syncCourseToCrm, bulkSyncCourses,
  // enrolments
  listEnrolments, getEnrolment, findEnrolmentByExternalId, enrolmentsForStudent,
  enrolmentsForCrmEnrolment, createEnrolment, updateEnrolment,
  mapEnrolmentStudent, mapEnrolmentToCrmEnrolment, syncEnrolmentToCrm, createCrmEnrolmentFor,
  // shared
  log, listSyncLog, status, course, enrolment,
  _internals: { assertUnchanged, courseKey, enrolmentKey, courseRow, enrolmentRow, q }
};
