/**
 * Single place that talks to the Catalyst backend.
 *
 * No Zoho credentials, OAuth client id, client secret or access token exists in
 * this bundle. Every Zoho call happens server-side inside the Catalyst
 * function, authorised by a Catalyst Connection the browser never sees.
 *
 * The only credential the browser holds is the Catalyst session cookie, which
 * Catalyst set and which is sent automatically by `credentials: 'include'`.
 */
const BASE = import.meta.env.VITE_API_BASE || '/server/zylker_api';

export class ApiError extends Error {
  constructor(message, code, service, status, extra = {}) {
    super(message);
    this.code = code;
    this.service = service;
    this.status = status;
    this.requiredPermission = extra.requiredPermission || null;
    this.requestId = extra.requestId || null;
  }
}

/**
 * Zoho validates a CSRF token on session-authenticated calls. The token is
 * published in the readable ZD_CSRF_TOKEN cookie and must be echoed back as a
 * header — the SDK builds the same 'zd_csrparam=<token>' value server-side.
 * Without it the request is treated as unauthenticated.
 */
function csrfHeader() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)ZD_CSRF_TOKEN=([^;]+)/);
    return m ? { 'X-ZCSRF-TOKEN': `zd_csrparam=${decodeURIComponent(m[1])}` } : {};
  } catch {
    return {};
  }
}

/** Turns a params object into a query string, dropping empty values. */
function qs(params) {
  const entries = Object.entries(params || {})
    .filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (!entries.length) return '';
  return `?${new URLSearchParams(entries).toString()}`;
}

async function parse(res) {
  let body = null;
  try { body = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = (body && body.error) || {};
    throw new ApiError(
      err.message || 'Something went wrong.',
      err.code || 'ERROR',
      err.service || null,
      res.status,
      err
    );
  }
  return body || { data: null, meta: {} };
}

async function get(path, { signal } = {}) {
  let res;
  try {
    // credentials:'include' is required so the Catalyst session cookie is sent.
    // Without it the backend sees an anonymous request and answers 401.
    res = await fetch(`${BASE}${path}`, {
      signal,
      credentials: 'include',
      headers: { Accept: 'application/json', ...csrfHeader() }
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError('Could not reach the service. Check your connection.', 'NETWORK', null, 0);
  }
  return parse(res);
}

/**
 * Mutating request. `idempotencyKey` is passed through as a header so a retried
 * create or stage transition returns the first result instead of acting twice.
 */
async function send(method, path, payload, { idempotencyKey } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        ...csrfHeader()
      },
      body: JSON.stringify(payload || {})
    });
  } catch {
    throw new ApiError('Could not reach the service. Check your connection.', 'NETWORK', null, 0);
  }
  return parse(res);
}

/** Random key for a single user action, so retries of it collapse into one. */
export const newIdempotencyKey = () =>
  `idem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

export const api = {
  /* identity */
  me: (o) => get('/api/me', o),

  /* dashboard + status */
  dashboard: (o) => get('/api/dashboard', o),
  integrationStatus: (o) => get('/api/integration-status', o),
  diagnostics: (o) => get('/api/diag', o),

  /* students */
  students: (params, o) => get(`/api/students${qs(params)}`, o),
  student: (id, o) => get(`/api/students/${encodeURIComponent(id)}`, o),
  studentInvoices: (id, o) => get(`/api/students/${encodeURIComponent(id)}/invoices`, o),
  createStudent: (payload, opts) => send('POST', '/api/students', payload, opts),
  updateStudent: (id, payload) => send('PATCH', `/api/students/${encodeURIComponent(id)}`, payload),
  archiveStudent: (id, payload) => send('POST', `/api/students/${encodeURIComponent(id)}/archive`, payload),
  deleteStudent: (id) => send('DELETE', `/api/students/${encodeURIComponent(id)}`),

  /* applications */
  applications: (params, o) => get(`/api/applications${qs(params)}`, o),
  application: (id, o) => get(`/api/applications/${encodeURIComponent(id)}`, o),
  createApplication: (payload, opts) => send('POST', '/api/applications', payload, opts),
  updateApplication: (id, payload) => send('PATCH', `/api/applications/${encodeURIComponent(id)}`, payload),
  transitionApplication: (id, payload, opts) => send('POST', `/api/applications/${encodeURIComponent(id)}/transition`, payload, opts),
  archiveApplication: (id, payload) => send('POST', `/api/applications/${encodeURIComponent(id)}/archive`, payload),
  deleteApplication: (id) => send('DELETE', `/api/applications/${encodeURIComponent(id)}`),

  /* programmes */
  programmes: (params, o) => get(`/api/programmes${qs(params)}`, o),
  programme: (id, o) => get(`/api/programmes/${encodeURIComponent(id)}`, o),
  createProgramme: (payload, opts) => send('POST', '/api/programmes', payload, opts),
  updateProgramme: (id, payload) => send('PATCH', `/api/programmes/${encodeURIComponent(id)}`, payload),
  setProgrammeActive: (id, payload) => send('POST', `/api/programmes/${encodeURIComponent(id)}/active`, payload),
  deleteProgramme: (id) => send('DELETE', `/api/programmes/${encodeURIComponent(id)}`),

  /* intakes */
  intakes: (params, o) => get(`/api/intakes${qs(params)}`, o),
  intake: (id, o) => get(`/api/intakes/${encodeURIComponent(id)}`, o),
  createIntake: (payload, opts) => send('POST', '/api/intakes', payload, opts),
  updateIntake: (id, payload) => send('PATCH', `/api/intakes/${encodeURIComponent(id)}`, payload),
  setIntakeStatus: (id, payload) => send('POST', `/api/intakes/${encodeURIComponent(id)}/status`, payload),
  deleteIntake: (id) => send('DELETE', `/api/intakes/${encodeURIComponent(id)}`),

  /* enrolments */
  enrolments: (params, o) => get(`/api/enrolments${qs(params)}`, o),
  enrolment: (id, o) => get(`/api/enrolments/${encodeURIComponent(id)}`, o),
  createEnrolment: (payload, opts) => send('POST', '/api/enrolments', payload, opts),
  updateEnrolment: (id, payload) => send('PATCH', `/api/enrolments/${encodeURIComponent(id)}`, payload),
  archiveEnrolment: (id, payload) => send('POST', `/api/enrolments/${encodeURIComponent(id)}/archive`, payload),
  completeEnrolment: (id, payload) => send('POST', `/api/enrolments/${encodeURIComponent(id)}/complete`, payload),
  deleteEnrolment: (id) => send('DELETE', `/api/enrolments/${encodeURIComponent(id)}`),

  /* Zoho Learn — read only */
  courses: (params, o) => get(`/api/courses${qs(params)}`, o),
  course: (id, o) => get(`/api/courses/${encodeURIComponent(id)}`, o),

  /* Zoho Books — read only */
  invoices: (params, o) => get(`/api/invoices${qs(params)}`, o),
  invoice: (id, o) => get(`/api/invoices/${encodeURIComponent(id)}`, o),

  /* audit */
  activity: (params, o) => get(`/api/activity${qs(params)}`, o)
};
