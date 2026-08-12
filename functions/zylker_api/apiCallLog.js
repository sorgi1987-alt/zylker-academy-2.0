'use strict';
/**
 * Instrumentation for the read-model/cache/event-sync PoC (see
 * kickoff-prompt.md). Every real outbound Zoho HTTP call — CRM, Books or
 * Desk, on the current live read path as much as on any future
 * Datastore/Cache path — writes one row to the `api_call_log` Datastore
 * table, so before/after API-volume numbers are measured, not estimated.
 *
 * A Signals event arriving is not itself a Zoho API call this app made and
 * is never logged here; only actual outbound Zoho HTTP calls are.
 */
const catalyst = require('zcatalyst-sdk-node');

const TABLE = process.env.API_CALL_LOG_TABLE || 'api_call_log';

/** `source` values this PoC distinguishes between. */
const SOURCE = {
  INTERACTIVE_READ_LIVE: 'interactive-read-live',
  INTERACTIVE_WRITE: 'interactive-write',
  RECONCILIATION: 'reconciliation',
  BOOTSTRAP: 'bootstrap',
  EVENT_SYNC: 'event-sync'
};

const sqlDatetime = (d) => d.toISOString().replace('T', ' ').slice(0, 19);

/**
 * Writes one row. Best-effort and silent on failure: the instrument must
 * never be the reason a request the user is waiting on fails.
 */
async function logApiCall(req, { service, operation, moduleOrEndpoint, source, status, latencyMs }) {
  try {
    await catalyst.initialize(req).datastore().table(TABLE).insertRow({
      logged_at: sqlDatetime(new Date()),
      service: String(service || 'unknown').slice(0, 20),
      operation: String(operation || 'unknown').slice(0, 40),
      module_or_endpoint: String(moduleOrEndpoint || '').slice(0, 150),
      source: source || (req && req.__apiCallSource) || SOURCE.INTERACTIVE_READ_LIVE,
      call_status: String(status).slice(0, 20),
      latency_ms: Math.max(0, Math.round(latencyMs) || 0)
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('api_call_log insert failed:', err && err.message);
  }
}

/**
 * Runs `fn` (one outbound Zoho HTTP call) and logs exactly one row for the
 * attempt, success or failure, with the real round-trip latency. Rethrows
 * on failure so callers keep their existing error handling.
 */
async function timed(req, meta, fn) {
  const start = Date.now();
  try {
    const result = await fn();
    await logApiCall(req, { ...meta, status: 'success', latencyMs: Date.now() - start });
    return result;
  } catch (err) {
    const status = (err && err.response && err.response.status) || 'error';
    await logApiCall(req, { ...meta, status: String(status), latencyMs: Date.now() - start });
    throw err;
  }
}

module.exports = { logApiCall, timed, SOURCE, TABLE };
