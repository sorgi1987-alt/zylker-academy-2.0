'use strict';
/**
 * Sync health for the Integration Status page (kickoff-prompt.md §2 "Sync
 * health"), exercised against a fake Datastore. Covers: an entity with no
 * sync_state row yet reporting "never-synced" rather than erroring, the
 * event/reconciliation/write-through totals, and the api_call_log rollup.
 *
 * Run with:  node --test functions/zylker_api/test/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const syncHealth = require('../syncHealth.js');

function makeDs(rows = {}) {
  return {
    async zcql(req, query) {
      const table = /from\s+(\w+)/.exec(query)[1];
      const source = rows[table] || [];
      return source.map((r) => ({ [table]: r }));
    }
  };
}

const req = {};

/* ------------------------------ readAllSyncState ---------------------------- */

test('readAllSyncState reports all 5 entities, even ones with no sync_state row yet', async () => {
  const ds = makeDs({ sync_state: [] });
  const result = await syncHealth.readAllSyncState(req, ds);
  assert.equal(result.length, 5);
  assert.deepEqual(result.map((r) => r.entity).sort(),
    ['applications', 'enrolments', 'intakes', 'programmes', 'students']);
  result.forEach((r) => assert.equal(r.status, 'never-synced'));
});

test('readAllSyncState shapes a real row correctly, including the applied-by-source split', async () => {
  const ds = makeDs({
    sync_state: [{
      entity: 'crm.contacts', checkpoint: '2026-08-12T10:00:00+02:00',
      last_successful_sync: '2026-08-12 10:05:00', last_attempt: '2026-08-12 10:05:00',
      last_event_received_at: '2026-08-12 10:03:00', sync_status: 'completed',
      records_processed: '10', records_updated: '8', records_failed: '2',
      events_applied_total: '5', reconciliation_applied_total: '3', write_through_applied_total: '7'
    }]
  });
  const result = await syncHealth.readAllSyncState(req, ds);
  const students = result.find((r) => r.entity === 'students');

  assert.equal(students.status, 'completed');
  assert.equal(students.recordsProcessed, 10);
  assert.equal(students.recordsUpdated, 8);
  assert.equal(students.recordsFailed, 2);
  assert.deepEqual(students.appliedBySource, { eventSync: 5, reconciliation: 3, writeThrough: 7 });
});

test('an entity with no counters recorded yet reports zeros, not nulls, for appliedBySource', async () => {
  const ds = makeDs({ sync_state: [{ entity: 'crm.contacts', sync_status: 'completed' }] });
  const result = await syncHealth.readAllSyncState(req, ds);
  const students = result.find((r) => r.entity === 'students');
  assert.deepEqual(students.appliedBySource, { eventSync: 0, reconciliation: 0, writeThrough: 0 });
});

/* -------------------------------- totalsBySource ----------------------------- */

test('totalsBySource sums appliedBySource across every entity', () => {
  const perEntity = [
    { appliedBySource: { eventSync: 1, reconciliation: 2, writeThrough: 3 } },
    { appliedBySource: { eventSync: 4, reconciliation: 0, writeThrough: 1 } }
  ];
  assert.deepEqual(syncHealth.totalsBySource(perEntity), { eventSync: 5, reconciliation: 2, writeThrough: 4 });
});

/* ------------------------------ apiCallLogRollup ----------------------------- */

test('apiCallLogRollup groups by service and source and counts failures', async () => {
  const ds = makeDs({
    api_call_log: [
      { service: 'crm', source: 'interactive-read-live', call_status: 'success' },
      { service: 'crm', source: 'interactive-read-live', call_status: 'success' },
      { service: 'crm', source: 'interactive-read-live', call_status: '502' },
      { service: 'books', source: 'interactive-read-live', call_status: 'success' }
    ]
  });
  const result = await syncHealth.apiCallLogRollup(req, ds);

  assert.equal(result.total, 4);
  assert.equal(result.windowHours, 24);
  const crmLive = result.breakdown.find((b) => b.service === 'crm' && b.source === 'interactive-read-live');
  assert.equal(crmLive.count, 3);
  assert.equal(crmLive.failed, 1);
  const booksLive = result.breakdown.find((b) => b.service === 'books');
  assert.equal(booksLive.count, 1);
  assert.equal(booksLive.failed, 0);
});

test('apiCallLogRollup reports zero, not an error, when the log is empty', async () => {
  const ds = makeDs({ api_call_log: [] });
  const result = await syncHealth.apiCallLogRollup(req, ds);
  assert.equal(result.total, 0);
  assert.deepEqual(result.breakdown, []);
});

/**
 * Found live: this rollup originally requested `limit 2000`, which ZCQL
 * hard-refuses (max 300), so the query errored on every call and the whole
 * rollup silently came back null on the live Integration Status page. Fixed
 * by paginating in pages of 300; this proves it actually walks multiple
 * pages for a busy 24h window rather than reintroducing the same ceiling.
 */
test('apiCallLogRollup pages past 300 rows rather than hitting ZCQL\'s LIMIT ceiling (the bug found on first live deployment)', async () => {
  const allRows = Array.from({ length: 350 }, () => ({ service: 'crm', source: 'interactive-read-live', call_status: 'success' }));
  const calls = [];
  const ds = {
    async zcql(req, query) {
      calls.push(query);
      const m = /limit\s+(\d+),\s*(\d+)/.exec(query);
      const offset = m ? Number(m[1]) : 0;
      const count = m ? Number(m[2]) : allRows.length;
      return allRows.slice(offset, offset + count).map((r) => ({ api_call_log: r }));
    }
  };

  const result = await syncHealth.apiCallLogRollup(req, ds);

  assert.equal(result.total, 350);
  assert.equal(result.truncated, false);
  assert.equal(calls.length, 2, '350 rows at 300/page is 2 calls (300 + 50)');
  const requestedCounts = calls.map((q) => Number(/limit\s+\d+,\s*(\d+)/.exec(q)[1]));
  assert.ok(requestedCounts.every((count) => count <= 300), 'no call ever requests more than the 300-row ZCQL ceiling');
});
