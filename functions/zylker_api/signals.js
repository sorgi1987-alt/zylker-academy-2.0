'use strict';
/**
 * Catalyst Signals event handler (kickoff-prompt.md §2a) — the primary sync
 * path for CRM-originated changes. Reconciliation (reconciliation.js) is the
 * safety net behind this, not the other way round.
 *
 * ARCHITECTURE CHOICE, and why: Signals targets a Webhook (a plain HTTP POST
 * to a URL with custom headers) rather than a native Catalyst "Event"-type
 * Function. Verified against docs.catalyst.zoho.com (2026-08-12) that both
 * are supported target types. A native Event function would need its own
 * Catalyst Function directory, and — also verified against the docs, which
 * do not address this either way — it's unconfirmed whether a second
 * function directory can safely share code (config.js, projections.js) with
 * this one at deploy time; each function directory appears to be packaged
 * independently. The Webhook route avoids that risk entirely by living in
 * the already-deployed zylker_api function, reusing projections.js exactly
 * like write-through and reconciliation do.
 *
 * PAYLOAD SHAPE — verified from docs.catalyst.zoho.com's own "Sample Event
 * Payload" page, which shows a complete real example for a CRM "Leads
 * Created" event:
 *   { rule_id, target_id, version, attempt, account: {...},
 *     events: [ { data: {...full record fields...}, id, time_in_ms,
 *                 source, event_config: { api_name, id } } ] }
 * `data` is the full record, in the same shape zoho.js's crmGetRecord/
 * crmQuery already return (lookups as {id, name}, Modified_Time present) —
 * NOT a diff of changed fields. This lets create/update events reuse
 * projections.upsertProjectionRow directly, no extra Zoho call needed.
 *
 * WHAT IS NOT VERIFIED, and how this handler stays safe regardless:
 *   - No sample payload for an update or delete event was found (only
 *     "created"). Assumed to follow the same {data, event_config} shape.
 *   - `event_config.api_name` for a CREATE/UPDATE/DELETE event on OUR
 *     modules is inferred to be "<ModuleAPIName> <Action>" (e.g. "Contacts
 *     Created") by direct analogy with the one confirmed sample ("Leads
 *     Created", where Leads is both the display label and the API name).
 *     This is an inference, not a confirmed fact, especially for a renamed
 *     module — though this org's 5 projected modules keep their original
 *     API names (config.js), so the display-label-vs-API-name ambiguity
 *     that would break this inference does not apply here.
 *   - MUST be verified against one real fired event once Signals is
 *     configured and connected — see parseEventConfig()'s handling of an
 *     unrecognised api_name: it is logged and the event is skipped, never
 *     guessed at, so a wrong inference fails safe instead of corrupting a
 *     projection.
 *
 * Idempotency: delegated entirely to projections.upsertProjectionRow, the
 * same choke point bootstrap/write-through/reconciliation use. Events may
 * arrive more than once (Signals retries a non-2xx response), late, or out
 * of order — all three are already handled there by comparing
 * source_modified_time before writing.
 */
const cfg = require('./config');
const projections = require('./projections');
const cacheModule = require('./cache');
const syncState = require('./syncState');

/** "<ModuleAPIName> <Action>" -> { entity, action }, or null if unrecognised. */
function parseEventConfig(apiName) {
  const m = /^(\S+)\s+(Created|Updated|Deleted)$/i.exec(String(apiName || '').trim());
  if (!m) return null;
  const entity = cfg.projections.moduleToEntity[m[1]];
  if (!entity) return null;
  return { entity, action: m[2].toLowerCase() };
}

async function touchLastEventReceived(req, entity, ds) {
  const table = cfg.projections.syncStateTable;
  const key = cfg.projections.syncEntities[entity];
  const existing = projections.flattenRows(
    await ds.zcql(req, `select ROWID from ${table} where entity = '${key}' limit 1`),
    table
  )[0];
  const patch = { entity: key, last_event_received_at: projections.sqlDatetime(new Date()) };
  if (existing) {
    await ds.updateRow(req, table, { ROWID: existing.ROWID, ...patch });
  } else {
    await ds.insertRow(req, table, patch);
  }
}

/**
 * Processes one event from the envelope's `events` array. Never throws for
 * a single bad/unrecognised event — one malformed event in a batch must not
 * take the rest down. Returns a per-event outcome for the caller to tally
 * and, for phase 10, surface on the Integration Status page.
 *
 * On a successful projection change, invalidates the same cache keys
 * write-through would (kickoff-prompt.md §2a) via cache.invalidateForEntity,
 * and increments sync_state's events_applied_total (§2 "Sync health") —
 * neither on a stale/unrecognised/missing-id outcome, since nothing
 * actually changed in those cases. `cacheApi`/`syncStateApi` let tests
 * inject fakes the same way `ds` already lets them inject a fake Datastore.
 */
async function processEvent(req, event, ds, cacheApi = cacheModule, syncStateApi = syncState) {
  const parsed = event && event.event_config ? parseEventConfig(event.event_config.api_name) : null;
  if (!parsed) {
    return { outcome: 'unrecognised', apiName: event && event.event_config && event.event_config.api_name };
  }
  const { entity, action } = parsed;
  const record = event.data;
  const crmId = record && record.id != null ? String(record.id) : null;
  if (!crmId) {
    return { outcome: 'missing-id', entity, action };
  }

  await touchLastEventReceived(req, entity, ds);

  if (action === 'deleted') {
    const removed = await projections.deleteProjectionRow(req, entity, crmId, ds);
    if (removed) {
      await cacheApi.invalidateForEntity(req, entity);
      await syncStateApi.incrementApplied(req, entity, 'event-sync', 1, ds);
    }
    return { outcome: removed ? 'deleted' : 'delete-noop', entity, action, crmId };
  }

  const result = await projections.upsertProjectionRow(req, entity, record, ds);
  if (result === 'inserted' || result === 'updated') {
    await cacheApi.invalidateForEntity(req, entity);
    await syncStateApi.incrementApplied(req, entity, 'event-sync', 1, ds);
  }
  return { outcome: result, entity, action, crmId };
}

/**
 * Processes a full Signals envelope. Best-effort per event (a bad event is
 * reported, not thrown) but the envelope shape itself is asserted — a
 * request that isn't even a Signals envelope is a configuration problem
 * worth failing loudly on, not silently no-op-ing.
 */
async function processEnvelope(req, envelope, ds = projections.defaultDs, cacheApi = cacheModule, syncStateApi = syncState) {
  const events = envelope && Array.isArray(envelope.events) ? envelope.events : null;
  if (!events) {
    const e = new Error('Payload is not a recognisable Signals envelope (no `events` array).');
    e.status = 400;
    throw e;
  }

  const results = [];
  for (const event of events) {
    try {
      results.push(await processEvent(req, event, ds, cacheApi, syncStateApi));
    } catch (err) {
      results.push({ outcome: 'error', error: err && err.message });
    }
  }
  return results;
}

module.exports = { parseEventConfig, processEvent, processEnvelope };
