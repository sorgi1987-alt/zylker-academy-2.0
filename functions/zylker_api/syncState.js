'use strict';
/**
 * The per-source "applied" counters that back the Integration Status page's
 * event vs. reconciliation vs. write-through split (kickoff-prompt.md §2
 * "Sync health": "how many projection updates came from events vs.
 * reconciliation vs. write-through — this split is itself an interesting
 * PoC result").
 *
 * Bootstrap isn't one of the 3 tracked sources (the kickoff prompt names
 * only events/reconciliation/write-through), so bootstrap.js doesn't touch
 * this. reconciliation.js increments its own counter inline, since it
 * already reads and writes sync_state every run and has the count of
 * actual updates on hand — this module exists for write-through (writes.js)
 * and Signals (signals.js), which don't otherwise touch sync_state per
 * write/event and would each need to duplicate the same read-then-write
 * pattern without it.
 *
 * Incrementing is a read-then-write, not atomic — Catalyst Datastore has no
 * native increment. Acceptable for a PoC's write volume: a lost increment
 * under true concurrent writes to the same entity's sync_state row would
 * undercount this one metric, never corrupt anything else.
 */
const cfg = require('./config');
const projections = require('./projections');

const COUNTER_FIELD = {
  'event-sync': 'events_applied_total',
  reconciliation: 'reconciliation_applied_total',
  'write-through': 'write_through_applied_total'
};

/**
 * Best-effort increment of one of the 3 source counters by `by` (default
 * 1). Never throws — this is a reporting metric, not correctness-critical,
 * and must not be allowed to fail a write-through/event run that otherwise
 * succeeded.
 */
async function incrementApplied(req, entity, source, by = 1, ds = projections.defaultDs) {
  const field = COUNTER_FIELD[source];
  if (!field || by <= 0) return;
  try {
    const table = cfg.projections.syncStateTable;
    const key = cfg.projections.syncEntities[entity];
    const existing = projections.flattenRows(
      await ds.zcql(req, `select * from ${table} where entity = '${key}' limit 1`),
      table
    )[0];
    const current = Number((existing && existing[field]) || 0);
    const row = { entity: key, [field]: current + by };
    if (existing) {
      await ds.updateRow(req, table, { ROWID: existing.ROWID, ...row });
    } else {
      await ds.insertRow(req, table, row);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`sync_state counter increment failed for ${entity}/${source}:`, err && err.message);
  }
}

module.exports = { incrementApplied, COUNTER_FIELD };
