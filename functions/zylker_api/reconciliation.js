'use strict';
/**
 * Reconciliation (kickoff-prompt.md §2 "Reconciliation (Cron) — safety net,
 * not the primary path"). With Signals (phase 8) doing the real-time work,
 * this exists to catch what events miss: delivery failures, an outage
 * window, a bug. Incremental `Modified_Time > checkpoint` COQL queries, not
 * full re-syncs — verified against the live org before use (see
 * withOverlap()'s comment and the `>` comparison, both confirmed to work
 * exactly as written, not assumed).
 *
 * Shares almost everything with bootstrap.js (paginated COQL, idempotent
 * upsert via projections.js). The differences: an incremental WHERE clause,
 * an overlap window on the checkpoint, and never advancing
 * sync_state.checkpoint on a failed run.
 */
const cfg = require('./config');
const projections = require('./projections');

const FIELD_LISTS = {
  students: 'id, First_Name, Last_Name, Email, Phone, Student_ID, Student_Status, External_Student_Ref, LMS_Provider, LMS_User_ID, Last_LMS_Sync, Created_Time, Modified_Time',
  applications: 'id, Deal_Name, Application_ID, External_Application_Ref, Stage, Pipeline, Contact_Name, Programme, Intake, Application_Date, Closing_Date, Decision_Date, Amount, Documents_Status, Preferred_Study_Mode, Modified_Time',
  programmes: 'id, Product_Name, Product_Code, Programme_Status, Academic_Level, Department, Duration_Value, Duration_Unit, Delivery_Mode, Unit_Price, Award_or_Certificate, Product_Active, LMS_Provider, LMS_Course_ID, LMS_Course_URL, Modified_Time',
  intakes: 'id, Name, Intake_ID, External_Intake_Reference, Programme, Academic_Year, Intake_Status, Application_Open_Date, Application_Deadline, Start_Date, End_Date, Capacity, Delivery_Mode, Campus_or_Location, LMS_Cohort_or_Group_ID, Modified_Time',
  enrolments: 'id, Name, External_Enrolment_Ref, Student, Programme, Intake, Application, Enrolment_Status, Enrolment_Date, Start_Date, Completion_Date, Finance_Status, Certificate_Issued, LMS_Provider, LMS_Enrolment_ID, Progress_Percentage, Last_LMS_Sync, External_Sync_Status, Modified_Time'
};

const ENTITY_MODULE = {
  students: cfg.modules.students,
  applications: cfg.modules.applications,
  programmes: cfg.modules.programmes,
  intakes: cfg.modules.intakes,
  enrolments: cfg.modules.enrolments
};

const PAGE_SIZE = 200;

/**
 * Minutes subtracted from the stored checkpoint before querying, so a record
 * whose Modified_Time landed at or just before the last checkpoint is never
 * missed to clock skew or a race between two records written in the same
 * instant. Safe to over-cover: upsertProjectionRow is idempotent and keyed
 * by crm_id, so reprocessing a few already-synced records near the boundary
 * costs a little and misses nothing.
 */
const OVERLAP_MINUTES = 5;

function withOverlap(checkpointIso) {
  const t = Date.parse(checkpointIso);
  if (!Number.isFinite(t)) return null;
  return new Date(t - OVERLAP_MINUTES * 60000).toISOString();
}

async function readSyncState(req, entity, ds) {
  const table = cfg.projections.syncStateTable;
  const key = cfg.projections.syncEntities[entity];
  const rows = projections.flattenRows(
    await ds.zcql(req, `select ROWID, checkpoint from ${table} where entity = '${key}' limit 1`),
    table
  );
  return rows[0] || null;
}

async function writeSyncState(req, entity, patch, ds) {
  const table = cfg.projections.syncStateTable;
  const key = cfg.projections.syncEntities[entity];
  const existing = await readSyncState(req, entity, ds);
  const row = { entity: key, ...patch };
  if (existing) {
    await ds.updateRow(req, table, { ROWID: existing.ROWID, ...row });
  } else {
    await ds.insertRow(req, table, row);
  }
}

/**
 * Pages one CRM module incrementally. `sinceIso` null means this entity has
 * never had a checkpoint (e.g. reconciliation ran before bootstrap did, or
 * bootstrap never saw a record for it) — falls back to the same
 * unconditional pass bootstrap.js uses, so reconciliation converges on its
 * own even without a prior bootstrap.
 */
async function* pageModule(zoho, req, module_, fields, sinceIso) {
  const where = sinceIso ? `Modified_Time > '${sinceIso}'` : 'Created_Time is not null';
  let offset = 0;
  for (;;) {
    const rows = await zoho.crmQuery(req,
      `select ${fields} from ${module_} where ${where} order by Modified_Time asc, id asc limit ${offset}, ${PAGE_SIZE}`);
    if (!rows.length) return;
    yield rows;
    if (rows.length < PAGE_SIZE) return;
    offset += PAGE_SIZE;
  }
}

/**
 * Reconciles one entity. A per-record upsert failure is counted, not fatal.
 * A failure reading the CRM module itself IS fatal to this run — and
 * crucially, the checkpoint is left untouched on failure (kickoff-prompt.md
 * §2 "Sync metadata": "Never advance the checkpoint on a failed
 * reconciliation run"), so the next run re-covers the same ground instead of
 * silently widening the gap it exists to close.
 */
async function reconcileEntity(zoho, req, entity, module_, ds = projections.defaultDs) {
  const fields = FIELD_LISTS[entity];
  const state = await readSyncState(req, entity, ds);
  const sinceIso = state && state.checkpoint ? withOverlap(state.checkpoint) : null;

  let processed = 0;
  let updated = 0;
  let failed = 0;
  let skippedStale = 0;
  let maxModifiedTime = (state && state.checkpoint) || null;

  await writeSyncState(req, entity, {
    last_attempt: projections.sqlDatetime(new Date()),
    sync_status: 'running'
  }, ds);

  try {
    for await (const page of pageModule(zoho, req, module_, fields, sinceIso)) {
      for (const record of page) {
        processed += 1;
        try {
          const result = await projections.upsertProjectionRow(req, entity, record, ds);
          if (result === 'inserted' || result === 'updated') updated += 1;
          else if (result === 'skipped-stale') skippedStale += 1;
          if (record.Modified_Time && (!maxModifiedTime || record.Modified_Time > maxModifiedTime)) {
            maxModifiedTime = record.Modified_Time;
          }
        } catch {
          failed += 1;
        }
      }
    }
  } catch (err) {
    await writeSyncState(req, entity, {
      sync_status: 'failed',
      records_processed: processed,
      records_updated: updated,
      records_failed: failed
      // checkpoint deliberately omitted: stays at whatever it already was.
    }, ds);
    throw err;
  }

  await writeSyncState(req, entity, {
    sync_status: 'completed',
    last_successful_sync: projections.sqlDatetime(new Date()),
    records_processed: processed,
    records_updated: updated,
    records_failed: failed,
    ...(maxModifiedTime ? { checkpoint: maxModifiedTime } : {})
  }, ds);

  return { entity, processed, updated, failed, skippedStale, since: sinceIso };
}

/**
 * The kickoff prompt's 3 schedule tiers. Exposed as data so the Cron job
 * configuration (created once a deployment exists to point them at) and
 * this code stay in obvious agreement about which entities run together.
 */
const SCHEDULE_TIERS = {
  every15Min: ['applications', 'enrolments'],
  hourly: ['students'],
  daily: ['programmes', 'intakes']
};

async function reconcileMany(zoho, req, entities, ds = projections.defaultDs) {
  const results = [];
  for (const entity of entities) {
    const module_ = ENTITY_MODULE[entity];
    if (!module_) throw new Error(`Unknown reconciliation entity: ${entity}`);
    results.push(await reconcileEntity(zoho, req, entity, module_, ds));
  }
  return results;
}

module.exports = {
  reconcileEntity, reconcileMany, pageModule, withOverlap,
  SCHEDULE_TIERS, OVERLAP_MINUTES, FIELD_LISTS
};
