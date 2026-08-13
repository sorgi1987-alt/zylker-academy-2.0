# Architecture — read-model/cache/event-sync PoC

What was built against `kickoff-prompt.md`, phases 1–10, in `Zylker-Academy-Signals`
(a duplicate of the original `Zylker-Academy` project — see `README.md`). This
document exists so the numbers in `RESULTS.md` are reproducible by someone else
reading the repo, per the kickoff prompt's own requirement.

**Status at time of writing:** all code for phases 1–10 is implemented, tested
(140/140 backend tests), and committed. Nothing is deployed yet — `Zylker-Academy-Signals`
has zero live functions, so `BASELINE.md` and `RESULTS.md` (phase 11's numeric
deliverables) are blocked on an actual deployment and a live scripted session,
exactly as flagged when this work started. This document describes what the
numbers will be measuring once that happens.

## 1. Scope

Only 5 CRM-backed entities move to the read-model architecture: **students**
(Contacts), **applications** (Deals), **programmes** (Products), **intakes**,
**enrolments**. Zoho Books and Zoho Desk stay on their existing live
per-request read path, unchanged — no projection, no cache, no events for
either. The External LMS Connector was already Catalyst-native before this
PoC (no Zoho Learn calls exist in this codebase) and is untouched.

## 2. The four sync paths, and why there are four

```
                    ┌─────────────────────────────────────────────┐
                    │              Zoho CRM (source of truth)      │
                    └───────┬─────────────┬─────────────┬─────────┘
                            │             │             │
                    write-through   Signals event   reconciliation
                    (writes.js)     (signals.js)     Cron (reconciliation.js)
                    on every         primary sync     safety net —
                    successful       path, near-      catches what
                    CRM write        real-time         events miss
                            │             │             │
                            └──────┬──────┴──────┬──────┘
                                   ▼              ▼
                        projections.upsertProjectionRow()
                     (single idempotency choke point — never lets
                      an older source_modified_time overwrite newer)
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │   Datastore projections        │
                    │   crm_students, crm_applications│
                    │   crm_programmes, crm_intakes,  │
                    │   crm_enrolments                │
                    └───────────────┬──────────────┘
                                    │
                          projectionReads.readAll()
                          (hydrates back to the exact
                           normalise.js shape)
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                                ▼
        cache.js (dashboard aggregate,      direct read (list/detail
        catalogue:programmes/intakes,        routes for students/
        ~4-30 min TTL)                       applications/enrolments)
                    │
                    ▼
            /api/dashboard, /api/students, /api/applications,
            /api/programmes, /api/intakes, /api/enrolments
```

Bootstrap (`bootstrap.js`) is a fifth, one-time path: populates all 5 tables
from scratch via paginated COQL, then hands off to the three ongoing paths
above via `sync_state.checkpoint`.

**Why four paths for one dataset:** Signals is the primary sync mechanism —
near-real-time, and (per the verified sample payload) delivers the full
record, so applying an event costs zero extra Zoho calls. But Signals'
exact delivery guarantees aren't something to build production correctness
on without more field experience, so reconciliation exists purely as a
safety net running far less often (15 min / hourly / daily depending on
entity) to catch what events miss — outages, delivery failures, bugs.
Write-through exists because *this app's own writes* are the one case where
we already have the fresh record in hand from the existing read-after-write
step, so it would be wasteful not to use it immediately rather than wait for
an event or a reconciliation pass.

## 3. Idempotency — the one rule that makes 3 concurrent writers safe

All three paths funnel through `projections.upsertProjectionRow(req, entity,
rawRecord, ds)`. Before writing, it compares the incoming record's
`Modified_Time` against the stored `source_modified_time`:

- Incoming older than stored → `skipped-stale`, no write.
- Incoming same or newer → upsert, keyed by `crm_id`.

This is the entire idempotency mechanism. A duplicate Signals delivery, an
out-of-order event, or reconciliation re-covering its overlap window are all
harmless by construction — see `test/projections.test.js` and
`test/reconciliation.test.js` for the specific scenarios this is proven
against.

## 4. Datastore schema

7 tables in `Zylker-Academy-Signals` (created via the Catalyst management
API, verified live — see commit history for exact column definitions):

- **`crm_students` / `crm_applications` / `crm_programmes` / `crm_intakes` /
  `crm_enrolments`** — one row per CRM record, flattened from
  `normalise.js`'s shape: lookups become `*_id`/`*_name` column pairs, `lms`
  sub-objects become `lms_*` columns, `programme.deliveryMode` (an array)
  is stored as a JSON string (`delivery_mode_json`) since Datastore columns
  are scalar. Every row carries `source_modified_time` (raw CRM
  `Modified_Time` string, kept unparsed — same convention `writes.js`
  already used for optimistic concurrency) and `synced_at`. Derived fields
  (`fullName`, `meta.crmUrl`) aren't stored; `projectionReads.js` recomputes
  them at read time, same as `normalise.js` always did.
- **`sync_state`** — one row per entity: `checkpoint`, `last_successful_sync`,
  `last_attempt`, `last_event_received_at`, `sync_status`,
  `records_processed/updated/failed` (last run), and the cumulative
  `events_applied_total` / `reconciliation_applied_total` /
  `write_through_applied_total` counters phase 10 added.
- **`api_call_log`** — one row per real outbound Zoho HTTP call (not per
  Signals event received — see `apiCallLog.js`): `logged_at`, `service`,
  `operation`, `module_or_endpoint`, `source`
  (`interactive-read-live`/`interactive-write`/`reconciliation`/`bootstrap`/`event-sync`),
  `call_status`, `latency_ms`.

Two Catalyst quirks hit while building this schema, worth knowing before
touching it again: `timestamp` and `status` are reserved column names
(renamed to `logged_at`/`call_status`, and `*_status` domain-prefixed
elsewhere); a `|` character anywhere in a column `description` silently
triggers `PATTERN_NOT_MATCHED` on `Create_Column` — descriptions were
dropped entirely rather than debugged further.

## 5. Read path

`/api/dashboard` and the list/detail routes for all 5 entities read from
Datastore via `projectionReads.js` instead of live COQL. Verified
bit-for-bit identical to the old live-read output via round-trip tests
(`test/projectionReads.test.js`: `normalise.js(rawRecord)` must equal
`hydrate(flatten(rawRecord))` for every entity and edge case) — this is what
actually guarantees the frontend needed zero changes, not just a comment
claiming it.

List routes fetch the full (small: ≤250 rows per entity) table and
filter/join in JS, the same way the original live-COQL routes already did —
detail routes do the same rather than a single-row Datastore query, since at
this scale "fetch all, `.find()` by id" costs nothing extra and needed no
new query capability.

## 6. Cache

Two things are cached, both read through `cache.js`:

- **`dashboard:aggregate`** — the CRM-only half of the dashboard response
  (everything derived from the 5 Datastore projections). ~4 min TTL. Shared
  across every session with `DASHBOARD_READ` — one institutional rollup, not
  one per teacher. Books/Desk/LMS sections are always fetched live,
  regardless of this cache's hit/miss state, per the explicit scope
  boundary for those two services.
- **`catalogue:programmes` / `catalogue:intakes`** — used across nearly
  every route (every application/enrolment list joins programme/intake
  names). ~20 min TTL.

**Platform constraint worth knowing:** Catalyst Cache's native `put()`
expiry is whole hours, not minutes (verified against docs.catalyst.zoho.com;
fractional-hour support is undocumented either way). `cache.js` doesn't rely
on it: every cached value embeds its own `cachedAt` timestamp and the
caller's real TTL, checked on read, giving exact minute-granularity behavior
regardless of what Catalyst's own hour-granularity expiry is doing
underneath (which is still set, generously, as an outer backstop).

**Invalidation:** `cache.invalidateForEntity(req, entity)` is the single
source of truth for which keys a change to a given entity affects (dashboard
aggregate always; the matching catalogue key for programmes/intakes). Both
write-through and the Signals handler call it, so the two paths can't drift.

## 7. Write-through

Every existing write handler in `writes.js` is unchanged in its correctness
guarantees (optimistic concurrency, field allow-listing, read-after-write,
transition validation, relationship integrity, capacity, idempotent
enrolment provisioning). The single addition: `readBackRaw()` — the shared
function every create/update handler already calls to re-read the record
after a successful Zoho write — now also calls
`projections.upsertProjectionRow()` and `cache.invalidateForEntity()` with
that same freshly-read record. Zero extra Zoho calls. Deletes get the
equivalent treatment via `writeThroughDelete()`, called from all 5 delete
handlers after the CRM delete is confirmed. Both are best-effort: a
Datastore or Cache hiccup is logged and swallowed, never allowed to fail a
write that already landed in Zoho.

## 8. Reconciliation (Cron)

`reconciliation.js`, one function per entity, incremental
`Modified_Time > checkpoint` COQL (verified live: COQL requires a `where`
clause even for an unconditional pass, `limit <offset>,<count>` pagination,
and `Modified_Time > 'iso-string'` comparison all confirmed against the real
org). A 5-minute overlap is subtracted from the checkpoint before querying,
so a record right at the boundary is never missed — safe because the upsert
is idempotent, so re-covering a few already-synced records costs a little
and misses nothing. **Never advances the checkpoint on a failed run** — a
failure leaves it exactly where it was, so the next run re-covers the same
ground instead of silently widening the gap reconciliation exists to close.

Schedule tiers (not yet created as live Cron Jobs — see `DEPLOYMENT.md`):

| Entities | Schedule |
|---|---|
| applications, enrolments | every 15 minutes |
| students | hourly |
| programmes, intakes | daily |

Triggered via `POST /api/admin/reconcile-sync`, a Catalyst Cron Job Webhook
target authorized by a shared secret (`RECONCILE_SECRET`) rather than a
Catalyst user session, since a Cron invocation has no session to check.

## 9. Signals (event-driven sync)

`signals.js` handles a Catalyst Signals envelope delivered to
`POST /api/events/crm-signal` — also a Webhook target
(`SIGNALS_SECRET`-gated), not a native Catalyst "Event" Function. That
choice is deliberate: Signals supports both target types (verified), but
whether a second Function directory can safely share code
(`config.js`/`projections.js`) with `zylker_api` at deploy time is not
documented either way, and each function directory appears to package
independently. The Webhook route reuses the already-deployed `zylker_api`
function and its existing modules with zero new risk.

Verified from docs.catalyst.zoho.com's own sample payload: `event.data` is
the **full record** (not a diff), in the same shape `zoho.js` already
returns — so applying a create/update event costs no extra Zoho call.
**Not verified**, and handled defensively rather than guessed at: no sample
existed for an update or delete event (only "created"), and the
`event_config.api_name` naming convention
(`"<ModuleAPIName> Created/Updated/Deleted"`) is inferred from the one
confirmed example. `signals.js`'s `parseEventConfig()` fails safe — an
unrecognised `api_name` is logged and skipped, never guessed at, so a wrong
inference cannot corrupt a projection. **Before trusting this in
production**, fire one real test event per action type once Signals is
configured (see `DEPLOYMENT.md`) and confirm the parser actually matches
what Zoho sends.

Not confirmed either way: whether Catalyst deducts CRM API credits for
delivering a Signals event. Confirmed: 100 KB per event occurrence, 5 MB per
batch, up to 200 distinct events configurable — none of which this PoC is
near (15 rules: 5 entities × 3 actions).

## 10. Instrumentation

`api_call_log`, written from a single point inside every real outbound Zoho
HTTP call (`zoho.js`, `books.js`, `desk.js`'s shared `client()`/`booksGet()`/
`deskGet()` — wrapped via `apiCallLog.timed()`). A Signals event arriving is
not itself a Zoho API call this app made and is never logged — only actual
outbound HTTP calls are, whichever path triggers them (`source` column
distinguishes `interactive-read-live` from `interactive-write`,
`reconciliation`, `bootstrap`, `event-sync`).

`/api/integration-status` extends this into a live view (phase 10): per-entity
`sync_state` (last sync, last event received, records processed/failed, and
the cumulative event/reconciliation/write-through split — see
`sync_state`'s 3 counter columns and `syncState.incrementApplied()`), plus a
24-hour `api_call_log` rollup by service/source, aggregated in application
code over a bounded row fetch rather than relying on unconfirmed ZCQL
`GROUP BY` support.

## 11. What to measure once deployed

`BASELINE.md` (blocked — needs a live scripted session against the
*original*, unmigrated `Zylker-Academy` app, or this repo checked out at a
pre-phase-4 commit and deployed) and `RESULTS.md` (blocked — the same
session against this migrated app) both need an actual deployment, which
hasn't happened in this session. The comparison to make once it has:
`/api/dashboard`'s call count (9 live calls → 0, the single highest-value
change), the list/detail routes' call counts, and the
`api_call_log`/`syncHealth` rollups this PoC now exposes live — so the
"before" number doesn't have to be re-derived by hand a second time.
