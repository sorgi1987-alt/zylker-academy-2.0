'use strict';
/**
 * Central configuration. Every value is resolved from the Catalyst
 * environment so that nothing sensitive is ever compiled into the client.
 *
 * Zoho EU data centre is the default because the Zylker Academy CRM org, the
 * Books org and the Catalyst project (catalystserverless.eu) all live in the
 * EU DC.
 *
 * No OAuth client id, client secret, refresh token or access token appears in
 * this file or anywhere else in the repository. Upstream calls are authorised
 * by Catalyst Connections, resolved at request time by zoho.js.
 */
module.exports = {
  auth: {
    // Catalyst embedded authentication is enabled on this project's domain.
    // The mode is recorded so /api/integration-status can report what the
    // deployment expects, rather than the code guessing.
    mode: process.env.ZYLKER_AUTH_MODE || 'catalyst-embedded',
    embeddedLoginEnabled: process.env.ZYLKER_EMBEDDED_LOGIN !== 'false',
    // Catalyst project id, used to build the project-user endpoint path when
    // validating a forwarded session. Not a secret — it appears in the client's
    // own SDK configuration and in every gateway URL.
    projectId: process.env.CATALYST_PROJECT_ID || '11922000000014048',
    // Base URL for the platform API. Derived from the incoming request host by
    // default so it follows the environment (development / production) without
    // configuration; override only if the gateway is reached by another name.
    platformBaseUrl: process.env.CATALYST_PLATFORM_BASE_URL || null,
    sessionValidationTimeoutMs: Number(process.env.AUTH_VALIDATION_TIMEOUT_MS || 6000),
    // Set to 'true' only in a local harness. Never set in a deployed
    // environment: it makes every request unauthenticated-but-allowed, which
    // is precisely the posture this rewrite exists to remove.
    bypassForLocalTests: process.env.ZYLKER_AUTH_BYPASS === 'true'
  },
  crm: {
    baseUrl: process.env.ZOHO_CRM_BASE_URL || 'https://www.zohoapis.eu/crm/v8',
    // Web console origin, used only to build an "open in Zoho CRM" link. Not an
    // API endpoint and not a credential. Overridable because the console host
    // differs by data centre, and because an organisation-scoped URL may be
    // preferred once the org id is known.
    appUrl: process.env.ZOHO_CRM_APP_URL || 'https://crm.zoho.eu',
    connector: process.env.CRM_CONNECTOR || 'zylker_zoho',
    connection: process.env.CRM_CONNECTION || 'zylker_zoho'
  },
  // External LMS Connector. The dataset lives in the Catalyst Data Store —
  // there is no outbound connection to any LMS product, and no OAuth
  // credential, portal id or provider endpoint is involved. Provider names are
  // simulated source labels on Catalyst rows.
  lms: {
    coursesTable: process.env.LMS_COURSES_TABLE || 'lms_courses',
    enrolmentsTable: process.env.LMS_ENROLMENTS_TABLE || 'lms_enrolments',
    syncLogTable: process.env.LMS_SYNC_LOG_TABLE || 'lms_sync_log',
    label: 'External LMS Connector — Demonstration dataset'
  },
  books: {
    // EU Books API domain, matching the data centre of the rest of the estate.
    baseUrl: process.env.ZOHO_BOOKS_BASE_URL || 'https://www.zohoapis.eu/books/v3',
    // Web console origin, used only to build a "view in Zoho Books" link.
    appUrl: process.env.ZOHO_BOOKS_APP_URL || 'https://books.zoho.eu',
    // Organisation id for the Books ledger to read.
    //
    // The environment variable wins, so this can be repointed without a code
    // change. The fallback is the verified id of the "Zylker Academy" org
    // (EUR), read from `GET /api/v3/organizations` on 28 July 2026 — not a
    // guess, which matters because a wrong organization_id silently returns
    // another org's data or an empty list rather than failing.
    //
    // This is an identifier, not a credential: it appears in Zoho Books URLs
    // and grants nothing on its own. The actual OAuth credential lives in the
    // Catalyst Connection and never appears in this repository.
    organizationId: process.env.ZOHO_BOOKS_ORG_ID || '20117367964',
    connector: process.env.BOOKS_CONNECTOR || 'zylker_books',
    connection: process.env.BOOKS_CONNECTION || 'zylker_books',
    pageSize: Math.min(Number(process.env.ZOHO_BOOKS_PAGE_SIZE || 50), 200),
    // Ceiling on pages walked when aggregating totals for the dashboard, so a
    // large Books org cannot make the dashboard time out.
    maxAggregatePages: Number(process.env.ZOHO_BOOKS_MAX_PAGES || 10)
  },
  http: {
    timeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS || 12000)
  },
  // Resolved CRM API names. Renamed standard modules keep their original API
  // names — verified against live module metadata. Display labels come from the
  // module metadata at runtime, never from these values.
  modules: {
    students: 'Contacts',
    applications: 'Deals',
    programmes: 'Products',
    intakes: 'Intakes',
    enrolments: 'Enrolments'
  }
};
