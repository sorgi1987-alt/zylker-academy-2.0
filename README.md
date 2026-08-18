# Zylker Academy — Education Management Portal

An authenticated staff portal for managing students, applications, programmes,
intakes and enrolments, backed by Zoho CRM, with an external LMS connector held
in the Catalyst Data Store and read-only views of Zoho Books invoices and Zoho
Desk support tickets.

**Catalyst project:** `Zylker-Academy-Signals` · id `11922000000133164` · org `20117369913` · EU DC
**Project domain:** `https://zylker-academy-signals-20117369913.development.catalystserverless.eu`

> This is a duplicate of the original `Zylker-Academy` project (id `11922000000014048`), created for the
> read-model/cache/event-sync PoC described in `kickoff-prompt.md`: CRM reads are served from a Datastore
> projection kept in sync by four paths (bootstrap, write-through, Signals events, reconciliation Cron)
> instead of hitting Zoho CRM live on every request. See **[ARCHITECTURE.md](ARCHITECTURE.md)** for what
> was built, why, and what's still deferred.

Deployment steps, environment variables, the Books connection setup and the
verification checklist are in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

---

## Architecture

```
Browser (React SPA)
  │  Catalyst session cookie only — no OAuth token ever reaches the browser
  ▼
Catalyst Advanced I/O function `zylker_api`
  │  requireAuth ──► requirePermission ──► handler
  │  OAuth resolved per request from Catalyst Connections
  ├──►  Students/Applications/Programmes/Intakes/Enrolments reads:
  │       Datastore projection (crm_students, crm_applications, …) + cache.js,
  │       NOT a live Zoho CRM call — see ARCHITECTURE.md
  ├──►  Zoho CRM    www.zohoapis.eu/crm/v8      writes always live;
  │                                             reads live only for the
  │                                             sync paths that keep the
  │                                             projection current
  ├──►  Catalyst Data Store  lms_courses, lms_enrolments, lms_sync_log
  ├──►  Zoho Books  www.zohoapis.eu/books/v3    read only, always live
  └──►  Zoho Desk   desk.zoho.eu/api/v1         read only, always live

Keeping the CRM projection current (no browser involvement in any of these):
  Zoho CRM ──Signals event──►  POST /api/events/crm-signal   (near-real-time)
  Zoho CRM ◄──Cron (15 min/hourly/daily)──  POST /api/admin/reconcile-sync  (safety net)
  every in-app CRM write ──► write-through updates the projection in the same request
```

The browser calls only `/server/zylker_api/api/*` on its own origin. Every Zoho
call happens inside the function. No OAuth client id, client secret, refresh
token or access token exists in the client bundle. Books, Desk and the LMS
connector are unchanged by the read-model PoC — only the 5 CRM-backed
entities moved off the live-read path (see `ARCHITECTURE.md` §1 for the exact
scope boundary).

## Authentication and authorization

Authentication is Zoho Catalyst embedded auth. The Catalyst Web SDK renders the
sign-in form, so this application never renders a password field, holds a
password in state, or transports one.

The security boundary is server-side and single-purpose:

| File | Responsibility |
|---|---|
| `functions/zylker_api/identity.js` | Resolves the Catalyst user, **only** from an SDK-validated credential. Four strategies, tried in order. No fallback that reads request headers. |
| `functions/zylker_api/permissions.js` | Role → permission matrix. The only place a role is decided or a permission granted. |
| `functions/zylker_api/auth.js` | `requireAuth`, `requirePermission`, rate limiting, idempotency, audit. |

`index.js` registers every route through one of two arrays, so "is this endpoint
protected?" is answerable by reading one file. React's permission checks decide
which buttons to render; they are not a control — the function re-derives
identity and role on every request regardless.

> **The platform `x-zc-user-*` headers are not trusted and must never be.** The
> Catalyst gateway on this project does not strip client-supplied copies of them
> (see `AUTH_SUPPORT_REPORT.md`), so any authorization derived from them would be
> bypassable from a browser.

### Roles

Catalyst itself offers only "App Administrator" and "App User", so the five
business roles are resolved from `ZYLKER_ROLE_MAP` first, then the Catalyst role,
then `ZYLKER_DEFAULT_ROLE`, then `viewer`.

| Role | Reads | Writes |
|---|---|---|
| `administrator` | everything | everything, including capacity overrides |
| `admissions` | everything + invoices | students, applications, stage transitions, enrolments |
| `academic` | everything | programmes, intakes, enrolments |
| `finance` | everything + invoices | nothing |
| `viewer` | everything except invoices | nothing |

## CRM mapping

Conceptual entities map to renamed standard modules. Labels come from module
metadata at runtime; API names are used for every request.

| Entity | CRM module (API name) | Reference field |
|---|---|---|
| Students | `Contacts` | `External_Student_Ref` |
| Applications | `Deals` | `External_Application_Ref` |
| Programmes | `Products` | `Product_Code` (Products has no external-ref field) |
| Intakes | `Intakes` (custom) | `External_Intake_Reference` |
| Enrolments | `Enrolments` (custom) | `External_Enrolment_Ref` |

Stage and status picklist values are the org's real ones, resolved from live
field metadata — none are invented.

## Correctness guarantees

Enforced server-side, in `writes.js`, and covered by the offline test suite:

- **Field allow-listing.** `req.body` is never spread into a CRM payload.
- **Read-after-write.** Every mutation re-reads the record and returns that copy.
- **Optimistic concurrency** via `Modified_Time` → `409` on a stale update.
- **Stage transitions** validated against a table, not the UI.
- **Duplicate students** prevented on normalised email.
- **Idempotent enrolment** — a repeated Enrolled transition finds before it creates.
- **Relationship integrity** — an intake must belong to its programme; a record with dependants is not deleted.
- **Capacity** enforced per intake, overridable only by a principal holding `intake:capacity-override`.
- **Date order** validated on the effective range, not just the submitted fields.

## Student-to-Books matching

In priority order, and never by name:

1. A Books customer id stored on the CRM record (`Zoho_Books_Customer_ID`, `Books_Customer_ID` or `Books_Contact_ID`).
2. A verified CRM-to-Books integration identifier.
3. An exact, normalised email match.
4. No match.

If more than one Books customer shares the email, the link is reported as
**ambiguous** and no invoices are shown. An unresolved link is recoverable;
showing the wrong person's finances is not.

None of the fields in step 1 currently exist on `Contacts` in this org (verified
against live metadata), so matching falls to email today. The code reads the
stored id first and will start using it the day such a field is added, with no
code change.

## Running the tests

```bash
cd functions/zylker_api && npm test      # 148 offline tests, no Catalyst session needed
cd client && npm run build               # production build
```

The offline suite runs the real express app and the real write handlers against
a stubbed Zoho layer. It proves the logic is correct. It does **not** prove that
Catalyst resolves an identity or that the connections carry the right scopes —
only a deployment can do that. See DEPLOYMENT.md §4.

## Layout

```
functions/zylker_api/
  index.js            route table, reads, response shaping
  identity.js         Catalyst identity resolution (SDK-validated only)
  permissions.js      role → permission matrix
  auth.js             requireAuth / requirePermission, rate limit, idempotency, audit
  writes.js           CRM write handlers, their invariants, and write-through sync
  books.js            Zoho Books, read only
  desk.js             Zoho Desk, read only
  zoho.js             Catalyst Connections, CRM/Learn clients, error redaction
  normalise.js        CRM record → client shape, Learn course matching
  references.js       server-minted external references
  config.js           all configuration, resolved from the environment
  apiCallLog.js        instrumentation — one row per real outbound Zoho HTTP call
  projections.js       Datastore row shape + the single idempotent upsert choke point
  projectionReads.js   hydrates a Datastore row back to the exact normalise.js shape
  bootstrap.js         one-time full pull of all 5 CRM modules into the Datastore
  reconciliation.js    incremental Cron safety net (15 min / hourly / daily)
  signals.js           Catalyst Signals event handler (near-real-time CRM → app sync)
  cache.js             dashboard/catalogue read cache, minute-granularity TTL
  syncHealth.js        sync_state + api_call_log rollups for Integration Status
  test/                offline verification suite — see also ARCHITECTURE.md

client/src/
  AuthContext.jsx  session state; nothing renders before the server confirms it
  catalystAuth.js  Catalyst Web SDK wrapper
  api.js           the only place that talks to the backend
  App.jsx          auth gate, navigation, permission-guarded routes
  components/KpiGrid.jsx  dashboard's drag/resize/hide KPI tile grid (react-grid-layout)
  pages/           Login, Dashboard, Students, Applications, Programmes,
                   Intakes, Enrolments, Learning Hub (Courses / Learners /
                   Synchronisation log), Finance, Support, Activity Log,
                   Integration Status — plus one Detail and one New/Edit
                   form page per CRM entity
```
