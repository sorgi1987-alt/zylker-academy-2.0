'use strict';
/**
 * Cache (kickoff-prompt.md §2 "Cache"), exercised against a fake segment —
 * no live Catalyst session. Covers: the minute-granularity TTL enforced on
 * top of Catalyst's own hour-granularity expiry (see cache.js's header for
 * why that's necessary), read-through, invalidation, and
 * invalidateForEntity's key selection per entity.
 *
 * Run with:  node --test functions/zylker_api/test/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const cache = require('../cache.js');

/* ------------------------------ fake segment ------------------------------ */

function makeSegment() {
  const store = new Map();
  return {
    store,
    async getValue(key) { return store.has(key) ? store.get(key) : null; },
    async put(key, value) { store.set(key, value); },
    async delete(key) { store.delete(key); }
  };
}

const req = {};

/* ---------------------------------- tests --------------------------------- */

test('set then get round-trips the value within the TTL', async () => {
  const seg = makeSegment();
  await cache.set(req, 'k', { hello: 'world' }, 60000, seg);
  const value = await cache.get(req, 'k', seg);
  assert.deepEqual(value, { hello: 'world' });
});

test('get returns null for a key that was never set', async () => {
  const seg = makeSegment();
  assert.equal(await cache.get(req, 'nope', seg), null);
});

test('get returns null once the caller\'s own TTL has elapsed, even though Catalyst\'s native expiry (hours) has not', async () => {
  const seg = makeSegment();
  // A very short TTL, then a value manually stored with a cachedAt far
  // enough in the past to have expired under it.
  const stale = JSON.stringify({ value: 'old', cachedAt: Date.now() - 10 * 60 * 1000, ttlMs: 60000 });
  await seg.put('k', stale, 1);
  assert.equal(await cache.get(req, 'k', seg), null);
});

test('set never throws when the underlying segment fails; it reports failure instead', async () => {
  const brokenSegment = { async put() { throw new Error('cache unavailable'); } };
  const ok = await cache.set(req, 'k', 'v', 60000, brokenSegment);
  assert.equal(ok, false);
});

test('get never throws when the underlying segment fails; it degrades to a miss', async () => {
  const brokenSegment = { async getValue() { throw new Error('cache unavailable'); } };
  assert.equal(await cache.get(req, 'k', brokenSegment), null);
});

test('readThrough calls loadFn on a miss and caches the result', async () => {
  const seg = makeSegment();
  let calls = 0;
  const loadFn = async () => { calls += 1; return { n: 42 }; };

  const first = await cache.readThrough(req, 'k', 60000, loadFn, seg);
  assert.deepEqual(first, { n: 42 });
  assert.equal(calls, 1);

  const second = await cache.readThrough(req, 'k', 60000, loadFn, seg);
  assert.deepEqual(second, { n: 42 });
  assert.equal(calls, 1, 'a hit must not call loadFn again');
});

test('readThrough calls loadFn again once a cached entry\'s TTL elapses', async () => {
  const seg = makeSegment();
  let calls = 0;
  const loadFn = async () => { calls += 1; return calls; };

  await cache.readThrough(req, 'k', 1, loadFn, seg); // 1ms TTL
  await new Promise((r) => setTimeout(r, 5));
  const second = await cache.readThrough(req, 'k', 1, loadFn, seg);

  assert.equal(second, 2);
  assert.equal(calls, 2);
});

test('invalidate removes a key so the next get is a miss', async () => {
  const seg = makeSegment();
  await cache.set(req, 'k', 'v', 60000, seg);
  assert.equal(await cache.get(req, 'k', seg), 'v');

  await cache.invalidate(req, 'k', seg);
  assert.equal(await cache.get(req, 'k', seg), null);
});

/* ---------------------------- invalidateForEntity -------------------------- */

test('invalidateForEntity always invalidates the dashboard aggregate', async () => {
  const seg = makeSegment();
  await cache.set(req, cache.KEYS.DASHBOARD_AGGREGATE, 'x', 60000, seg);
  await cache.invalidateForEntity(req, 'students', seg);
  assert.equal(await cache.get(req, cache.KEYS.DASHBOARD_AGGREGATE, seg), null);
});

test('invalidateForEntity("programmes") also invalidates the programmes catalogue, not intakes', async () => {
  const seg = makeSegment();
  await cache.set(req, cache.KEYS.CATALOGUE_PROGRAMMES, 'p', 60000, seg);
  await cache.set(req, cache.KEYS.CATALOGUE_INTAKES, 'i', 60000, seg);

  await cache.invalidateForEntity(req, 'programmes', seg);

  assert.equal(await cache.get(req, cache.KEYS.CATALOGUE_PROGRAMMES, seg), null);
  assert.equal(await cache.get(req, cache.KEYS.CATALOGUE_INTAKES, seg), 'i', 'intakes catalogue is untouched by a programme change');
});

test('invalidateForEntity("intakes") also invalidates the intakes catalogue, not programmes', async () => {
  const seg = makeSegment();
  await cache.set(req, cache.KEYS.CATALOGUE_PROGRAMMES, 'p', 60000, seg);
  await cache.set(req, cache.KEYS.CATALOGUE_INTAKES, 'i', 60000, seg);

  await cache.invalidateForEntity(req, 'intakes', seg);

  assert.equal(await cache.get(req, cache.KEYS.CATALOGUE_PROGRAMMES, seg), 'p', 'programmes catalogue is untouched by an intake change');
  assert.equal(await cache.get(req, cache.KEYS.CATALOGUE_INTAKES, seg), null);
});

test('invalidateForEntity for an entity with no reference-data cache only touches the dashboard key', async () => {
  const seg = makeSegment();
  await cache.set(req, cache.KEYS.CATALOGUE_PROGRAMMES, 'p', 60000, seg);
  await cache.invalidateForEntity(req, 'enrolments', seg);
  assert.equal(await cache.get(req, cache.KEYS.CATALOGUE_PROGRAMMES, seg), 'p');
});
