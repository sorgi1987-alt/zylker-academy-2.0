'use strict';
const axios = require('axios');
const catalyst = require('zcatalyst-sdk-node');
const cfg = require('./config');

/**
 * Resolves credentials for a Catalyst Connection created in the console.
 * The SDK returns ready-to-apply { headers, parameters } - the access token
 * itself is never handled, logged or returned by this module.
 */
async function credentials(req, connectionName) {
  const app = catalyst.initialize(req);
  const creds = await app.connections().getConnectionCredentials(connectionName);
  return {
    headers: (creds && creds.headers) || {},
    params: (creds && creds.parameters) || {}
  };
}

function client(baseURL, creds) {
  return axios.create({
    baseURL,
    timeout: cfg.http.timeoutMs,
    headers: { Accept: 'application/json', ...creds.headers },
    params: creds.params
  });
}

/** Strips anything token-shaped before an error message can be returned. */
function redact(text) {
  return String(text || '')
    .replace(/[A-Za-z0-9._-]{25,}/g, '[redacted]')
    .slice(0, 200);
}

/**
 * Pulls the machine-readable part of a Zoho validation failure out of an error
 * body: the error CODE and the API NAME of the offending field.
 *
 * Both are metadata, not data — `INVALID_DATA` on `Closing_Date` says which
 * field was rejected without ever repeating the value that was rejected. That
 * distinction is what makes it safe to show the person using the application.
 *
 * Zoho returns either a per-record envelope, `{data:[{code, details, ...}]}`,
 * or a bare `{code, details, ...}`, depending on whether the request failed as
 * a whole or a single record within it did.
 */
function crmErrorInfo(body) {
  const row = body && Array.isArray(body.data) ? body.data[0] : body;
  if (!row || !row.code) return null;
  const field = row.details && (row.details.api_name || row.details.parent_api_name);
  return {
    code: String(row.code).slice(0, 60),
    field: field ? String(field).slice(0, 60) : null,
    expected: row.details && row.details.expected_data_type
      ? String(row.details.expected_data_type).slice(0, 30)
      : null
  };
}

/** Turns a Zoho error code into a sentence a person can act on. */
const CRM_CODE_MESSAGE = {
  INVALID_DATA: 'rejected the value in',
  MANDATORY_NOT_FOUND: 'requires a value in',
  DUPLICATE_DATA: 'already has a record with the same',
  INVALID_URL_PATTERN: 'did not recognise the request path',
  NOT_APPROVED: 'has not approved this record'
};

function safeError(err, service) {
  const status = err && err.response ? err.response.status : null;
  const body = err && err.response ? err.response.data : null;
  let detail;

  if (err && err.code === 'ECONNABORTED') detail = 'Upstream request timed out.';
  else if (status === 401 || status === 403) detail = 'Not authorised for this service. Check the Catalyst connection scopes.';
  else if (status === 429) detail = 'Rate limited by the upstream service.';
  else if (status && status >= 500) detail = 'Upstream service error.';
  else if (status) {
    // A 400 from CRM almost always names the field it objected to. Reporting
    // "Upstream returned HTTP 400" instead of that is throwing away the only
    // useful part of the response.
    const info = crmErrorInfo(body);
    if (info) {
      const verb = CRM_CODE_MESSAGE[info.code];
      detail = info.field && verb
        ? `Zoho ${verb} "${info.field}"${info.expected ? ` (expected a ${info.expected})` : ''}.`
        : `Zoho rejected the request: ${info.code}${info.field ? ` on "${info.field}"` : ''}.`;
      return { service, status: status || 502, detail, code: info.code, field: info.field };
    }
    detail = `Upstream returned HTTP ${status}.`;
  } else {
    detail = `Request failed before a response was received: ${redact(err && err.message)}`;
  }
  return { service, status: status || 502, detail };
}

/* ------------------------------- CRM ---------------------------------- */

async function crmQuery(req, selectQuery) {
  const creds = await credentials(req, cfg.crm.connection);
  const http = client(cfg.crm.baseUrl, creds);
  const res = await http.post('/coql', { select_query: selectQuery });
  if (!res.data || !res.data.data) return []; // 204 = no matching rows
  return res.data.data;
}

async function crmGet(req, path, params) {
  const creds = await credentials(req, cfg.crm.connection);
  const http = client(cfg.crm.baseUrl, creds);
  const res = await http.get(path, { params });
  return res.data;
}

/* --------------------------- CRM writes ------------------------------- */
/**
 * All writes go through the same Catalyst Connection as the reads. The
 * connection must carry ZohoCRM.modules.<module>.{CREATE,UPDATE,DELETE} scopes;
 * without them CRM returns 401/403, which safeError() reports without leaking a
 * token. Every helper returns Zoho's per-record result object so the caller can
 * read the new/updated id and re-read the record to confirm the write.
 */

/**
 * Normalises a field list for the REST `fields` query parameter.
 *
 * COQL is SQL-like and tolerates `select id, First_Name from ...`. The record
 * API is not: `fields` must be a bare comma-separated list, and a leading space
 * makes each entry an unrecognised field name. The same constant is used for
 * both, so the spaces have to come out here.
 *
 * The symptom this caused was subtle and worth remembering: reads still
 * returned 200 with an `id`, so nothing looked broken — but `Modified_Time`
 * came back undefined, and every optimistic-concurrency check therefore saw a
 * mismatch and answered 409 "this record changed since you loaded it". Editing
 * any record was impossible while creating one worked fine.
 */
const fieldList = (fields) => String(fields || '')
  .split(',')
  .map((f) => f.trim())
  .filter(Boolean)
  .join(',');

/** Reads a single record by id. Returns the raw record object, or null on 204. */
async function crmGetRecord(req, module_, id, fields) {
  const creds = await credentials(req, cfg.crm.connection);
  const http = client(cfg.crm.baseUrl, creds);
  const list = fieldList(fields);
  const params = list ? { fields: list } : undefined;
  const res = await http.get(`/${module_}/${encodeURIComponent(id)}`, { params });
  const rec = res.data && Array.isArray(res.data.data) ? res.data.data[0] : null;
  return rec || null;
}

/** Unwraps Zoho's { data:[{code,status,details,message}] } write envelope. */
function firstWriteResult(body) {
  const row = body && Array.isArray(body.data) ? body.data[0] : null;
  if (!row) {
    const e = new Error('CRM returned no result row.');
    e.__service = 'crm';
    throw e;
  }
  if (row.status && row.status !== 'success') {
    // Surface Zoho's machine code (e.g. MANDATORY_NOT_FOUND) but never field values.
    const e = new Error(`CRM rejected the write: ${row.code || 'UNKNOWN'}`);
    e.__service = 'crm';
    e.__crmCode = row.code || null;
    e.response = { status: row.code === 'DUPLICATE_DATA' ? 409 : 422 };
    throw e;
  }
  return row.details || {};
}

async function crmCreate(req, module_, record) {
  const creds = await credentials(req, cfg.crm.connection);
  const http = client(cfg.crm.baseUrl, creds);
  const res = await http.post(`/${module_}`, { data: [record] });
  return firstWriteResult(res.data); // { id, Created_Time, Modified_Time, ... }
}

async function crmUpdate(req, module_, id, record) {
  const creds = await credentials(req, cfg.crm.connection);
  const http = client(cfg.crm.baseUrl, creds);
  const res = await http.put(`/${module_}/${encodeURIComponent(id)}`, { data: [record] });
  return firstWriteResult(res.data);
}

async function crmDelete(req, module_, id) {
  const creds = await credentials(req, cfg.crm.connection);
  const http = client(cfg.crm.baseUrl, creds);
  const res = await http.delete(`/${module_}/${encodeURIComponent(id)}`);
  return firstWriteResult(res.data);
}

/**
 * Connection reachability probe. Returns booleans and redacted messages only -
 * never a token, client id or secret.
 */
async function probe(req) {
  const out = {};
  for (const [label, name] of [['crm', cfg.crm.connection], ['books', cfg.books.connection]]) {
    try {
      const c = await credentials(req, name);
      out[label] = {
        connectionName: name,
        resolved: true,
        headerKeys: Object.keys(c.headers),
        hasAuthorizationHeader: Object.keys(c.headers).some((k) => k.toLowerCase() === 'authorization')
      };
    } catch (err) {
      out[label] = { connectionName: name, resolved: false, reason: redact(err && err.message) };
    }
  }
  return out;
}

/* --------------------------- CRM module metadata ------------------------ */

/**
 * Fetches module metadata so the UI can show the org's own labels (the CRM has
 * been renamed for education, e.g. Deals is labelled "Applications"). API names
 * are still used for every request; labels are for display only.
 *
 * Cached per instance for the lifetime of the container: module labels change
 * rarely and this is on the dashboard path.
 */
let moduleMetaCache = null;

async function crmModuleLabels(req) {
  if (moduleMetaCache) return moduleMetaCache;
  const body = await crmGet(req, '/settings/modules');
  const wanted = new Set(Object.values(cfg.modules));
  const out = {};
  ((body && body.modules) || []).forEach((m) => {
    if (wanted.has(m.api_name)) {
      out[m.api_name] = {
        apiName: m.api_name,
        singular: m.singular_label || m.module_name || m.api_name,
        plural: m.plural_label || m.module_name || m.api_name
      };
    }
  });
  moduleMetaCache = out;
  return out;
}

/**
 * Reads the picklist values actually configured on a field, so the UI offers
 * the org's real options rather than a hard-coded guess. Returns [] when the
 * field is not a picklist or metadata is unavailable.
 */
async function crmPicklist(req, module_, fieldApiName) {
  try {
    const body = await crmGet(req, '/settings/fields', { module: module_ });
    const field = ((body && body.fields) || []).find((f) => f.api_name === fieldApiName);
    if (!field || !Array.isArray(field.pick_list_values)) return [];
    return field.pick_list_values
      .filter((v) => v.type !== 'inactive')
      .map((v) => v.display_value || v.actual_value)
      .filter(Boolean);
  } catch {
    return [];
  }
}

module.exports = {
  crmGet, crmQuery, crmGetRecord, crmCreate, crmUpdate, crmDelete,
  crmModuleLabels, crmPicklist, fieldList,
  credentials, probe, safeError, crmErrorInfo, redact,
  // Exposed so books.js can build its own authorised client without
  // duplicating credential handling.
  httpClient: client
};
