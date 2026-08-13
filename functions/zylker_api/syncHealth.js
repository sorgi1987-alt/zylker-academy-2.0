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

/**
 * Rolls up api_call_log by service + source over the last 24h. Fetched as
 * raw bounded rows and aggregated in JS rather than relying on ZCQL's
 * GROUP BY/aggregate support, which isn't confirmed for this Catalyst
 * version — a PoC's daily row volume is small enough that this is cheap and
 * avoids depending on unverified query surface.
 */
async function apiCallLogRollup(req, ds = projections.defaultDs) {
  const ROW_LIMIT = 2000;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const rows = projections.flattenRows(
    await ds.zcql(req, `select service, source, call_status from ${apiCallLog.TABLE} where logged_at > '${since}' limit ${ROW_LIMIT}`),
    apiCallLog.TABLE
  );

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
    truncated: rows.length >= ROW_LIMIT,
    breakdown: [...byServiceSource.values()].sort((a, b) => b.count - a.count)
  };
}

module.exports = { readAllSyncState, totalsBySource, apiCallLogRollup, ENTITIES };
