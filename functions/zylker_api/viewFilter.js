'use strict';
/**
 * Generic multi-condition filtering and single-field sorting for "custom
 * view" list pages (Students/Applications/Programmes today).
 *
 * Conditions arrive as JSON from the client (`?conditions=[...]`) and are
 * validated against a per-entity field registry (see viewFields.js) before
 * they touch a single row — a condition naming an unlisted field, or an
 * operator that isn't in OPERATORS, is dropped rather than evaluated. This
 * is what stops a crafted request from probing a field the registry does not
 * name, since `getPath` would otherwise happily walk any dot-path handed to
 * it.
 */

const getPath = (row, path) => path.split('.').reduce((o, k) => (o == null ? null : o[k]), row);

const norm = (v) => String(v ?? '').toLowerCase();

const OPERATORS = {
  equals: (v, t) => norm(v) === norm(t),
  not_equals: (v, t) => norm(v) !== norm(t),
  contains: (v, t) => norm(v).includes(norm(t)),
  not_contains: (v, t) => !norm(v).includes(norm(t)),
  is_empty: (v) => v === null || v === undefined || v === '',
  is_not_empty: (v) => !(v === null || v === undefined || v === ''),
  gt: (v, t) => Number(v) > Number(t),
  gte: (v, t) => Number(v) >= Number(t),
  lt: (v, t) => Number(v) < Number(t),
  lte: (v, t) => Number(v) <= Number(t),
  before: (v, t) => v != null && t != null && Date.parse(v) < Date.parse(t),
  after: (v, t) => v != null && t != null && Date.parse(v) > Date.parse(t)
};

// The client never sends a `value` for these (there is nothing to type), so a
// condition is accepted without one — but if a stray value did arrive, these
// operators ignore their second argument anyway.
const NO_VALUE_OPERATORS = new Set(['is_empty', 'is_not_empty']);

/**
 * Filters `rows` by every condition in `conditionsJson` (AND-combined).
 * `fieldTypes` is a `{ [fieldKey]: { path, type } }` allowlist from
 * viewFields.js — a condition naming any other field, or an operator not in
 * OPERATORS, is silently dropped rather than applied. Malformed JSON is
 * treated as no filter rather than a request error, since a corrupt saved
 * view (e.g. from an older client build) should degrade to "show
 * everything", not break the page.
 */
function applyConditions(rows, conditionsJson, fieldTypes) {
  if (!conditionsJson) return rows;
  let conditions;
  try { conditions = JSON.parse(conditionsJson); } catch { return rows; }
  if (!Array.isArray(conditions) || !conditions.length) return rows;

  const safe = conditions
    .filter((c) => {
      if (!c || typeof c.field !== 'string' || typeof c.operator !== 'string') return false;
      if (!fieldTypes[c.field] || !OPERATORS[c.operator]) return false;
      if (!NO_VALUE_OPERATORS.has(c.operator) && (c.value === undefined || c.value === null || c.value === '')) return false;
      return true;
    })
    // A saved view is edited through the UI's own builder, which has no way
    // to produce more than a handful of rows — this just bounds the cost of
    // a hand-crafted request rather than a real usage limit.
    .slice(0, 10);

  if (!safe.length) return rows;
  return rows.filter((row) => safe.every((c) => {
    const v = getPath(row, fieldTypes[c.field].path);
    return OPERATORS[c.operator](v, c.value);
  }));
}

/** Sorts `rows` by one field, honouring its declared type for comparison. Unknown/absent sortBy returns `rows` unchanged (original order). */
function applySort(rows, sortBy, sortDir, fieldTypes) {
  const def = sortBy && fieldTypes[sortBy];
  if (!def) return rows;
  const dir = sortDir === 'desc' ? -1 : 1;
  const sorted = [...rows];
  sorted.sort((a, b) => {
    const va = getPath(a, def.path);
    const vb = getPath(b, def.path);
    // Missing values sort last regardless of direction, rather than flipping
    // to the top on a descending sort — "unknown" is not "smallest".
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (def.type === 'number') return (Number(va) - Number(vb)) * dir;
    if (def.type === 'date') return (Date.parse(va) - Date.parse(vb)) * dir;
    if (def.type === 'boolean') return ((va === true ? 1 : 0) - (vb === true ? 1 : 0)) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });
  return sorted;
}

module.exports = { applyConditions, applySort, OPERATORS };
