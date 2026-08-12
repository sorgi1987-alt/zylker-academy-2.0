'use strict';
/**
 * Role and permission layer.
 *
 * Authorization is centralised here so that adding a role, or changing what a
 * role may do, is a change to ONE table rather than a hunt through route
 * handlers. Every write route resolves its permission through `requirePermission`;
 * no handler makes its own decision about who may call it.
 *
 * Where roles come from
 * ---------------------
 * The Catalyst project currently defines only two roles — "App Administrator"
 * and "App User" (verified against the project's role list). The five business
 * roles in the specification therefore cannot be stored in Catalyst today, so
 * they are resolved in this order:
 *
 *   1. ZYLKER_ROLE_MAP  — a JSON object in the Catalyst environment mapping a
 *                         lower-cased email to one of the ROLES values, e.g.
 *                         {"admissions@zylker.com":"admissions"}
 *   2. Catalyst role    — "App Administrator" maps to `administrator`.
 *   3. ZYLKER_DEFAULT_ROLE — role for any other authenticated user.
 *   4. `viewer`         — read-only, the safe default.
 *
 * To assign roles later without a code change: set ZYLKER_ROLE_MAP in the
 * Catalyst console (Settings -> Environment Variables) and redeploy. If Catalyst
 * gains custom roles, add a branch to `roleFor()` that reads
 * `user.catalystRole`; nothing else in the application needs to change.
 */

const ROLES = {
  ADMINISTRATOR: 'administrator',
  ADMISSIONS: 'admissions',
  ACADEMIC: 'academic',
  FINANCE: 'finance',
  VIEWER: 'viewer'
};

const ROLE_LABEL = {
  [ROLES.ADMINISTRATOR]: 'Administrator',
  [ROLES.ADMISSIONS]: 'Admissions',
  [ROLES.ACADEMIC]: 'Academic',
  [ROLES.FINANCE]: 'Finance',
  [ROLES.VIEWER]: 'Viewer'
};

/**
 * Permission vocabulary. `<entity>:<action>`; `read` covers list and detail.
 * Keeping these as plain strings means a route declares exactly one of them and
 * the matrix below is readable at a glance.
 */
const P = {
  STUDENT_READ: 'student:read',
  STUDENT_WRITE: 'student:write',
  STUDENT_DELETE: 'student:delete',
  APPLICATION_READ: 'application:read',
  APPLICATION_WRITE: 'application:write',
  APPLICATION_TRANSITION: 'application:transition',
  APPLICATION_DELETE: 'application:delete',
  PROGRAMME_READ: 'programme:read',
  PROGRAMME_WRITE: 'programme:write',
  PROGRAMME_DELETE: 'programme:delete',
  INTAKE_READ: 'intake:read',
  INTAKE_WRITE: 'intake:write',
  INTAKE_DELETE: 'intake:delete',
  ENROLMENT_READ: 'enrolment:read',
  ENROLMENT_WRITE: 'enrolment:write',
  ENROLMENT_DELETE: 'enrolment:delete',
  // COURSE_READ ('course:read') was the Zoho Learn catalogue and is gone with it.
  // Learning data is now behind LMS_READ.
  // External LMS Connector (Catalyst demonstration dataset)
  LMS_READ: 'lms:read',
  LMS_WRITE: 'lms:write',
  LMS_MAP: 'lms:map',
  LMS_SYNC: 'lms:sync',
  LMS_BULK_SYNC: 'lms:bulk-sync',
  LMS_CREATE_CRM_ENROLMENT: 'lms:create-crm-enrolment',
  INVOICE_READ: 'invoice:read',
  // Zoho Desk tickets. Unlike invoices, ticket data is not finance-sensitive,
  // so every role reads it via COMMON_READ rather than a dedicated grant list.
  TICKET_READ: 'ticket:read',
  DASHBOARD_READ: 'dashboard:read',
  INTEGRATION_READ: 'integration:read',
  ACTIVITY_READ: 'activity:read',
  // Records an internal note in the activity trail. Deliberately separate from
  // the entity write permissions: writing an observation about a record is not
  // the same act as changing it, and no CRM field is touched.
  ACTIVITY_WRITE: 'activity:write',
  // Overrides a capacity limit on an intake. Deliberately administrator-only.
  CAPACITY_OVERRIDE: 'intake:capacity-override',
  // Triggers the read-model PoC's bootstrap/reconciliation sync operations
  // (kickoff-prompt.md §2). Deliberately administrator-only, same reasoning
  // as CAPACITY_OVERRIDE: not included in any role's list below, so only the
  // '*' wildcard grants it.
  SYNC_ADMIN: 'sync:admin'
};

/** Everything any authenticated user may read. Keeps the matrix below short. */
const COMMON_READ = [
  P.DASHBOARD_READ, P.INTEGRATION_READ, P.ACTIVITY_READ, P.LMS_READ, P.TICKET_READ,
  P.STUDENT_READ, P.APPLICATION_READ, P.PROGRAMME_READ, P.INTAKE_READ, P.ENROLMENT_READ
];

/**
 * Role -> permissions. Administrator is handled as a wildcard rather than an
 * exhaustive list, so a new permission is never accidentally denied to admins
 * (and, more importantly, never accidentally GRANTED to anyone else).
 */
const MATRIX = {
  [ROLES.ADMINISTRATOR]: '*',

  // Admissions owns applicants and their applications end to end.
  [ROLES.ADMISSIONS]: [
    ...COMMON_READ, P.INVOICE_READ,
    P.ACTIVITY_WRITE,
    P.STUDENT_WRITE,
    P.APPLICATION_WRITE, P.APPLICATION_TRANSITION,
    // Transitioning an application to Enrolled provisions an enrolment, so
    // admissions must be able to write one. It may not delete one.
    P.ENROLMENT_WRITE
    // Admissions reads LMS data through COMMON_READ but does not manage the
    // connector: creating, mapping and syncing LMS records is academic work.
  ],

  // Academic owns the delivery structure: programmes, intakes, enrolments.
  [ROLES.ACADEMIC]: [
    ...COMMON_READ,
    P.ACTIVITY_WRITE,
    P.PROGRAMME_WRITE, P.INTAKE_WRITE,
    P.ENROLMENT_WRITE,
    // Owns the External LMS Connector: create, edit, map and sync individual
    // records. Bulk synchronisation and creating CRM Enrolments from LMS data
    // stay with administrators, because both act on many records at once.
    P.LMS_WRITE, P.LMS_MAP, P.LMS_SYNC
  ],

  // Finance reads students and invoices. Invoices are read-only for everyone in
  // this phase, so Finance has no write permission at all.
  [ROLES.FINANCE]: [
    ...COMMON_READ, P.INVOICE_READ
  ],

  // Viewer: reads everything except invoices, writes nothing.
  [ROLES.VIEWER]: [...COMMON_READ]
};

/* ------------------------------ role resolution ------------------------------ */

const VALID_ROLES = new Set(Object.values(ROLES));

/** Parses ZYLKER_ROLE_MAP once. A malformed value is ignored, not fatal. */
let roleMapCache;
function roleMap() {
  if (roleMapCache) return roleMapCache;
  roleMapCache = new Map();
  try {
    const raw = JSON.parse(process.env.ZYLKER_ROLE_MAP || '{}');
    Object.entries(raw).forEach(([email, role]) => {
      const r = String(role || '').toLowerCase();
      if (VALID_ROLES.has(r)) roleMapCache.set(String(email).trim().toLowerCase(), r);
    });
  } catch {
    /* Misconfiguration must not lock everyone out; fall through to defaults. */
  }
  return roleMapCache;
}

const defaultRole = () => {
  const r = String(process.env.ZYLKER_DEFAULT_ROLE || '').toLowerCase();
  return VALID_ROLES.has(r) ? r : ROLES.VIEWER;
};

/**
 * Resolves the application role for an authenticated Catalyst user.
 * Never called with null — an unauthenticated request is rejected earlier.
 */
function roleFor(user) {
  if (!user) return null;
  const byEmail = user.email ? roleMap().get(String(user.email).trim().toLowerCase()) : null;
  if (byEmail) return byEmail;
  if (String(user.catalystRole || '').toLowerCase() === 'app administrator') return ROLES.ADMINISTRATOR;
  return defaultRole();
}

/** True when `role` holds `permission`. Administrator holds all of them. */
function can(role, permission) {
  if (!role || !permission) return false;
  const grants = MATRIX[role];
  if (!grants) return false;
  if (grants === '*') return true;
  return grants.includes(permission);
}

/** The full permission list for a role — sent to the client to drive the UI. */
function permissionsFor(role) {
  const grants = MATRIX[role];
  if (!grants) return [];
  return grants === '*' ? Object.values(P) : [...grants];
}

/**
 * Shapes the identity payload returned by /api/me and embedded in error
 * context. Contains no credential of any kind.
 */
function principal(user) {
  const role = roleFor(user);
  return {
    id: user.id,
    email: user.email,
    name: user.displayName,
    firstName: user.firstName,
    lastName: user.lastName,
    role,
    roleLabel: ROLE_LABEL[role] || role,
    catalystRole: user.catalystRole,
    permissions: permissionsFor(role)
  };
}

module.exports = { ROLES, ROLE_LABEL, P, MATRIX, roleFor, can, permissionsFor, principal, VALID_ROLES };
