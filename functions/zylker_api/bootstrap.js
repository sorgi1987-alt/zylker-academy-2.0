'use strict';
/**
 * One-time initial population of the 5 CRM projection tables
 * (kickoff-prompt.md §2, "Bootstrap").
 *
 * COQL paginated reads, not the Bulk Read API — checked actual record counts
 * against the live "Zylker Academy" CRM org before choosing, rather than
 * assuming (2026-08-12): Contacts 237, Deals 244, Products 6, Intakes 12,
 * Enrolments 38. All comfortably inside COQL's 200-rows-per-page ceiling (at
 * most 2 pages for the largest module), so the Bulk Read API's async-job
 * overhead — create job, poll, download, parse — buys nothing at this scale.
 *
 * Pagination uses COQL's `limit <offset>,<count>` form and orders by
 * `Modified_Time asc, id asc` — verified directly against the live org.
 * Modified_Time alone is not a safe sort key here: this org's seed data has
 * many records sharing the exact same Modified_Time (a bulk load), and COQL
 * gives no ordering guarantee across separate paginated calls when the sort
 * key ties. Without the `id` tiebreaker a record could be reshuffled out of
 * every page across two calls and silently never synced. A duplicate fetch
 * (record appears in two pages) is harmless — upsertProjectionRow is
 * idempotent — but a skipped one would not be.
 *
 * Resumable: every write goes through projections.upsertProjectionRow, which
 * is keyed by crm_id and never overwrites a newer stored row with older
 * data. Re-running this after a partial failure, or after other sync paths
 * have already written some rows, converges safely — nothing here truncates
 * a table or deletes a row.
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

const PAGE_SIZE = 200; // COQL's own per-request ceiling

/** Pages through one CRM module via COQL. Yields one page (array) at a time. */
async function* pageModule(zoho, req, module_, fields) {
  let offset = 0;
  for (;;) {
    const rows = await zoho.crmQuery(req,
      `select ${fields} from ${module_} where Created_Time is not null `
      + `order by Modified_Time asc, id asc limit ${offset}, ${PAGE_SIZE}`);
    if (!rows.length) return;
    yield rows;
    if (rows.length < PAGE_SIZE) return;
    offset += PAGE_SIZE;
  }
}

async function readSyncState(req, entity, ds) {
  const table = cfg.projections.syncStateTable;
  const key = cfg.projections.syncEntities[entity];
  const rows = projections.flattenRows(
    await ds.zcql(req, `select ROWID from ${table} where entity = '${key}' limit 1`),
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
 * Bootstraps one entity: pages the CRM module, upserts every record via
 * projections.upsertProjectionRow, and records the outcome in sync_state.
 *
 * A per-record upsert failure is counted, not fatal — one malformed record
 * must not stop the other 236 from syncing. A failure reading the CRM module
 * itself IS fatal to this entity's run, since nothing was learned about it.
 */
async function bootstrapEntity(zoho, req, entity, module_, ds = projections.defaultDs) {
  const fields = FIELD_LISTS[entity];
  let processed = 0;
  let updated = 0;
  let failed = 0;
  let maxModifiedTime = null;

  await writeSyncState(req, entity, {
    last_attempt: projections.sqlDatetime(new Date()),
    sync_status: 'running'
  }, ds);

  try {
    for await (const page of pageModule(zoho, req, module_, fields)) {
      for (const record of page) {
        processed += 1;
        try {
          const result = await projections.upsertProjectionRow(req, entity, record, ds);
          if (result === 'inserted' || result === 'updated') updated += 1;
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
    }, ds);
    throw err;
  }

  await writeSyncState(req, entity, {
    sync_status: 'completed',
    last_successful_sync: projections.sqlDatetime(new Date()),
    records_processed: processed,
    records_updated: updated,
    records_failed: failed,
    // Hands off a starting point to reconciliation (Phase 7) so it does not
    // re-walk everything bootstrap already covered. Left unset (rather than
    // written as null) when the module had no Modified_Time on any record —
    // an empty module, in practice — so a later run doesn't treat "no data
    // seen yet" the same as "checkpoint at the epoch".
    ...(maxModifiedTime ? { checkpoint: maxModifiedTime } : {})
  }, ds);

  return { entity, processed, updated, failed };
}

/** Bootstraps all 5 entities in kickoff-prompt.md's listed order. */
async function bootstrapAll(zoho, req, ds = projections.defaultDs) {
  const plan = [
    ['students', cfg.modules.students],
    ['applications', cfg.modules.applications],
    ['programmes', cfg.modules.programmes],
    ['intakes', cfg.modules.intakes],
    ['enrolments', cfg.modules.enrolments]
  ];
  const results = [];
  for (const [entity, module_] of plan) {
    results.push(await bootstrapEntity(zoho, req, entity, module_, ds));
  }
  return results;
}

/**
 * Route handler entry point — matches writes.js's `{ data, meta?, audit }`
 * contract so it can sit in WRITE_ROUTES like any domain write. `deps.zoho`
 * is injected the same way writes.js takes it, so this is unit-testable
 * against a stubbed CRM without a live Catalyst session.
 */
async function runBootstrap(deps, req) {
  const results = await bootstrapAll(deps.zoho, req, deps.ds);
  const totals = results.reduce((acc, r) => ({
    processed: acc.processed + r.processed,
    updated: acc.updated + r.updated,
    failed: acc.failed + r.failed
  }), { processed: 0, updated: 0, failed: 0 });

  return {
    data: results,
    meta: { totals },
    audit: {
      action: 'bootstrap-sync', entityType: null,
      changedFields: [],
      result: totals.failed > 0 ? 'partial-failure' : 'success'
    }
  };
}

module.exports = { bootstrapAll, bootstrapEntity, runBootstrap, pageModule, FIELD_LISTS, PAGE_SIZE };
