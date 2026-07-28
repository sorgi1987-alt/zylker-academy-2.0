'use strict';
/**
 * Catalyst identity resolution — the single source of truth for "who is calling".
 *
 * ============================== DESIGN RULE ==============================
 * Identity is ONLY ever derived from a credential that the Catalyst SDK has
 * validated. The platform's `x-zc-user-id` / `x-zc-user-type` request headers
 * are NEVER read as identity.
 *
 * Reason (verified 27 Jul 2026, see AUTH_SUPPORT_REPORT.md): the Catalyst
 * gateway does not strip client-supplied copies of those headers. A request
 * sent from a browser with a forged `x-zc-user-id` arrived at the function with
 * BOTH the gateway's value and the caller's, concatenated. Any authorization
 * that trusted them would be trivially bypassable.
 *
 * Consequently this module has no "fall back to the header" path, and must not
 * grow one. If no strategy resolves a user, the request is unauthenticated and
 * the caller gets 401. An application that cannot identify its user must fail
 * closed, not open.
 * =========================================================================
 *
 * Known platform issue
 * --------------------
 * On this project, `getCurrentUser()` has been observed to resolve `null` for a
 * session the Web SDK reports as fully authenticated; `GET /project-user/current`
 * answers `200 {"status":"success","data":null}`. That is an open question with
 * Zoho support.
 *
 * Because of that, resolution is written as an ORDERED LIST OF STRATEGIES rather
 * than a single call. Each is independently safe; the first that returns a user
 * wins. When Zoho confirms the supported call, delete the others — the rest of
 * the application depends only on `resolveUser()` and never on how it worked.
 */
const catalyst = require('zcatalyst-sdk-node');
const axios = require('axios');
const cfg = require('./config');

/* --------------------------- resolution strategies --------------------------- */

/**
 * Each strategy is `{ name, run(req) -> rawUser|null }`. A strategy must either
 * return a user object that the SDK itself produced from a validated
 * credential, or null/throw. It must never construct a user from request
 * headers, query parameters or the request body.
 */
const STRATEGIES = [
  {
    // The documented call, and the one that works on a project where the
    // gateway does not inject a user credential token. Tried first so that a
    // healthy project takes the ordinary path.
    name: 'sdk_default_scope',
    async run(req) {
      const app = catalyst.initialize(req);
      return await app.userManagement().getCurrentUser();
    }
  },
  {
    /**
     * Same SDK call, but forced onto the COOKIE credential.
     *
     * Why this exists
     * ---------------
     * `CatalystCredential` (lib/utils/credential.js) chooses the user
     * credential by switching on the `x-zc-user-cred-type` header:
     *
     *     'token'  -> AccessTokenCredential(x-zc-user-cred-token)
     *     'ticket' -> TicketCredential(x-zc-user-cred-token)
     *     default  -> CookieCredential(x-zc-cookie)
     *
     * On this project the gateway sets `x-zc-user-cred-type: token` and injects
     * a 70-character `x-zc-user-cred-token`. The SDK therefore authenticates
     * with that token — and Catalyst answers `{"status":"success","data":null}`
     * for it. That is the whole of the `getCurrentUser()` puzzle in
     * AUTH_SUPPORT_REPORT.md: the SDK is not broken, it is being handed a
     * credential the platform will not resolve.
     *
     * Withholding those two headers makes the SDK fall through to the cookie
     * credential, which Catalyst does resolve — verified from the browser on
     * 28 July 2026: the same session cookies return the full user record, and
     * a request carrying no credentials returns 401.
     *
     * This is credential SELECTION, not credential forgery. Nothing is added to
     * the request; two headers are withheld so the SDK uses the other
     * credential the gateway already supplied. Both are issued by Catalyst and
     * validated by Catalyst. A caller still cannot authenticate as anyone
     * without a genuine session.
     */
    name: 'sdk_cookie_credential',
    async run(req) {
      const headers = { ...req.headers };
      delete headers['x-zc-user-cred-type'];
      delete headers['x-zc-user-cred-token'];
      // Nothing to fall back to; let the SDK's own error describe it.
      if (!headers['x-zc-cookie']) throw new Error('no x-zc-cookie header to fall back to');

      const app = catalyst.initialize({ headers });
      return await app.userManagement().getCurrentUser();
    }
  },
  {
    // Documented call for a user-scoped Advanced I/O function.
    name: 'sdk_user_scope',
    async run(req) {
      const app = catalyst.initialize(req, { scope: 'user' });
      return await app.userManagement().getCurrentUser();
    }
  },
  {
    // Newer SDK surface. Guarded with typeof so an older SDK simply skips it
    // rather than throwing a TypeError that would mask a real failure.
    name: 'sdk_authentication_namespace',
    async run(req) {
      const app = catalyst.initialize(req, { scope: 'user' });
      if (typeof app.authentication !== 'function') return null;
      const a = app.authentication();
      if (!a || typeof a.getCurrentUser !== 'function') return null;
      return await a.getCurrentUser();
    }
  },
  {
    // Direct call to the project-user endpoint through the SDK's own authorized
    // HTTP client. This is still SDK-validated: the client attaches the
    // credential the SDK resolved from the request, not anything the caller
    // supplied. It exists because the SDK wrapper has been seen to swallow a
    // populated payload.
    name: 'sdk_http_project_user_current',
    async run(req) {
      const app = catalyst.initialize(req, { scope: 'user' });
      const requester = app._requester || (typeof app.getRequester === 'function' ? app.getRequester() : null);
      if (!requester || typeof requester.send !== 'function') return null;
      const res = await requester.send({
        method: 'GET',
        path: '/project-user/current',
        service: 'baas',
        track: true
      });
      const body = res && (res.data || res.body || res);
      const data = body && body.data;
      // `{status:"success", data:null}` is the failure this project is hitting.
      return data && (data.user_id || data.zuid) ? data : null;
    }
  },
  {
    /**
     * Forwarded-session validation. This is the strategy that works on this
     * project; the four above return null here (see AUTH_SUPPORT_REPORT.md).
     *
     * The caller's IAM session cookies are forwarded, unread, to Catalyst's own
     * `/project-user/current` endpoint, and Catalyst is asked who they belong
     * to. The answer is Catalyst's, not the caller's.
     *
     * WHY THIS IS SAFE, AND WHY IT IS NOT THE `x-zc-user-*` MISTAKE
     * ------------------------------------------------------------
     * The rejected approach read an IDENTITY CLAIM out of a request header —
     * `x-zc-user-id: 12345` says "I am user 12345", and anyone can type that.
     * This forwards a CREDENTIAL and has it validated by its issuer. A caller
     * cannot forge IAM session cookies any more than they can forge a password,
     * and the endpoint refuses to answer without them.
     *
     * Verified against the live deployment on 28 July 2026:
     *   - cookies forwarded            -> 200, full user record
     *   - cookies forwarded, no CSRF   -> 200, full user record
     *   - NO credentials               -> 401, no record
     * The third case is the one that matters: the endpoint is a real
     * authentication check, not an echo of whatever was sent.
     *
     * The user id is taken ONLY from the response body. Nothing from the
     * request other than the opaque cookie blob influences the result.
     */
    name: 'catalyst_session_forwarded',
    async run(req) {
      const cookie = req.headers && req.headers.cookie;
      // These two conditions used to `return null`, which made a configuration
      // problem indistinguishable from "not signed in". They now throw, so the
      // reason lands in the attempts array and is visible in diagnostics.
      if (!cookie) throw new Error('no cookie header on the request');

      const base = cfg.auth.platformBaseUrl || platformBaseUrlFrom(req);
      if (!base) {
        const host = (req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '(none)';
        throw new Error(`could not derive a Catalyst base URL from host "${host}"; set CATALYST_PLATFORM_BASE_URL`);
      }

      const res = await axios.get(
        `${base}/baas/v1/project/${cfg.auth.projectId}/project-user/current`,
        {
          timeout: cfg.auth.sessionValidationTimeoutMs,
          // Only the credential is forwarded. Notably NOT forwarded: any
          // x-zc-* header, so a caller-injected identity claim cannot ride along.
          headers: {
            Accept: 'application/json',
            Cookie: cookie,
            ...(req.headers['x-zcsrf-token'] ? { 'X-ZCSRF-TOKEN': req.headers['x-zcsrf-token'] } : {})
          },
          // A 401 is a legitimate answer meaning "not signed in", not a fault.
          validateStatus: (s) => s === 200 || s === 401 || s === 403
        }
      );

      if (res.status !== 200) {
        throw new Error(`project-user/current answered HTTP ${res.status}`);
      }
      const data = res.data && res.data.data;
      if (!data) throw new Error('project-user/current answered 200 with a null record');
      if (!data.user_id) throw new Error('project-user/current record carried no user_id');
      return data;
    }
  }
];

/**
 * Derives the platform base URL for session validation.
 *
 * `x-zc-project-domain` is preferred and is tried first: it is the header
 * Catalyst injects to tell a function its own domain, and it is what the SDK
 * itself uses (`catalyst-namespace.js` → `loadOptionsFromObj`). Taking it from
 * the same place the SDK does means this cannot drift from the platform's own
 * idea of where the project lives.
 *
 * The `Host` header is only a fallback, because a gateway may rewrite it to
 * something internal.
 *
 * Either way the result is checked against the Catalyst domain, so a spoofed
 * header cannot redirect session validation to an attacker-controlled server
 * that would happily answer "yes, they're an administrator".
 */
const CATALYST_HOST_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.catalystserverless\.(eu|com|in|com\.au|jp|ca|sa)$/i;

function platformBaseUrlFrom(req) {
  const headers = (req && req.headers) || {};
  const candidates = [
    headers['x-zc-project-domain'],
    headers['x-forwarded-host'],
    headers.host
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    // Strip a scheme if the header carries one, and take the first value if the
    // gateway appended rather than replaced.
    const host = String(raw).split(',')[0].trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    if (host && CATALYST_HOST_RE.test(host)) return `https://${host}`;
  }
  return null;
}

/* ------------------------------- normalisation ------------------------------- */

const str = (v) => (v === null || v === undefined || v === '' ? null : String(v));

/**
 * Reduces whatever shape a strategy returned to the one the application uses.
 * Catalyst has returned both `user_id`/`email_id` and camelCase variants across
 * versions, so both are read.
 */
function normaliseUser(raw, strategyName) {
  if (!raw) return null;
  const userId = str(raw.user_id || raw.userId || raw.zuid);
  if (!userId) return null;
  const first = str(raw.first_name || raw.firstName) || '';
  const last = str(raw.last_name || raw.lastName) || '';
  const roleDetails = raw.role_details || raw.roleDetails || {};
  return {
    id: userId,
    zuid: str(raw.zuid),
    email: str(raw.email_id || raw.emailId || raw.email),
    firstName: first || null,
    lastName: last || null,
    displayName: [first, last].filter(Boolean).join(' ') || str(raw.email_id || raw.emailId) || userId,
    catalystRole: str(roleDetails.role_name || roleDetails.roleName || raw.role_name || raw.user_type),
    catalystRoleId: str(roleDetails.role_id || roleDetails.roleId),
    status: str(raw.status),
    isConfirmed: raw.is_confirmed === true || raw.isConfirmed === true,
    resolvedBy: strategyName
  };
}

/* --------------------------------- public API -------------------------------- */

/**
 * Resolves the authenticated Catalyst user for a request, or null.
 *
 * Returns `{ user, attempts }`. `attempts` records what each strategy did, for
 * the diagnostics endpoint — it carries strategy names, booleans and redacted
 * messages only, never a credential.
 */
async function resolveUser(req) {
  const attempts = [];
  for (const s of STRATEGIES) {
    try {
      const raw = await s.run(req);
      const user = normaliseUser(raw, s.name);
      attempts.push({
        strategy: s.name,
        returnedValue: raw !== null && raw !== undefined,
        resolvedUser: Boolean(user)
      });
      if (user) return { user, attempts };
    } catch (err) {
      attempts.push({
        strategy: s.name,
        returnedValue: false,
        resolvedUser: false,
        // Message only, truncated. SDK errors quote credential state, so this
        // is also passed through the redactor before it can leave the process.
        error: redactMessage(err && err.message)
      });
    }
  }
  return { user: null, attempts };
}

/** Strips anything token-shaped out of a message before it can be returned. */
function redactMessage(text) {
  return String(text || '')
    .replace(/[A-Za-z0-9._-]{25,}/g, '[redacted]')
    .slice(0, 160);
}

/**
 * Caches the resolved user on the request so a handler that checks permissions
 * more than once does not re-resolve. Scoped to a single request object, so
 * there is no cross-request leakage.
 */
async function currentUser(req) {
  if (Object.prototype.hasOwnProperty.call(req, '__zylkerUser')) return req.__zylkerUser;
  const { user, attempts } = await resolveUser(req);
  req.__zylkerUser = user;
  req.__zylkerAuthAttempts = attempts;
  return user;
}

/**
 * Reports which authentication surface the deployment is configured for,
 * without asserting that it works. Used by /api/integration-status.
 */
function authConfig() {
  return {
    provider: 'catalyst',
    mode: cfg.auth.mode,
    embeddedLoginEnabled: cfg.auth.embeddedLoginEnabled,
    strategies: STRATEGIES.map((s) => s.name)
  };
}

module.exports = {
  resolveUser, currentUser, normaliseUser, authConfig, redactMessage, STRATEGIES,
  // exposed for tests
  _internals: { platformBaseUrlFrom, CATALYST_HOST_RE }
};
