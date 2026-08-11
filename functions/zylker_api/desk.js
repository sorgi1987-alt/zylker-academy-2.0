'use strict';
/**
 * Zoho Desk — READ ONLY.
 *
 * Tickets and contacts only. There is no create, reply, close or delete path
 * here: a support queue is not something an education portal should be able
 * to alter as a side effect of showing a student's record.
 *
 * Credentials
 * -----------
 * Authorisation comes from a Catalyst Connection (`cfg.desk.connection`),
 * resolved per request by zoho.js. The access token is never handled, cached
 * in application code, logged, or returned. Desk additionally requires an
 * `orgId` HEADER on every call — that id comes from the Catalyst environment
 * (`ZOHO_DESK_ORG_ID`) and is never accepted from the client, so a caller
 * cannot point this at another Desk organisation's tickets.
 *
 * OAuth scopes required on the connection:
 *   Desk.tickets.READ
 *   Desk.contacts.READ
 *   Desk.basic.READ   (baseline scope Desk requires for most API calls)
 */
const cfg = require('./config');

/** Raised when Desk is configured incompletely, so the UI can say what is missing. */
class DeskNotConfigured extends Error {
  constructor(message) { super(message); this.code = 'DESK_NOT_CONFIGURED'; }
}

const str = (v) => (v === null || v === undefined || v === '' ? null : String(v));
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

function assertConfigured() {
  if (!cfg.desk.organizationId) {
    throw new DeskNotConfigured(
      'Zoho Desk is not configured: set ZOHO_DESK_ORG_ID in the Catalyst environment.');
  }
}

/**
 * Issues a Desk GET. `zoho` is injected rather than required, so these
 * functions can be exercised against a stub without a Catalyst session.
 *
 * `orgId` is merged in as a header here rather than in zoho.js: it is
 * application configuration, not something the Catalyst connection provides,
 * and zoho.js stays generic across services by not knowing about it.
 */
async function deskGet(zoho, req, path, params = {}) {
  assertConfigured();
  const creds = await zoho.credentials(req, cfg.desk.connection);
  const http = zoho.httpClient(cfg.desk.baseUrl, {
    headers: { ...creds.headers, orgId: cfg.desk.organizationId },
    params: creds.params
  });
  const res = await http.get(path, { params });
  return res.data || {};
}

/* ------------------------------ normalisation ------------------------------ */

/**
 * Desk's `statusType` is a small, platform-fixed enum (Open / Closed / On
 * Hold) that does not vary by organisation. `status` itself is a free-text
 * label an org can rename or add to, so it is shown but never filtered on —
 * filtering on it would mean guessing this org's exact status names.
 */
const STATUS_TYPES = ['Open', 'Closed', 'On Hold'];

/**
 * Whether a ticket is overdue is computed, not trusted from a single field:
 * a closed ticket past its old due date is not overdue, and a ticket with no
 * due date at all cannot be either. Same philosophy as paymentStatus() in
 * books.js — derive from more than one field rather than trust a flag Desk
 * may or may not return consistently across API versions.
 */
function isOverdue(t, now) {
  if (String(t.statusType || '') === 'Closed') return false;
  if (!t.dueDate) return false;
  const due = Date.parse(t.dueDate);
  return !Number.isNaN(due) && due < now;
}

function ticketSummary(t, { now = Date.now() } = {}) {
  return {
    id: str(t.id),
    ticketNumber: str(t.ticketNumber),
    subject: str(t.subject),
    status: str(t.status),
    statusType: str(t.statusType),
    priority: str(t.priority),
    category: str(t.category),
    departmentId: str(t.departmentId),
    contactId: str(t.contactId),
    email: str(t.email),
    createdTime: str(t.createdTime),
    modifiedTime: str(t.modifiedTime),
    dueDate: str(t.dueDate),
    closedTime: str(t.closedTime),
    threadCount: num(t.threadCount),
    // Passed through as Desk returns it. Unlike Books' self-built invoice
    // link, Desk's API already returns a working console URL and this
    // application has no way to reconstruct one correctly without knowing
    // the support portal's name.
    webUrl: str(t.webUrl),
    overdue: isOverdue(t, now),
    source: 'desk',
    readOnly: true
  };
}

function ticketDetail(t, opts) {
  return {
    ...ticketSummary(t, opts),
    description: str(t.description)
  };
}

function contactSummary(c) {
  return {
    id: str(c.id),
    name: [c.firstName, c.lastName].filter(Boolean).join(' ') || str(c.email),
    email: str(c.email),
    phone: str(c.phone),
    source: 'desk'
  };
}

/* --------------------------------- queries --------------------------------- */

/**
 * Lists tickets with offset pagination.
 *
 * Desk paginates with `from` (0-based offset) and `limit` (max 100), and
 * reports neither a total count nor a "more pages" flag. `hasMore` is
 * therefore INFERRED from a full page having been returned, not a fact Desk
 * states — the same honesty standard Books' `hasMore` follows, just derived
 * differently because the two APIs report pagination differently.
 */
async function listTickets(zoho, req, {
  page = 1, perPage = cfg.desk.pageSize, statusType, contactId, search
} = {}) {
  const limit = Math.min(Math.max(1, Number(perPage) || cfg.desk.pageSize), 100);
  const from = Math.max(0, (Math.max(1, Number(page) || 1) - 1) * limit);
  const params = { from, limit, sortBy: '-createdTime' };

  // Whitelisted against the fixed enum: never pass caller-controlled free
  // text into a filter Desk applies to a live ticket queue.
  if (statusType && STATUS_TYPES.includes(statusType)) params.statusType = statusType;
  if (contactId) params.contactId = String(contactId).replace(/[^A-Za-z0-9]/g, '');
  if (search) params.subject = String(search).slice(0, 100);

  const body = await deskGet(zoho, req, '/tickets', params);
  const rows = body.data || [];
  return {
    tickets: rows.map((t) => ticketSummary(t)),
    page: Math.max(1, Number(page) || 1),
    perPage: limit,
    hasMore: rows.length === limit
  };
}

async function getTicket(zoho, req, ticketId) {
  const id = String(ticketId || '').replace(/[^A-Za-z0-9]/g, '');
  if (!id) return null;
  try {
    const body = await deskGet(zoho, req, `/tickets/${id}`);
    return body && body.id ? ticketDetail(body) : null;
  } catch (err) {
    if (err && err.response && err.response.status === 404) return null;
    throw err;
  }
}

/** Finds Desk contacts whose email matches exactly (normalised, lower-cased). */
async function findContactsByEmail(zoho, req, email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return [];
  const body = await deskGet(zoho, req, '/contacts/search', { email: e, limit: 10 });
  // Desk treats `email` as a filter, not a strict equality test, so the
  // result is re-checked here — an approximate match must not become a
  // support-history link shown against the wrong person.
  return (body.data || [])
    .map(contactSummary)
    .filter((c) => c.email && c.email.trim().toLowerCase() === e);
}

/**
 * Aggregate figures for the dashboard and attention queue. Walks pages up to
 * a configured ceiling so a large ticket queue cannot stall the dashboard,
 * and reports whether the walk was truncated rather than presenting a
 * partial total as complete.
 */
async function ticketTotals(zoho, req, { now = Date.now() } = {}) {
  let page = 1;
  let openCount = 0;
  let overdueCount = 0;
  let truncated = false;
  let oldestOverdue = null;
  const byStatus = {};

  for (; page <= cfg.desk.maxAggregatePages; page += 1) {
    const r = await listTickets(zoho, req, { page, perPage: 100 });
    r.tickets.forEach((t) => {
      const label = t.status || 'Unspecified';
      byStatus[label] = (byStatus[label] || 0) + 1;

      if (t.statusType !== 'Closed') openCount += 1;

      if (t.overdue) {
        overdueCount += 1;
        const due = t.dueDate ? Date.parse(t.dueDate) : NaN;
        if (!Number.isNaN(due) && (!oldestOverdue || due < oldestOverdue._due)) {
          oldestOverdue = {
            _due: due,
            id: t.id,
            ticketNumber: t.ticketNumber,
            subject: t.subject,
            dueDate: t.dueDate,
            daysOverdue: Math.floor((now - due) / 86400000)
          };
        }
      }
    });
    if (!r.hasMore) break;
    if (page === cfg.desk.maxAggregatePages) truncated = true;
  }

  if (oldestOverdue) delete oldestOverdue._due;

  return { openCount, overdueCount, byStatus, oldestOverdue, truncated };
}

/**
 * Connection health. Makes the smallest possible authorised call and reports
 * a status; never throws, so a Desk outage cannot break a page that also
 * shows CRM data.
 */
async function health(zoho, req) {
  if (!cfg.desk.organizationId) {
    return {
      status: 'not_configured',
      label: 'Not configured',
      detail: 'ZOHO_DESK_ORG_ID is not set in the Catalyst environment.',
      organizationId: null
    };
  }
  try {
    await deskGet(zoho, req, '/tickets', { from: 0, limit: 1 });
    return {
      status: 'connected',
      label: 'Connected',
      detail: null,
      organizationId: cfg.desk.organizationId
    };
  } catch (err) {
    const s = zoho.safeError(err, 'desk');
    return {
      status: 'unavailable',
      label: s.status === 401 || s.status === 403 ? 'Authorisation error' : 'Unavailable',
      detail: s.detail,
      organizationId: cfg.desk.organizationId
    };
  }
}

module.exports = {
  DeskNotConfigured,
  listTickets, getTicket, findContactsByEmail, ticketTotals, health,
  ticketSummary, ticketDetail, contactSummary,
  STATUS_TYPES,
  _internals: { isOverdue }
};
