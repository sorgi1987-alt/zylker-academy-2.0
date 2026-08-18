# Architecture — read-model/cache/event-sync PoC

What was built against `kickoff-prompt.md`, phases 1–11, in `Zylker-Academy-Signals`
(a duplicate of the original `Zylker-Academy` project — see `README.md`). This
document exists so the numbers in `RESULTS.md` are reproducible by someone else
reading the repo, per the kickoff prompt's own requirement.

**Status at time of writing (2026-08-13):** all code for phases 1–11 is
implemented, tested (148/148 backend tests), committed, and **deployed and
live**. All four sync paths are running against the real org: write-through
and bootstrap have been exercised live, all 3 reconciliation Cron jobs are
live and running on schedule, and all 15 Signals rules are live and have
processed real CRM events end-to-end (verified via `sync_state`'s
`events_applied_total`/`reconciliation_applied_total` counters, not just
"the console shows Enabled"). `BASELINE.md`/`RESULTS.md` are done: **32
live CRM calls → 0** for the kickoff prompt's own scripted session (§11).
Three real bugs were found only once this went live — §8, §9, and the
`/api/attention` gap `RESULTS.md` itself surfaced — that no amount of
offline testing against fakes could have caught, because each was a
disagreement between this code's assumptions and the live platform's (or
the app's own route table's) actual behaviour. §12 lists what is still
genuinely not built.

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

7 tables in `Zylker-Academy-Signals` belong to this read-model PoC (created
via the Catalyst management API, verified live — see commit history for
exact column definitions). The project also holds 4 more tables that
predate this PoC and are outside its scope — `lms_courses`,
`lms_enrolments`, `lms_sync_log` (the External LMS Connector) and
`admissions_audit` (the per-user action log) — recreated in this
duplicate project after being found missing; see §12.

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

**Bug found on first live deployment, now fixed:** ZCQL hard-refuses a
`LIMIT` above 300 ("ZCQL CANNOT HAVE MORE THAN 300 ROWS in LIMIT", confirmed
live) and applies some default when no `LIMIT` is given at all rather than
returning everything — `readAll()` originally issued no `LIMIT` clause,
which every entity's row count (≤244 today) happened not to expose, but
would have silently truncated the moment any entity grew past whatever that
implicit default turns out to be. `syncHealth.js`'s `api_call_log` rollup
hit the same ceiling more directly: it requested `limit 2000` outright,
which ZCQL rejects unconditionally, so the rollup silently came back `null`
on the live Integration Status page (caught by index.js's
`.catch(() => null)`) until this was traced back to the actual query error.
Both now paginate explicitly in pages of 300 (`readAll()` walks every page;
the log rollup caps at 10 pages / 3000 rows and reports `truncated: true`
beyond that, since it's a reporting rollup, not a correctness-critical
read). See `test/projectionReads.test.js` and `test/syncHealth.test.js`'s
pagination tests, both built with fakes that actually respect `LIMIT
offset,count` rather than ignoring it — the existing single-page fakes in
`test/projectionReads.test.js` couldn't have caught this, since a fake that
returns everything regardless of the query parameters can't distinguish
"paginated correctly" from "the LIMIT clause was silently ignored."

**Gap found while capturing `RESULTS.md`'s live numbers, now fixed:**
`/api/attention` — a second endpoint the Dashboard page calls alongside
`/api/dashboard`, for the "Needs attention" panel (kept separate on purpose:
a slow Books call degrades one card instead of the whole page) — was missed
entirely by phases 4/5. It kept calling the pre-migration
`listApplications`/`listEnrolments`/`listIntakes` helpers (3 live CRM calls
on every dashboard load) straight through phases 4–11, because nothing in
this migration's own checklist named it separately from `/api/dashboard`.
No test caught it either: the offline suite has no test asserting
`/api/attention` reads from Datastore, because no such route existed to
test until this PoC's own migration should have added it. Found only by
running the real scripted session end-to-end and seeing CRM traffic that
the rest of this document said shouldn't be there. Fixed to read from
`readApplications`/`readEnrolments`/`readIntakes` — the same Datastore
projection every other route uses — leaving its Books/Desk calls untouched
(out of scope, §1). See `RESULTS.md`'s own methodology section for the
full account, including how it was diagnosed live.

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
aggregate always; the matching catalogue key for programmes/intakes).
Write-through, the Signals handler, bootstrap, and reconciliation all call
it — bootstrap unconditionally on success (see below), the other three only
when a row actually changed.

**Bug found on first live deployment, now fixed:** the first `/api/dashboard`
load happened *before* bootstrap ran, caching an empty `catalogue:programmes`
result for its full ~20 min TTL. Bootstrap then populated the table, but
originally invalidated nothing — write-through/Signals only invalidate on an
*actual change*, and bootstrap's initial run legitimately has nothing prior
to compare against, so that condition never held. `dashboard:aggregate`
showed 0 active programmes and 0 upcoming intakes despite Datastore holding
real data, until the stale keys were cleared by hand. Fixed by having
bootstrap invalidate unconditionally on a successful run (its entire purpose
is moving Datastore from an unknown prior state to a known one, so the cache
must be treated as untrustworthy regardless of whether any individual row
changed) and reconciliation invalidate whenever a run updates at least one
record. See `bootstrap.js`/`reconciliation.js` and
`test/bootstrap.test.js`/`test/reconciliation.test.js`'s cache-invalidation
tests.

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

Schedule tiers, **live** as of 2026-08-13 (Console → Job Scheduling → Cron):

| Cron name | Entities | Schedule |
|---|---|---|
| `reconcile_15min` | applications, enrolments | every 15 minutes |
| `reconcile_hourly` | students | hourly |
| `reconcile_daily` | programmes, intakes | daily at 02:00 Europe/Madrid |

Triggered via `POST /api/admin/reconcile-sync`, a Catalyst Cron Job Webhook
target authorized by a shared secret (`RECONCILE_SECRET`) rather than a
Catalyst user session, since a Cron invocation has no session to check.

**Bug found on first live Cron run, now fixed:** every single reconciliation
run failed with Zoho's `INVALID_QUERY` ("expected_data_type: datetime") from
the moment the Cron jobs were created — reproduced directly with a manual
`curl` against the live endpoint, then isolated with a direct COQL call.
`withOverlap()` was handing COQL a `Date#toISOString()` string
(`"2026-08-12T07:49:17.000Z"` — milliseconds, literal `"Z"`), which COQL
rejects for a datetime-column comparison; confirmed live that the same
instant formatted as `"2026-08-12T07:49:17+00:00"` (no milliseconds, a plain
numeric offset instead of `"Z"`) is accepted. This is exactly the kind of gap
the §8 header comment used to (wrongly) claim was covered: the `>` comparison
itself had been verified live, but the *string format* fed into it never had
been, because `bootstrap.js`'s only COQL date-adjacent query
(`Created_Time is not null`) doesn't exercise a date literal at all — nothing
in the offline suite could have caught this either, since the fake CRM in
`test/reconciliation.test.js` does a plain JS string comparison and doesn't
care what format the string is in. Fixed by a `toCoqlDatetime()` helper
`withOverlap()` now routes through; `test/reconciliation.test.js` asserts the
output can never contain milliseconds or a literal `"Z"` again, not just that
today's specific input happens to convert correctly.

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

**Bug found setting up the first live Signals publisher, now fixed:** the
original `event_config.api_name` assumption —
`"<ModuleAPIName> Created/Updated/Deleted"` (e.g. `"Contacts Created"`),
inferred from docs.catalyst.zoho.com's one sample payload — was wrong.
Confirmed live, once a real publisher (`zylker_crm_publisher`) existed to
check against: the actual format is `"<singular_module_noun>_<action>"`,
all lowercase snake_case — `contact_created`, `deal_updated`,
`product_deleted`, `intake_created`, `enrolment_deleted`, etc. — regardless
of how the module is display-labelled in this org's CRM UI (this org shows
Contacts as "Student" and Deals as "Application" in the console's own event
picker, but the wire-level `api_name` stays keyed to the underlying standard
module name). Had this shipped unfixed, `parseEventConfig()`'s fail-safe
design (an unrecognised `api_name` is logged and skipped, never guessed at)
means no projection would have been corrupted — but *every single Signals
event, for every entity, forever* would have been silently dropped as
"unrecognised", making the entire event-driven sync path a no-op while
looking fully configured in the console. `signals.js`'s
`SIGNALS_MODULE_MAP`/`parseEventConfig()` and its test suite now use the
confirmed format. Also confirmed live, contrary to the original "no sample
existed for update/delete" caveat: the same `"<noun>_<action>"` shape holds
for `updated` and `deleted` too, not just `created`.

**Confirmed live for both custom modules too** — Intakes and Enrolments have
real Signals events (`intake_created`/`enrolment_created`/etc.), found via
the Rule creation flow's "Choose Event" picker. (The publisher's own Events
tab search undercounts and returned nothing for "Intake"/"Enrolment" —
not a reliable way to check which modules Signals covers; the rule creation
picker is.) All 15 rules (5 entities × created/updated/deleted) are live,
each targeting one shared Webhook (`zylker_crm_signal_webhook`) →
`POST /api/events/crm-signal`.

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

## 11. What was measured

`BASELINE.md`/`RESULTS.md` — the kickoff prompt's own closing deliverable —
are done: a static, code-cited count of the pre-migration commit
(`BASELINE.md`) against the same live-captured `api_call_log` session run
against the deployed migrated app (`RESULTS.md`), both using the identical
9-step script and the identical real records, so the two numbers are
directly comparable. Headline result: **32 live CRM calls → 0**, a 100%
reduction, for the full scripted session (dashboard, students list +
detail, applications list + detail, programmes, intakes, enrolments). This
measurement itself found and fixed a real gap — `/api/attention` had been
missed by phases 4/5 and was still making 3 live CRM calls on every
dashboard load — see `RESULTS.md`'s own methodology section for the full
account. `/api/integration-status`'s live `syncHealth` rollup (per-entity
`sync_state` plus a 24h `api_call_log` rollup) remains available for
ongoing monitoring beyond this one-off comparison.

## 12. Deferred / not yet developed

Everything in `kickoff-prompt.md`'s 11 phases, plus its closing
`BASELINE.md`/`RESULTS.md` deliverable, is built, tested, deployed, live,
and measured. What remains is live-operations work the kickoff prompt
scoped separately, or genuine gaps this PoC intentionally left alone:
- **Production environment.** Everything above is live on this project's
  **Development** environment only. Promoting to Production means: setting
  `RECONCILE_SECRET`/`SIGNALS_SECRET` (and every other function-level env
  var in `DEPLOYMENT.md` §1) again at the Production level, recreating all 3
  Cron jobs and all 15 Signals rules again (neither carries over
  automatically — confirmed live, see `DEPLOYMENT.md`), and re-running the
  verification checklist in `DEPLOYMENT.md` §5 against the Production URL.
- **A deploy approval gate.** `DEPLOYMENT.md` §3a already notes this:
  `environment: development` is declared in the GitHub Actions workflow but
  no required reviewer is configured, so a push to `main` deploys
  immediately. Worth adding before this points at a production org — not
  done here since this PoC's target has stayed Development throughout.
- **Whether Catalyst deducts CRM API credits for a delivered Signals
  event** — noted as unconfirmed in §9, and still unconfirmed; not blocking,
  but worth checking before relying on Signals at a much larger event volume
  than this PoC's.

**Fixed since the above was written (2026-08-18):** two tables specific to
this duplicate project — not part of the read-model PoC's own scope, but
worth recording here since they were found broken by exactly the same
"this is a fresh duplicate project, not everything was recreated" pattern
as everything else in this section:
- **The External LMS Connector's Data Store tables** (`lms_courses`,
  `lms_enrolments`, `lms_sync_log`) did not exist in
  `Zylker-Academy-Signals` — confirmed live, and the Learning Hub showed
  "No such Table" errors as a result. Recreated with the exact schema from
  the original project (`Zylker-Academy`, read-only source — never
  written to) and repopulated with the same demonstration rows, reusing
  the original `CRM_Programme_ID`/`CRM_Student_ID`/`CRM_Enrolment_ID`
  values as-is since both projects point at the same live CRM org.
- **`admissions_audit`** (the per-user action log behind the Activity tab
  on student/application/enrolment records, and the standalone Activity
  Log page) was missing the same way. Every write silently failed to log
  its audit entry the whole time this project has existed — silently,
  because `auth.audit()` is deliberately best-effort and swallows its own
  errors so a logging failure can never fail the write it's describing.
  Recreated with the schema from the original project; a real write now
  logs correctly, verified live.
