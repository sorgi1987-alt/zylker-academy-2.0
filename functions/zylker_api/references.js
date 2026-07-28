'use strict';
/**
 * External reference identifiers for CRM records.
 *
 * This replaces the previous demoGuard.js. That module implemented the only
 * access control the public build had: a record could be written only if its
 * reference began with `DEMO-`. That rule existed because the application had
 * no authentication and therefore no way to tell who was calling. Authorization
 * is now done properly, by role, in permissions.js — so the prefix is no longer
 * a security control and has been removed.
 *
 * What remains is the useful half: a server-minted, stable external reference
 * on each record, used for audit correlation and for spotting records this
 * application created. References are ALWAYS generated here and never accepted
 * from a client payload.
 *
 * Existing `DEMO-*` records in CRM are untouched — they are ordinary records now
 * and are editable subject to the caller's role, like any other.
 *
 * Field choice per module was resolved from live CRM metadata:
 *   Contacts   -> External_Student_Ref
 *   Deals      -> External_Application_Ref
 *   Enrolments -> External_Enrolment_Ref
 *   Intakes    -> External_Intake_Reference
 *   Products   -> Product_Code   (Products has NO external-reference field, so
 *                 the programme code is the stable identifier)
 */
const cfg = require('./config');

/** Reference field per module, and the prefix used when minting a new one. */
const REF_FIELD = {
  [cfg.modules.students]: { field: 'External_Student_Ref', mint: 'STU' },
  [cfg.modules.applications]: { field: 'External_Application_Ref', mint: 'APP' },
  [cfg.modules.enrolments]: { field: 'External_Enrolment_Ref', mint: 'ENR' },
  [cfg.modules.intakes]: { field: 'External_Intake_Reference', mint: 'INT' },
  [cfg.modules.programmes]: { field: 'Product_Code', mint: 'PRG' }
};

const refFieldFor = (module_) => (REF_FIELD[module_] || {}).field || null;

/** Reads a record's external reference, whatever the module. */
function referenceOf(module_, record) {
  const f = refFieldFor(module_);
  return f && record ? (record[f] == null ? null : String(record[f])) : null;
}

/**
 * Server-generated reference. The client never supplies one, so a reference can
 * always be trusted to have been minted here.
 *
 * `REFERENCE_PREFIX` lets an environment tag everything it creates — set it to
 * `TEST` in a verification run so those records are trivially identifiable
 * (e.g. `TEST-STU-M4X1PQ2A`) without changing any code.
 */
function mintRef(module_) {
  const cfgFor = REF_FIELD[module_];
  const base = (cfgFor && cfgFor.mint) || 'REC';
  const envPrefix = String(process.env.REFERENCE_PREFIX || '').trim().replace(/[^A-Za-z0-9-]/g, '');
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${envPrefix ? `${envPrefix}-` : ''}${base}-${stamp}${rand}`;
}

/** Strips any client-supplied reference field from a payload before a write. */
function stripClientRef(module_, payload) {
  const f = refFieldFor(module_);
  if (f && payload && Object.prototype.hasOwnProperty.call(payload, f)) delete payload[f];
  return payload;
}

module.exports = { REF_FIELD, refFieldFor, referenceOf, mintRef, stripClientRef };
