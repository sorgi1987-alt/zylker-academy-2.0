'use strict';
/**
 * Custom-view condition filtering and sorting (viewFilter.js), exercised
 * against a fixed row set and a small field registry — no live Catalyst
 * session.
 *
 * Run with:  node --test functions/zylker_api/test/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyConditions, applySort } = require('../viewFilter.js');

const FIELDS = {
  name: { path: 'name', type: 'text' },
  age: { path: 'age', type: 'number' },
  joined: { path: 'joined', type: 'date' },
  active: { path: 'active', type: 'boolean' },
  programme: { path: 'programme.name', type: 'text' }
};

const ROWS = [
  { name: 'Amara', age: 22, joined: '2026-01-10', active: true, programme: { name: 'Data Analytics' } },
  { name: 'Ben', age: 30, joined: '2025-06-01', active: false, programme: { name: 'Marketing' } },
  { name: 'Chiara', age: null, joined: null, active: true, programme: null }
];

test('applyConditions with no conditions returns rows unchanged', () => {
  assert.deepEqual(applyConditions(ROWS, null, FIELDS), ROWS);
  assert.deepEqual(applyConditions(ROWS, '[]', FIELDS), ROWS);
});

test('applyConditions drops a condition naming an unlisted field', () => {
  const conditions = JSON.stringify([{ field: 'ssn', operator: 'equals', value: '123' }]);
  assert.deepEqual(applyConditions(ROWS, conditions, FIELDS), ROWS);
});

test('applyConditions drops a condition using an unknown operator', () => {
  const conditions = JSON.stringify([{ field: 'name', operator: 'regex_match', value: '.*' }]);
  assert.deepEqual(applyConditions(ROWS, conditions, FIELDS), ROWS);
});

test('applyConditions tolerates malformed JSON by returning rows unchanged', () => {
  assert.deepEqual(applyConditions(ROWS, '{not json', FIELDS), ROWS);
});

test('text contains is case-insensitive', () => {
  const conditions = JSON.stringify([{ field: 'name', operator: 'contains', value: 'ben' }]);
  const result = applyConditions(ROWS, conditions, FIELDS);
  assert.deepEqual(result.map((r) => r.name), ['Ben']);
});

test('number gte filters correctly', () => {
  const conditions = JSON.stringify([{ field: 'age', operator: 'gte', value: '25' }]);
  const result = applyConditions(ROWS, conditions, FIELDS);
  assert.deepEqual(result.map((r) => r.name), ['Ben']);
});

test('date before filters correctly', () => {
  const conditions = JSON.stringify([{ field: 'joined', operator: 'before', value: '2025-12-31' }]);
  const result = applyConditions(ROWS, conditions, FIELDS);
  assert.deepEqual(result.map((r) => r.name), ['Ben']);
});

test('is_empty matches null/undefined without needing a value', () => {
  const conditions = JSON.stringify([{ field: 'age', operator: 'is_empty' }]);
  const result = applyConditions(ROWS, conditions, FIELDS);
  assert.deepEqual(result.map((r) => r.name), ['Chiara']);
});

test('multiple conditions are AND-combined', () => {
  const conditions = JSON.stringify([
    { field: 'active', operator: 'equals', value: 'true' },
    { field: 'name', operator: 'contains', value: 'a' }
  ]);
  const result = applyConditions(ROWS, conditions, FIELDS);
  // Amara: active=true, contains 'a'. Chiara: active=true, contains 'a' too.
  assert.deepEqual(result.map((r) => r.name).sort(), ['Amara', 'Chiara']);
});

test('condition on a nested dot-path field (programme.name) works', () => {
  const conditions = JSON.stringify([{ field: 'programme', operator: 'equals', value: 'Marketing' }]);
  const result = applyConditions(ROWS, conditions, FIELDS);
  assert.deepEqual(result.map((r) => r.name), ['Ben']);
});

test('a non-empty-check operator with no value is dropped, not applied', () => {
  const conditions = JSON.stringify([{ field: 'name', operator: 'equals' }]);
  assert.deepEqual(applyConditions(ROWS, conditions, FIELDS), ROWS);
});

test('applySort with no sortBy returns rows in original order', () => {
  assert.deepEqual(applySort(ROWS, null, null, FIELDS), ROWS);
});

test('applySort with an unknown field returns rows unchanged', () => {
  assert.deepEqual(applySort(ROWS, 'ssn', 'asc', FIELDS), ROWS);
});

test('applySort sorts text ascending and descending', () => {
  const asc = applySort(ROWS, 'name', 'asc', FIELDS).map((r) => r.name);
  assert.deepEqual(asc, ['Amara', 'Ben', 'Chiara']);
  const desc = applySort(ROWS, 'name', 'desc', FIELDS).map((r) => r.name);
  assert.deepEqual(desc, ['Chiara', 'Ben', 'Amara']);
});

test('applySort sorts numbers numerically, not lexically, and puts nulls last', () => {
  const asc = applySort(ROWS, 'age', 'asc', FIELDS).map((r) => r.name);
  assert.deepEqual(asc, ['Amara', 'Ben', 'Chiara']);
  const desc = applySort(ROWS, 'age', 'desc', FIELDS).map((r) => r.name);
  // Nulls sort last regardless of direction.
  assert.deepEqual(desc, ['Ben', 'Amara', 'Chiara']);
});

test('applySort sorts dates chronologically', () => {
  const asc = applySort(ROWS, 'joined', 'asc', FIELDS).map((r) => r.name);
  assert.deepEqual(asc, ['Ben', 'Amara', 'Chiara']);
});

test('applySort does not mutate the input array', () => {
  const copy = [...ROWS];
  applySort(ROWS, 'name', 'desc', FIELDS);
  assert.deepEqual(ROWS, copy);
});
