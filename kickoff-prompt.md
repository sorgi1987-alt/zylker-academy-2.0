# Kickoff prompt — paste this into the new chat window

You are working in a **duplicate** of the "Zylker Academy" Catalyst app
(students/applications/programmes/intakes/enrolments backed by Zoho CRM, with
read-only Zoho Books invoices and Zoho Desk tickets). This copy exists for one
purpose: **build a focused proof-of-concept of a read-model/cache/event-sync
architecture and measure its real, actual impact on Zoho API call volume**,
compared to the current architecture where every frontend read hits Zoho live.

This is a measurement PoC, not a production rewrite. Scope is deliberately
narrower than a full refactor — do not expand it. Specifically out of scope for
this PoC (do not build these even if they seem like natural next steps):

- Zoho Desk event ingestion of any kind. Zoho Desk's support as a Catalyst
  Signals publisher is not confirmed as of this writing — verify it yourself
  before assuming it (§2a). If unsupported, Desk gets no event path in this
  PoC; do not hand-roll a Desk webhook receiver as a substitute.
- Hand-rolled Zoho CRM Notifications-API webhooks (a self-hosted public
  endpoint with manual channel subscription/renewal and signature
  verification). Use Catalyst Signals instead (§2a) — it is Catalyst's own
  managed event bus for this and needs none of that.
- Zoho Books or Zoho Desk read models/projections. Both stay on today's live
  per-request read path unchanged. Only the 5 core CRM-backed entities move.
- Any new infrastructure outside native Catalyst services (Datastore, Cache,
  Cron, Functions, Signals, API Gateway). No Kafka/Redis/external queues/extra DBs.

## 0. Setup — verify before building anything

This Catalyst project is a fresh duplicate. Confirm before Phase 1:

- Catalyst Connections `zylker_zoho`, `zylker_books`, `zylker_desk` exist in
  *this* project with the scopes documented in `DEPLOYMENT.md`, pointed at the
  **same** Zoho CRM/Books/Desk orgs as the original app (not sandbox orgs —
  the whole point is measuring against real data volume and shape).
- Environment variables from `config.js` are set for this project
  (`CATALYST_PROJECT_ID`, `ZOHO_BOOKS_ORG_ID`, `ZOHO_DESK_ORG_ID`, etc).
- `cd functions/zylker_api && npm test` passes (54 tests) and
  `cd client && npm run build` succeeds, unmodified, before you change anything.
  This confirms the duplicate is a clean, working starting point.

Use whatever Catalyst/Zoho MCP tools or official docs are available to you to
verify real Datastore/Cache/Cron/Signals API shapes and CRM COQL syntax before
writing code against them. Do not invent Catalyst or Zoho API surface that
doesn't exist — verify it. This matters especially for Signals (§2a): at the
time this prompt was written, the following was confirmed from
docs.catalyst.zoho.com, and the rest was **not** confirmed and needs
verifying before you build against it:

Confirmed:
- Zoho CRM is a supported Signals publisher, with default events (create/
  update/delete, 103 events across standard modules) requiring no manual
  schema setup.
- Custom CRM modules — which includes this app's `Intakes` and `Enrolments`
  — are kept in sync automatically and do get events.
- No webhook endpoint or auth setup needed on the Catalyst side; Zoho-side
  authorization is handled internally by Catalyst.
- Targets that can receive a Signal include Catalyst Functions.

Not confirmed — verify these yourself before relying on them:
- Whether Zoho Desk is a supported Signals publisher at all.
- The exact console/CLI steps to subscribe a Function to specific CRM module
  events (Contacts/Deals/Products/Intakes/Enrolments).
- The exact event payload shape delivered to a Function.
- Whether receiving a Signals event consumes Zoho CRM API credits.
- Any event-volume limits or cost implications.

## 1. The instrument comes first

Before touching any read path, add lightweight Zoho API call instrumentation:

- New Datastore table `api_call_log`: `timestamp`, `service` (crm/books/desk/
  lms), `operation`, `module_or_endpoint`, `source` (`interactive-read-live` /
  `interactive-write` / `reconciliation` / `bootstrap` / `event-sync` — the
  last for the rare case a Signals event handler needs to fetch additional
  data from Zoho to complete a projection update), `status`, `latency_ms`.
  A Signals event arriving is not itself a Zoho API call our app made and
  does not get logged here — only actual outbound Zoho HTTP calls do.
- Wrap the existing upstream call sites in `zoho.js`, `books.js`, `desk.js` so
  every real Zoho HTTP call writes one row. This must be true of the
  **current, unmigrated** code path too — you need a real baseline, not an
  estimate.
- Run a short scripted session against the unmigrated app (login, dashboard,
  students list, one student detail, applications list, one application
  detail, programmes, intakes, enrolments) and record the total call count and
  breakdown by endpoint. Save this as `BASELINE.md` in the repo root with the
  numbers and the exact script/steps used, so the after-numbers are comparable.

## 2. Target architecture for this PoC

### Datastore projections

One table per entity, flattening the nested shapes `normalise.js` already
produces (do not invent new field names — mirror `student()`, `application()`,
`programme()`, `intake()`, `enrolment()` in `functions/zylker_api/normalise.js`
exactly, flattening `lookup()` results to `_id`/`_name` column pairs and `lms`
sub-objects to prefixed columns):

- `crm_students` — mirrors `student()`.
- `crm_applications` — mirrors `application()`, with `student_id`/`student_name`,
  `programme_id`/`programme_name`, `intake_id`/`intake_name` flattened.
- `crm_programmes` — mirrors `programme()`; `deliveryMode` (array) stored as a
  JSON string column since Datastore columns are scalar.
- `crm_intakes` — mirrors `intake()`, with `programme_id`/`programme_name` flattened.
- `crm_enrolments` — mirrors `enrolment()`, with all three lookups flattened.

Every row carries `source_modified_time` (the CRM record's `Modified_Time`)
and `synced_at` (when this row was last written by our sync), for staleness
checks and safe reconciliation.

### Sync metadata

`sync_state` — one row per entity (`crm.contacts`, `crm.deals`, `crm.products`,
`crm.intakes`, `crm.enrolments`): `checkpoint`, `last_successful_sync`,
`last_attempt`, `status`, `records_processed`, `records_updated`,
`records_failed`. Also track, per entity: `last_event_received_at` (from
Signals) so drift between event-driven sync and reconciliation is visible.
Never advance the checkpoint on a failed reconciliation run.

### 2a. Event-driven sync via Catalyst Signals (primary sync path)

Signals, not reconciliation, is the primary way CRM-originated changes reach
the Datastore projections. Reconciliation (below) becomes the safety net, not
the main mechanism.

- Configure a Signals event source on Zoho CRM for the 5 relevant modules:
  `Contacts`, `Deals`, `Products`, and the custom modules `Intakes` and
  `Enrolments` — create/update/delete events on each.
- Target: a Catalyst Function that receives the event and upserts the
  corresponding Datastore row, exactly like the write-through path does.
- **Idempotency is mandatory, same as any event source**: compare the event's
  record `Modified_Time` against the `source_modified_time` already stored;
  never let an out-of-order or duplicate event overwrite newer data. Events
  may arrive more than once, late, or out of order — assume all three.
- On a successful projection update from an event, invalidate the same Cache
  keys the write-through path would invalidate for that entity.
- Log event processing in `sync_state` (`last_event_received_at`) so a stalled
  event stream is visible on the Integration Status page rather than silently
  degrading to stale data.

### Bootstrap

One-time initial population of all 5 tables from current CRM data. Use COQL
paginated reads (or the Bulk Read API if the record counts justify it — check
actual counts first rather than assuming). Must be resumable and must not wipe
existing Datastore rows if re-run partway.

### Read path

For `/api/dashboard` and the list/detail routes for students, applications,
programmes, intakes, enrolments: read from Datastore (via Cache where noted
below) instead of calling Zoho live. Keep the existing response shape exactly
— the frontend must not need to change.

### Cache

Use Catalyst Cache for:

- **Dashboard aggregate KPIs** — key `dashboard:aggregate` (a **shared** key,
  not per-user: every authenticated user with `DASHBOARD_READ` sees the same
  institutional rollup, so one cache entry should serve every session rather
  than one per teacher). TTL ~3–5 minutes.
- **Reference data** — `catalogue:programmes`, `catalogue:intakes`,
  `programme:{id}`, `intake:{id}`. TTL ~15–30 minutes; this data changes rarely.

Do not cache: individual application/enrolment/student records immediately
after a write, or anything that must reflect a just-completed transition.
Invalidate the relevant cache key on any successful write-through (below).

### Write-through

Keep the existing write handlers in `writes.js` exactly as they are —
optimistic concurrency, field allow-listing, read-after-write, stage-transition
validation table, all of it. Add one step after a Zoho write succeeds: upsert
the affected row(s) in the corresponding Datastore table, and invalidate any
Cache key the change affects (e.g. a stage transition invalidates
`dashboard:aggregate`). If the Zoho write fails, nothing local changes.

### Reconciliation (Cron) — safety net, not the primary path

With Signals doing the real-time work, reconciliation exists to catch what
events miss (delivery failures, an outage window, a bug). Run it less
aggressively than a polling-primary design would need:

- Applications, Enrolments — every 15 minutes.
- Students — hourly.
- Programmes, Intakes — daily.

Incremental `Modified_Time > checkpoint` COQL queries, not full re-syncs. Use
an overlap window on the checkpoint (process slightly before the last
checkpoint, rely on idempotent upserts) so timing-boundary records are never
missed. Never overwrite a Datastore row with older data than
`source_modified_time` already stored (compare before writing) — the same
idempotency rule as the Signals event handler, because both paths write to
the same table and must not race each other into a stale state.

### Sync health

Extend the existing Integration Status page/`/api/integration-status`
endpoint rather than building a new admin screen — add per-entity last-sync
time and last-event-received time, records processed/failed, how many
projection updates came from events vs. reconciliation vs. write-through (this
split is itself an interesting PoC result), and a rollup of `api_call_log`
(calls by service/source over the last 24h) so the before/after comparison has
a live view, not just the one-off `BASELINE.md`.

## 3. Phases (small, separately deployable commits)

1. Setup verification (§0) + `api_call_log` instrumentation + `BASELINE.md` (§1).
   Nothing else changes yet — ship this alone first.
2. Datastore projection tables + `sync_state` schema (empty, no data yet).
3. Bootstrap sync populates all 5 tables.
4. Move `/api/dashboard` to read from Datastore/Cache. This is the single
   highest-value endpoint (up to 9 live calls today) — do it first and alone,
   confirm it works end-to-end before touching the list endpoints.
5. Move students/applications/programmes/intakes/enrolments list + detail
   routes to Datastore.
6. Write-through sync on every existing write endpoint.
7. Reconciliation Cron jobs + checkpointing (ship this before Signals so
   there's a working, if slower, sync path to fall back to and compare against).
8. Signals event source + Function handler for the 5 CRM entities (§2a). Verify
   the unconfirmed items listed in §0 as part of this phase, before writing the
   handler.
9. Cache layer (dashboard aggregate + reference data) on top of the now-working
   Datastore reads.
10. Extend Integration Status with sync health + API call rollup + event vs.
    reconciliation vs. write-through split.
11. Re-run the exact same scripted session from §1 against the migrated app.
    Write `RESULTS.md`: baseline vs after, call counts by endpoint and by
    source, and a plain-language summary of the reduction.

## 4. Preserve, unconditionally

- Every correctness guarantee documented in this repo's `README.md` under
  "Correctness guarantees" — field allow-listing, read-after-write, optimistic
  concurrency, transition-table validation, duplicate-student prevention,
  idempotent enrolment, relationship integrity, capacity enforcement, date
  order validation. None of these move client-side; none of them get weaker.
- The existing route-table pattern (`readRoutes`/`WRITE_ROUTES` in `index.js`)
  so every endpoint's auth/permission gate stays answerable by reading one file.
- `identity.js`'s SDK-only identity resolution — never trust client-supplied
  ids for authorization.
- The current API response shape for every existing endpoint — the frontend
  should not need a single line changed by this migration.
- All 54 existing backend tests passing, plus new tests for: Datastore read
  returns correct shape; write-through updates the projection; a failed Zoho
  write leaves the projection untouched; reconciliation doesn't overwrite a
  newer row with stale data; a duplicate or out-of-order Signals event is
  harmless and cannot overwrite newer data with older; cache invalidation
  fires on the writes/events that should trigger it; a user without permission
  for an entity still gets nothing back regardless of what's in Datastore.

## 5. Deliverable

At the end: `BASELINE.md`, `RESULTS.md`, and a short `ARCHITECTURE.md`
documenting what was built (the source-of-truth/read-model/cache/write-path/
event-sync/reconciliation flow, the Datastore schema, cache TTL choices, Cron
schedules, the Signals event source configuration) so the numbers in
`RESULTS.md` are reproducible by someone else reading the repo.

Work through the phases in order. Commit at each phase boundary. Do not ask for
confirmation to proceed between phases unless you hit a genuinely blocking
architectural issue (e.g. a Catalyst API doesn't support something assumed
above) — in that case, say what's blocked and what you're doing instead, and
keep going.
