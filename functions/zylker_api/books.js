'use strict';
/**
 * Zoho Books — READ ONLY.
 *
 * This phase reads invoices and customers. There is deliberately no create,
 * update, payment or delete path in this module: an accounting ledger is not
 * something an education portal should be able to alter as a side effect.
 *
 * Credentials
 * -----------
 * Authorisation comes from a Catalyst Connection (`cfg.books.connection`),
 * resolved per request by zoho.js. The access token is never handled, cached in
 * application code, logged, or returned. The organisation id comes from the
 * Catalyst environment (`ZOHO_BOOKS_ORG_ID`) and is never accepted from the
 * client — a caller must not be able to point this at another Books org.
 *
 * OAuth scopes required on the connection:
 *   ZohoBooks.invoices.READ
 *   ZohoBooks.contacts.READ
 *   ZohoBooks.settings.READ   (only for organisation lookup / verification)
 */
const cfg = require('./config');

/** Raised when Books is configured incompletely, so the UI can say what is missing. */
class BooksNotConfigured extends Error {
  constructor(message) { super(message); this.code = 'BOOKS_NOT_CONFIGURED'; }
}

const str = (v) => (v === null || v === undefined || v === '' ? null : String(v));
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

function assertConfigured() {
  if (!cfg.books.organizationId) {
    throw new BooksNotConfigured(
      'Zoho Books is not configured: set ZOHO_BOOKS_ORG_ID in the Catalyst environment.');
  }
}

/**
 * Issues a Books GET. `zoho` is injected rather than required, so these
 * functions can be exercised against a stub without a Catalyst session.
 */
async function booksGet(zoho, req, path, params = {}) {
  assertConfigured();
  const creds = await zoho.credentials(req, cfg.books.connection);
  const http = zoho.httpClient(cfg.books.baseUrl, creds);
  const res = await http.get(path, {
    params: { organization_id: cfg.books.organizationId, ...params }
  });
  const body = res.data || {};
  // Books signals application-level failure in the body with a non-zero code
  // even on HTTP 200, so a 200 alone is not evidence of success.
  if (body.code !== undefined && Number(body.code) !== 0) {
    const e = new Error(`Zoho Books returned code ${body.code}.`);
    e.__service = 'books';
    e.response = { status: 502 };
    throw e;
  }
  return body;
}

/* ------------------------------ normalisation ------------------------------ */

/** Books status values that mean "money is still owed". */
const OUTSTANDING_STATUSES = new Set(['sent', 'overdue', 'partially_paid', 'unpaid', 'viewed']);

const STATUS_LABEL = {
  draft: 'Draft', sent: 'Sent', viewed: 'Viewed', overdue: 'Overdue',
  paid: 'Paid', partially_paid: 'Partially paid', void: 'Void',
  unpaid: 'Unpaid', written_off: 'Written off'
};

/**
 * Derives a payment state from status and balance rather than trusting one
 * field: an invoice can be `sent` with a zero balance if it was written off.
 */
function paymentStatus(inv) {
  const status = String(inv.status || '').toLowerCase();
  const balance = Number(inv.balance || 0);
  const total = Number(inv.total || 0);
  if (status === 'void') return 'Void';
  if (status === 'draft') return 'Not issued';
  if (balance <= 0 && total > 0) return 'Paid';
  if (balance > 0 && balance < total) return 'Partially paid';
  if (status === 'overdue') return 'Overdue';
  return 'Outstanding';
}

function invoiceSummary(inv) {
  const status = String(inv.status || '').toLowerCase();
  return {
    id: str(inv.invoice_id),
    invoiceNumber: str(inv.invoice_number),
    referenceNumber: str(inv.reference_number),
    customerId: str(inv.customer_id),
    customerName: str(inv.customer_name),
    email: str(inv.email),
    invoiceDate: str(inv.date),
    dueDate: str(inv.due_date),
    status,
    statusLabel: STATUS_LABEL[status] || (status ? status.replace(/_/g, ' ') : null),
    paymentStatus: paymentStatus(inv),
    outstanding: OUTSTANDING_STATUSES.has(status) && Number(inv.balance || 0) > 0,
    overdue: status === 'overdue',
    currency: str(inv.currency_code),
    currencySymbol: str(inv.currency_symbol),
    subTotal: num(inv.sub_total),
    tax: num(inv.tax_total),
    total: num(inv.total),
    balance: num(inv.balance),
    // Deep link into the Books console. Built from configuration, not from a
    // URL supplied by the API, so it cannot be used to redirect a user offsite.
    booksUrl: inv.invoice_id
      ? `${String(cfg.books.appUrl).replace(/\/+$/, '')}/app/${cfg.books.organizationId}#/invoices/${inv.invoice_id}`
      : null,
    source: 'books',
    readOnly: true
  };
}

function invoiceDetail(inv) {
  return {
    ...invoiceSummary(inv),
    lineItems: (inv.line_items || []).map((li) => ({
      id: str(li.line_item_id),
      name: str(li.name),
      description: str(li.description),
      quantity: num(li.quantity),
      unit: str(li.unit),
      rate: num(li.rate),
      discount: num(li.discount_amount),
      taxName: str(li.tax_name),
      taxPercentage: num(li.tax_percentage),
      total: num(li.item_total)
    })),
    payments: (inv.payments || []).map((p) => ({
      id: str(p.payment_id),
      date: str(p.date),
      amount: num(p.amount),
      mode: str(p.payment_mode),
      reference: str(p.reference_number)
    })),
    // Present only when the connection carries the scope; absent is not an error.
    paymentsMade: num(inv.payment_made),
    creditsApplied: num(inv.credits_applied),
    notes: str(inv.notes),
    terms: str(inv.terms),
    billingAddress: inv.billing_address || null
  };
}

function customerSummary(c) {
  return {
    id: str(c.contact_id),
    name: str(c.contact_name),
    companyName: str(c.company_name),
    email: str(c.email),
    status: str(c.status),
    outstanding: num(c.outstanding_receivable_amount),
    currency: str(c.currency_code),
    source: 'books'
  };
}

/* --------------------------------- queries --------------------------------- */

/**
 * Lists invoices with server-side pagination.
 *
 * Books paginates with `page`/`per_page` and reports `page_context.has_more_page`.
 * Total count is NOT returned by Books, so the client is given `hasMore` rather
 * than a fabricated total — showing "page 2 of 7" would be a guess.
 */
async function listInvoices(zoho, req, {
  page = 1, perPage = cfg.books.pageSize, status, customerId, search, dateStart, dateEnd
} = {}) {
  const params = {
    page: Math.max(1, Number(page) || 1),
    per_page: Math.min(Math.max(1, Number(perPage) || cfg.books.pageSize), 200),
    sort_column: 'date',
    sort_order: 'D'
  };
  // `status` is passed through a whitelist: it reaches a query string on an
  // accounting API and must not be caller-controlled free text.
  if (status && STATUS_LABEL[String(status).toLowerCase()]) params.status = String(status).toLowerCase();
  if (customerId) params.customer_id = String(customerId).replace(/[^0-9]/g, '');
  if (search) params.search_text = String(search).slice(0, 100);
  if (dateStart) params.date_start = String(dateStart).slice(0, 10);
  if (dateEnd) params.date_end = String(dateEnd).slice(0, 10);

  const body = await booksGet(zoho, req, '/invoices', params);
  const ctx = body.page_context || {};
  return {
    invoices: (body.invoices || []).map(invoiceSummary),
    page: Number(ctx.page || params.page),
    perPage: Number(ctx.per_page || params.per_page),
    hasMore: ctx.has_more_page === true,
    appliedFilter: str(ctx.applied_filter)
  };
}

async function getInvoice(zoho, req, invoiceId) {
  const id = String(invoiceId).replace(/[^0-9]/g, '');
  if (!id) return null;
  const body = await booksGet(zoho, req, `/invoices/${id}`);
  return body.invoice ? invoiceDetail(body.invoice) : null;
}

/** Finds Books customers whose email matches exactly (normalised, lower-cased). */
async function findCustomersByEmail(zoho, req, email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return [];
  const body = await booksGet(zoho, req, '/contacts', { email: e, per_page: 10 });
  // Books treats `email` as a filter, not a strict equality test, so the result
  // is re-checked here. An approximate match must not become a money link.
  return (body.contacts || [])
    .map(customerSummary)
    .filter((c) => c.email && c.email.trim().toLowerCase() === e);
}

/**
 * Aggregate figures for the dashboard. Walks pages up to a configured ceiling
 * so a large ledger cannot stall the dashboard, and reports whether the walk
 * was truncated rather than presenting a partial total as complete.
 */
/**
 * Ageing bucket for an outstanding invoice, by days past its due date.
 * An invoice with no due date is reported as "Not due" rather than assumed
 * current — Books does not require a due date and inventing one would move
 * money between buckets.
 */
const AGEING_BUCKETS = ['Not yet due', '1–30 days', '31–60 days', '61–90 days', 'Over 90 days'];
function ageingBucket(daysPastDue) {
  if (daysPastDue === null || daysPastDue <= 0) return AGEING_BUCKETS[0];
  if (daysPastDue <= 30) return AGEING_BUCKETS[1];
  if (daysPastDue <= 60) return AGEING_BUCKETS[2];
  if (daysPastDue <= 90) return AGEING_BUCKETS[3];
  return AGEING_BUCKETS[4];
}

async function invoiceTotals(zoho, req, { now = Date.now() } = {}) {
  let page = 1;
  let invoicedTotal = 0;
  let paidTotal = 0;
  let outstandingCount = 0;
  let overdueCount = 0;
  let outstandingBalance = 0;
  let overdueBalance = 0;
  let truncated = false;
  let currency = null;
  let oldestOverdue = null;
  const ageing = AGEING_BUCKETS.reduce((acc, b) => { acc[b] = 0; return acc; }, {});

  for (; page <= cfg.books.maxAggregatePages; page += 1) {
    const r = await listInvoices(zoho, req, { page, perPage: 200 });
    r.invoices.forEach((inv) => {
      if (!currency && inv.currency) currency = inv.currency;
      invoicedTotal += Number(inv.total || 0);
      paidTotal += Number(inv.total || 0) - Number(inv.balance || 0);

      if (inv.outstanding) {
        outstandingCount += 1;
        outstandingBalance += Number(inv.balance || 0);

        const due = inv.dueDate ? Date.parse(inv.dueDate) : NaN;
        const daysPastDue = Number.isNaN(due) ? null : Math.floor((now - due) / 86400000);
        ageing[ageingBucket(daysPastDue)] += Number(inv.balance || 0);
      }

      if (inv.overdue) {
        overdueCount += 1;
        overdueBalance += Number(inv.balance || 0);
        const due = inv.dueDate ? Date.parse(inv.dueDate) : NaN;
        if (!Number.isNaN(due) && (!oldestOverdue || due < oldestOverdue._due)) {
          oldestOverdue = {
            _due: due,
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            customerName: inv.customerName,
            dueDate: inv.dueDate,
            balance: inv.balance,
            currency: inv.currency,
            daysOverdue: Math.floor((now - due) / 86400000)
          };
        }
      }
    });
    if (!r.hasMore) break;
    if (page === cfg.books.maxAggregatePages) truncated = true;
  }

  // Rounded to cents; floating-point addition over many invoices otherwise
  // produces a long tail that looks like a data error in the UI.
  const cents = (v) => Math.round(v * 100) / 100;
  Object.keys(ageing).forEach((k) => { ageing[k] = cents(ageing[k]); });
  if (oldestOverdue) delete oldestOverdue._due;

  return {
    outstandingCount,
    overdueCount,
    outstandingBalance: cents(outstandingBalance),
    overdueBalance: cents(overdueBalance),
    invoicedTotal: cents(invoicedTotal),
    paidTotal: cents(paidTotal),
    ageing,
    ageingBuckets: AGEING_BUCKETS,
    oldestOverdue,
    currency,
    truncated
  };
}

/**
 * Connection health. Makes the smallest possible authorised call and reports a
 * status; never throws, so a Books outage cannot break a page that also shows
 * CRM data.
 */
async function health(zoho, req) {
  if (!cfg.books.organizationId) {
    return {
      status: 'not_configured',
      label: 'Not configured',
      detail: 'ZOHO_BOOKS_ORG_ID is not set in the Catalyst environment.',
      organizationId: null
    };
  }
  try {
    await booksGet(zoho, req, '/invoices', { page: 1, per_page: 1 });
    return {
      status: 'connected',
      label: 'Connected',
      detail: null,
      organizationId: cfg.books.organizationId
    };
  } catch (err) {
    const s = zoho.safeError(err, 'books');
    return {
      status: 'unavailable',
      label: s.status === 401 || s.status === 403 ? 'Authorisation error' : 'Unavailable',
      detail: s.detail,
      organizationId: cfg.books.organizationId
    };
  }
}

module.exports = {
  BooksNotConfigured,
  listInvoices, getInvoice, findCustomersByEmail, invoiceTotals, health,
  invoiceSummary, invoiceDetail, customerSummary,
  STATUS_LABEL, OUTSTANDING_STATUSES, AGEING_BUCKETS,
  _internals: { ageingBucket }
};
