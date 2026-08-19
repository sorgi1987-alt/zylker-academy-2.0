'use strict';
/**
 * Catalyst Cache wrapper (kickoff-prompt.md §2 "Cache"). Verified against
 * docs.catalyst.zoho.com (2026-08-12):
 *   - `app.cache().segment()` with no argument returns a usable default
 *     segment — no pre-creation via console/management API needed, unlike
 *     Datastore tables.
 *   - `segment.put(key, value, expiryHours)` — expiry is in whole HOURS,
 *     defaulting to 48h if omitted. `segment.getValue(key)` reads a value;
 *     `segment.delete(key)` removes it — both confirmed with real code
 *     examples.
 *
 * NOT confirmed, and designed around rather than guessed at:
 *   - Whether fractional hours work for `put()`'s expiry — the only
 *     documented example uses an integer. The kickoff prompt asks for
 *     minute-granularity TTLs (~3-5 min for the dashboard aggregate, ~15-30
 *     min for reference data), which whole-hour native expiry cannot
 *     express directly even if it turns out to round rather than reject.
 *   - Whether `getValue()` throws or returns a falsy value for a missing or
 *     expired key.
 *
 * Because of both gaps, this wrapper does not lean on Catalyst's own expiry
 * granularity or on a particular missing-key behaviour: every cached value
 * carries its own `cachedAt` timestamp and the caller's real TTL, and every
 * read re-checks that embedded timestamp before trusting the value — a hit
 * only if the value is present AND still fresh under the ACTUAL
 * (minute-granularity) TTL, regardless of what Catalyst's hour-granularity
 * expiry is doing underneath. Catalyst's native expiry is still set
 * (rounded up to whole hours, minimum 1) purely as an outer backstop so a
 * stale entry cannot linger in the segment forever — not as the mechanism
 * this module actually relies on for correctness.
 *
 * Every operation is best-effort: a Cache outage must degrade to "always
 * read live" (a cache miss), never break the caller. This mirrors
 * apiCallLog.js and auth.audit()'s own posture toward infrastructure that
 * sits beside the correctness-critical path, not on it.
 */
const catalyst = require('zcatalyst-sdk-node');

const defaultSegment = (req) => catalyst.initialize(req).cache().segment();

/** Reads a key. Returns the cached value if present and fresh, else null. */
async function get(req, key, segment = null) {
  try {
    const seg = segment || defaultSegment(req);
    const raw = await seg.getValue(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.cachedAt !== 'number' || typeof parsed.ttlMs !== 'number') return null;
    if (Date.now() - parsed.cachedAt > parsed.ttlMs) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

/** Writes a key with `ttlMs` as the real, enforced TTL (see file header). */
async function set(req, key, value, ttlMs, segment = null) {
  try {
    const seg = segment || defaultSegment(req);
    const payload = JSON.stringify({ value, cachedAt: Date.now(), ttlMs });
    const expiryHours = Math.max(1, Math.ceil(ttlMs / 3600000));
    await seg.put(key, payload, expiryHours);
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`cache set failed for "${key}":`, err && err.message);
    return false;
  }
}

/** Invalidates a key immediately, regardless of its TTL. */
async function invalidate(req, key, segment = null) {
  try {
    const seg = segment || defaultSegment(req);
    await seg.delete(key);
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`cache invalidate failed for "${key}":`, err && err.message);
    return false;
  }
}

/**
 * Reads through the cache: a hit returns the cached value; a miss calls
 * `loadFn`, caches the result, and returns it. `loadFn` failing propagates
 * as-is and never populates the cache with a failure.
 */
async function readThrough(req, key, ttlMs, loadFn, segment = null) {
  const cached = await get(req, key, segment);
  if (cached !== null) return cached;
  const fresh = await loadFn();
  await set(req, key, fresh, ttlMs, segment);
  return fresh;
}

const TTL = {
  DASHBOARD_AGGREGATE_MS: 4 * 60 * 1000, // ~3-5 minutes, kickoff-prompt.md §2 "Cache"
  REFERENCE_DATA_MS: 20 * 60 * 1000, // ~15-30 minutes
  /*
   * Books/Desk totals and health are deliberately NOT a read-model/projection
   * (kickoff-prompt.md §1 explicitly excludes both from that migration) — this
   * is the same lightweight response cache used above, just applied to two
   * live external calls that turned out to dominate dashboard/attention load
   * time (measured ~3-4s each). A short TTL keeps the numbers close to live
   * while turning "every page load pays full Zoho Books/Desk latency" into
   * "one load per window does, the rest are instant" — and since
   * /api/dashboard, /api/attention and /api/integration-status all read the
   * same two keys, one live call now serves all three instead of each paying
   * its own.
   */
  EXTERNAL_TOTALS_MS: 2 * 60 * 1000 // ~2 minutes
};

/** Cache keys this PoC uses. Centralised so write-through invalidation and reads never drift apart on the key string. */
const KEYS = {
  DASHBOARD_AGGREGATE: 'dashboard:aggregate',
  CATALOGUE_PROGRAMMES: 'catalogue:programmes',
  CATALOGUE_INTAKES: 'catalogue:intakes',
  BOOKS_TOTALS: 'books:totals',
  BOOKS_HEALTH: 'books:health',
  DESK_TOTALS: 'desk:totals',
  DESK_HEALTH: 'desk:health',
  programme: (id) => `programme:${id}`,
  intake: (id) => `intake:${id}`
};

/**
 * Invalidates every cache key a change to `entity` can make stale
 * (kickoff-prompt.md §2 "Write-through": "a stage transition invalidates
 * dashboard:aggregate"; §2a: "On a successful projection update from an
 * event, invalidate the same Cache keys the write-through path would
 * invalidate for that entity"). Shared by write-through (writes.js) and the
 * Signals handler (signals.js) so the two paths can never drift on which
 * keys a given entity affects.
 */
async function invalidateForEntity(req, entity, segment = null) {
  const keys = [KEYS.DASHBOARD_AGGREGATE];
  if (entity === 'programmes') keys.push(KEYS.CATALOGUE_PROGRAMMES);
  if (entity === 'intakes') keys.push(KEYS.CATALOGUE_INTAKES);
  await Promise.all(keys.map((key) => invalidate(req, key, segment)));
}

module.exports = { get, set, invalidate, readThrough, invalidateForEntity, TTL, KEYS };
