'use strict';
/**
 * Sync health for the Integration Status page (kickoff-prompt.md §2 "Sync
 * health", §3 phase 10): per-entity sync_state — last sync time, last event
 * received time, records processed/failed, and the event vs. reconciliation
 * vs. write-through split — plus a 24h api_call_log rollup, so the
 * before/after Zoho-call-volume comparison has a live view, not just the
 * one-off BASELINE.md.
 */
const cfg = require('./config');
const projections = require('./projections');
const apiCallLog = require('./apiCallLog');

const ENTITIES = ['students', 'applications', 'programmes', 'intakes', 'enrolments'];

const numOrNull = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const numOrZero = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function shapeRow(entity, row) {
  const key = cfg.projections.syncEntities[entity];
  if (!row) {
    return {
      entity, syncEntityKey: key,
      checkpoint: null, lastSuccessfulSync: null, lastAttempt: null, lastEventReceivedAt: null,
      status: 'never-synced',
      recordsProcessed: null, recordsUpdated: null, recordsFailed: null,
      appliedBySource: { eventSync: 0, reconciliation: 0, writeThrough: 0 }
    };
  }
  return {
    entity, syncEntityKey: key,
    checkpoint: row.checkpoint || null,
    lastSuccessfulSync: row.last_successful_sync || null,
    lastAttempt: row.last_attempt || null,
    lastEventReceivedAt: row.last_event_received_at || null,
    status: row.sync_status || null,
    recordsProcessed: numOrNull(row.records_processed),
    recordsUpdated: numOrNull(row.records_updated),
    recordsFailed: numOrNull(row.records_failed),
    appliedBySource: {
      eventSync: numOrZero(row.events_applied_total),
      reconciliation: numOrZero(row.reconciliation_applied_total),
      writeThrough: numOrZero(row.write_through_applied_total)
    }
  };
}

/** Reads sync_state for all 5 entities. An entity with no row yet reports status "never-synced" rather than erroring. */
async function readAllSyncState(req, ds = projections.defaultDs) {
  const table = cfg.projections.syncStateTable;
  const rows = projections.flattenRows(
    await ds.zcql(req, `select * from ${table} where entity is not null limit 25`),
    table
  );
  return ENTITIES.map((entity) => {
    const key = cfg.projections.syncEntities[entity];
    return shapeRow(entity, rows.find((r) => r.entity === key));
  });
}

/** Sums appliedBySource across all entities — the headline "where did updates come from" number. */
function totalsBySource(perEntity) {
  return perEntity.reduce((acc, e) => ({
    eventSync: acc.eventSync + e.appliedBySource.eventSync,
    reconciliation: acc.reconciliation + e.appliedBySource.reconciliation,
    writeThrough: acc.writeThrough + e.appliedBySource.writeThrough
  }), { eventSync: 0, reconciliation: 0, writeThrough: 0 });
}

// ZCQL hard-refuses a LIMIT above 300 (confirmed live against this project:
// "ZCQL CANNOT HAVE MORE THAN 300 ROWS in LIMIT") — the original 2000 here
// was invalid on every call, which is why this rollup was silently coming
// back null on the live deployment (the query errored, caught by index.js's
// .catch(() => null)). Paginated in pages of 300, capped at MAX_PAGES since
// this is a reporting rollup, not a correctness-critical read — reporting
// "truncated" honestly beats an unbounded loop over a busy 24h window.
async function apiCallLogRollup(req, ds = projections.defaultDs) {
  const PAGE_SIZE = 300;
  const MAX_PAGES = 10; // up to 3000 rows/24h before this rollup admits truncation
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);

  const rows = [];
  let offset = 0;
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = projections.flattenRows(
      await ds.zcql(req, `select service, source, call_status from ${apiCallLog.TABLE} where logged_at > '${since}' order by logged_at asc limit ${offset}, ${PAGE_SIZE}`),
      apiCallLog.TABLE
    );
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    if (page === MAX_PAGES - 1) truncated = true;
  }

  const byServiceSource = new Map();
  rows.forEach((r) => {
    const key = `${r.service || 'unknown'}:${r.source || 'unknown'}`;
    if (!byServiceSource.has(key)) {
      byServiceSource.set(key, { service: r.service || 'unknown', source: r.source || 'unknown', count: 0, failed: 0 });
    }
    const entry = byServiceSource.get(key);
    entry.count += 1;
    if (r.call_status !== 'success') entry.failed += 1;
  });

  return {
    windowHours: 24,
    total: rows.length,
    truncated,
    breakdown: [...byServiceSource.values()].sort((a, b) => b.count - a.count)
  };
}

module.exports = { readAllSyncState, totalsBySource, apiCallLogRollup, ENTITIES };
