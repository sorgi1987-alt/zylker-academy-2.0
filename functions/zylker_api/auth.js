'use strict';
/**
 * Request plumbing, authentication and authorization middleware.
 *
 * The security boundary of this application is `requireAuth` / `requirePermission`
 * below. Hiding a button in React is presentation, not protection: every route
 * in index.js passes through one of these before a handler runs, and every
 * mutating route additionally names the permission it requires.
 *
 * Identity comes exclusively from identity.js, which resolves it from a
 * Catalyst-SDK-validated credential and never from request headers.
 */
const catalyst = require('zcatalyst-sdk-node');
const identity = require('./identity');
const perms = require('./permissions');
const cfg = require('./config');

const newRequestId = () =>
  `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** Attaches a correlation id to every request, echoed in every response. */
function requestId(req, res, next) {
  req.requestId = newRequestId();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

const errorBody = (req, code, message, extra = {}) =>
  ({ error: { code, message, requestId: req.requestId || null, ...extra } });

/* ------------------------- authentication logging -------------------------- */

/**
 * Writes one structured line to the function log when identity cannot be
 * resolved, so an authentication failure is diagnosable from the Catalyst
 * console without exposing anything through a public endpoint.
 *
 * What it records: header NAMES, cookie NAMES, and what each resolution
 * strategy did. What it never records: any header VALUE, any cookie VALUE, any
 * token, or any user detail. A session cookie value is a working login, so it
 * must not reach a log line that a console viewer or log export could carry.
 *
 * Throttled to one line per interval. A failing client can retry in a loop, and
 * a log full of identical lines is harder to read, not easier.
 */
const AUTH_LOG_INTERVAL_MS = Number(process.env.AUTH_LOG_INTERVAL_MS || 15000);
let lastAuthLogAt = 0;

function logAuthFailure(req) {
  const now = Date.now();
  if (now - lastAuthLogAt < AUTH_LOG_INTERVAL_MS) return;
  lastAuthLogAt = now;

  try {
    const headers = req.headers || {};
    const cookieNames = String(headers.cookie || '')
      .split(';').map((c) => c.split('=')[0].trim()).filter(Boolean);
    const zcCookieNames = String(headers['x-zc-cookie'] || '')
      .split(';').map((c) => c.split('=')[0].trim()).filter(Boolean);

    // eslint-disable-next-line no-console
    console.log('AUTH_UNRESOLVED ' + JSON.stringify({
      requestId: req.requestId,
      path: req.path,
      // Names only, sorted, so a diff between two deployments is readable.
      headerNames: Object.keys(headers).sort(),
      cookieNames,
      // The two facts that decide which SDK credential is used.
      userCredType: headers['x-zc-user-cred-type'] || null,
      hasUserCredToken: Boolean(headers['x-zc-user-cred-token']),
      hasZcCookie: Boolean(headers['x-zc-cookie']),
      zcCookieNames,
      projectDomainHeader: headers['x-zc-project-domain'] || null,
      hostHeader: headers.host || null,
      derivedPlatformBaseUrl: cfg.auth.platformBaseUrl
        || identity._internals.platformBaseUrlFrom(req)
        || null,
      // What each strategy did, with messages already redacted by identity.js.
      attempts: req.__zylkerAuthAttempts || []
    }));
  } catch {
    /* diagnostics must never break a request */
  }
}

/* ----------------------------- authentication ------------------------------ */

/**
 * Rejects any request without a resolvable Catalyst user.
 *
 * Fails closed: if identity cannot be established for ANY reason — no session,
 * an SDK error, an unreachable platform endpoint — the answer is 401. There is
 * no path through this function that admits an unidentified caller.
 */
async function requireAuth(req, res, next) {
  // Local test harness only. cfg.auth.bypassForLocalTests is driven by an
  // environment variable that must never be set on a deployed environment.
  if (cfg.auth.bypassForLocalTests) {
    req.user = { id: 'local-test', email: 'local@test', displayName: 'Local Test',
      catalystRole: 'App Administrator', resolvedBy: 'bypass' };
    req.principal = perms.principal(req.user);
    return next();
  }

  let user = null;
  try {
    user = await identity.currentUser(req);
  } catch {
    user = null;
  }

  if (!user) {
    logAuthFailure(req);
    return res.status(401).json(errorBody(req, 'UNAUTHENTICATED',
      'Sign in to continue.', { authenticated: false }));
  }

  req.user = user;
  req.principal = perms.principal(user);
  return next();
}

/**
 * Authorizes a request that has already passed `requireAuth`.
 * Returns 403 with the permission name so the client can explain the refusal
 * without having to reimplement the matrix.
 */
function requirePermission(permission) {
  return function (req, res, next) {
    const role = req.principal && req.principal.role;
    if (!perms.can(role, permission)) {
      return res.status(403).json(errorBody(req, 'FORBIDDEN',
        'Your role does not allow this action.',
        { requiredPermission: permission, role: role || null }));
    }
    return next();
  };
}

/** Predicate form, for a handler that needs a conditional rather than a gate. */
const hasPermission = (req, permission) =>
  perms.can(req.principal && req.principal.role, permission);

/* -------------------------------- guards ---------------------------------- */

/**
 * Rejects a mutating request that is not JSON, so a malformed body cannot
 * reach the CRM payload builders.
 */
function requireJson(req, res, next) {
  const ct = String(req.headers['content-type'] || '');
  if (req.method !== 'DELETE' && !ct.includes('application/json')) {
    return res.status(415).json(errorBody(req, 'UNSUPPORTED_MEDIA_TYPE',
      'Content-Type must be application/json.'));
  }
  return next();
}

/**
 * Origin check for mutations. Browsers always send Origin on cross-origin
 * writes; same-origin fetches from the deployed client may omit it, so a
 * MISSING origin is allowed and only a PRESENT, non-matching one is rejected.
 * A defence-in-depth measure behind authentication, not a substitute for it.
 */
const ALLOWED_ORIGIN_RE = /^https:\/\/[a-z0-9-]+\.development\.catalystserverless\.eu$|^https:\/\/[a-z0-9-]+\.catalystserverless\.eu$/i;

function checkOrigin(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) return next();
  const extra = process.env.ALLOWED_ORIGIN;
  if (ALLOWED_ORIGIN_RE.test(origin) || (extra && origin === extra)) return next();
  return res.status(403).json(errorBody(req, 'BAD_ORIGIN', 'Requests from this origin are not allowed.'));
}

/**
 * Fixed-window rate limit for mutations, keyed on the authenticated user id
 * when there is one and the client IP otherwise.
 *
 * In-memory and therefore per-instance: Catalyst may run several instances, so
 * the effective ceiling is this limit times the instance count. It is a brake
 * on runaway clients, not a hard quota.
 */
const RATE = { windowMs: 60000, max: Number(process.env.MUTATION_RATE_LIMIT || 60) };
const hits = new Map();

function rateLimit(req, res, next) {
  const key = (req.user && req.user.id)
    ? `u:${req.user.id}`
    : `ip:${String(req.headers['x-zc-forwarded-for'] || req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim()}`;
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || now > rec.reset) {
    hits.set(key, { count: 1, reset: now + RATE.windowMs });
  } else {
    rec.count += 1;
    if (rec.count > RATE.max) {
      res.setHeader('Retry-After', Math.ceil((rec.reset - now) / 1000));
      return res.status(429).json(errorBody(req, 'RATE_LIMITED',
        'Too many changes in a short time. Wait a moment and try again.'));
    }
  }
  if (hits.size > 1000) for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
  return next();
}

/* -------------------------------- auditing -------------------------------- */

/**
 * Values recorded for changed fields are truncated and coerced to short
 * strings. Lookups are reduced to their display name, so no nested payload —
 * and no token — can end up in the log.
 */
function safeValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v.name) return String(v.name).slice(0, 120);
    if (v.id) return String(v.id).slice(0, 40);
    return '[object]';
  }
  return String(v).slice(0, 200);
}

/** Reduces a record to just the named fields, as safe display values. */
function pick(record, fields) {
  const out = {};
  (fields || []).forEach((f) => { out[f] = safeValue(record ? record[f] : null); });
  return out;
}

/**
 * Appends an audit event to the Catalyst Data Store, attributed to the
 * authenticated user. Stores changed field NAMES and short display values,
 * never a credential.
 *
 * Table named by AUDIT_TABLE (default: admissions_audit) with columns:
 *   occurred_at, user_id, user_email, user_role, action, entity_type,
 *   crm_record_id, record_ref, changed_fields, before_values, after_values,
 *   result_status, request_id
 * NOTE: the column is result_status, not result — 'result' is a reserved
 * keyword in the Catalyst Data Store and cannot be used as a column name.
 */
/**
 * Reserved key used to carry a free-text note inside `after_values`.
 *
 * The audit table has no note column, and adding one would mean a Data Store
 * schema change that an existing deployment would not have — insertRow would
 * fail against an unknown column and the note would be swallowed by the catch
 * below, which is the worst possible outcome: a comment the user believes was
 * saved. Riding inside the JSON blob costs nothing, works on every deployment,
 * and readActivity lifts it back out as `note`.
 */
const NOTE_KEY = '__note';
const NOTE_MAX = 1000;

async function audit(req, event) {
  try {
    const app = catalyst.initialize(req);
    const table = app.datastore().table(process.env.AUDIT_TABLE || 'admissions_audit');
    const fields = event.changedFields || [];
    const p = req.principal || {};
    await table.insertRow({
      occurred_at: new Date().toISOString(),
      user_id: p.id || null,
      user_email: p.email || null,
      user_role: p.role || null,
      action: event.action,
      entity_type: event.entityType,
      crm_record_id: event.recordId || null,
      record_ref: event.recordRef || null,
      changed_fields: fields.join(','),
      before_values: event.before ? JSON.stringify(pick(event.before, fields)).slice(0, 9000) : null,
      after_values: (event.after || event.note)
        ? JSON.stringify({
          ...(event.after ? pick(event.after, fields) : {}),
          ...(event.note ? { [NOTE_KEY]: String(event.note).slice(0, NOTE_MAX) } : {})
        }).slice(0, 9000)
        : null,
      result_status: event.result,
      request_id: req.requestId || null
    });
  } catch {
    /* auditing must never break the caller; failures are non-fatal */
  }
}

/**
 * Reads recent activity. Optional filters narrow to one record or entity type.
 * Returns rows shaped for the UI; never returns credentials of any kind.
 */
async function readActivity(req, { entityType, recordId, result, operation, limit = 50 } = {}) {
  const app = catalyst.initialize(req);
  const tableName = process.env.AUDIT_TABLE || 'admissions_audit';
  const where = [];
  const esc = (v) => String(v).replace(/'/g, "''").slice(0, 60);
  if (entityType) where.push(`entity_type = '${esc(entityType)}'`);
  if (recordId) where.push(`crm_record_id = '${esc(recordId)}'`);
  // result_status holds the literal 'success' on success, but 'error:CODE' on
  // failure (the code varies), so "Error" is a prefix match, not an equality.
  if (result === 'success') where.push("result_status = 'success'");
  if (result === 'error') where.push("result_status like 'error*'");
  // action is '<entity>:<verb>' (e.g. 'application:create', 'intake:status'),
  // so "created"/"deleted" are exact verb matches and "updated" is everything
  // else — every other verb (update, transition, archive, activate,
  // deactivate, status, complete, note) is a change to an existing record,
  // not a new or removed one.
  // ZCQL's LIKE wildcard is '*', not SQL's '%'.
  if (operation === 'create') where.push("action like '*:create'");
  if (operation === 'delete') where.push("action like '*:delete'");
  if (operation === 'update') where.push("action not like '*:create' and action not like '*:delete'");
  const clause = where.length ? ` where ${where.join(' and ')}` : '';
  const n = Math.min(Number(limit) || 50, 200);
  const rows = await app.zcql().executeZCQLQuery(
    `select ROWID, occurred_at, user_email, user_role, action, entity_type, crm_record_id, record_ref, changed_fields, before_values, after_values, result_status, request_id from ${tableName}${clause} order by ROWID desc limit ${n}`
  );
  const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
  return (rows || []).map((r) => {
    const a = r[tableName] || r;
    // Lift the note back out so it is never rendered as though it were a
    // changed CRM field.
    const after = parse(a.after_values);
    let note = null;
    if (after && Object.prototype.hasOwnProperty.call(after, NOTE_KEY)) {
      note = after[NOTE_KEY];
      delete after[NOTE_KEY];
    }
    return {
      id: a.ROWID,
      note,
      occurredAt: a.occurred_at,
      actor: a.user_email || null,
      actorRole: a.user_role || null,
      action: a.action,
      entityType: a.entity_type,
      recordId: a.crm_record_id,
      recordRef: a.record_ref,
      changedFields: a.changed_fields ? String(a.changed_fields).split(',').filter(Boolean) : [],
      before: parse(a.before_values),
      after,
      result: a.result_status,
      requestId: a.request_id
    };
  });
}

/* ------------------------------ idempotency ------------------------------- */

/**
 * Idempotency for create/transition. A caller may send Idempotency-Key; a
 * repeat within the window returns the first response instead of acting twice.
 *
 * In-memory and per-instance, and keyed by USER as well as key so two people
 * cannot collide. The durable guarantee for enrolments is the find-before-create
 * logic in writes.js, not this cache.
 */
const IDEM_TTL = 5 * 60 * 1000;
const idem = new Map();

const idempotencyKey = (req) => {
  const k = req.headers['idempotency-key'];
  if (!k) return null;
  const who = (req.user && req.user.id) || 'anon';
  return `${who}:${req.method}:${req.path}:${String(k).slice(0, 100)}`;
};

function idempotencyLookup(req) {
  const k = idempotencyKey(req);
  if (!k) return null;
  const hit = idem.get(k);
  if (!hit) return null;
  if (Date.now() > hit.expires) { idem.delete(k); return null; }
  return hit.body;
}

function idempotencyStore(req, body) {
  const k = idempotencyKey(req);
  if (!k) return;
  idem.set(k, { body, expires: Date.now() + IDEM_TTL });
  if (idem.size > 500) for (const [kk, v] of idem) if (Date.now() > v.expires) idem.delete(kk);
}

module.exports = {
  requestId, requireAuth, requirePermission, hasPermission,
  requireJson, checkOrigin, rateLimit,
  audit, readActivity, errorBody,
  idempotencyLookup, idempotencyStore
};
