# RESULTS — Zoho CRM API call volume after the read-model migration

The exact scripted session from `BASELINE.md`, run live against the
deployed, migrated app (`Zylker-Academy-Signals`,
`https://zylker-academy-signals-20117369913.development.catalystserverless.eu`,
commit `102cdac`) on 2026-08-13. Numbers are read directly from
`api_call_log`, not estimated — see methodology below.

## Methodology

A cutoff timestamp was recorded from `api_call_log` immediately before the
session (`select max(logged_at) from api_call_log`), the 9-step script was
run against the live app (same records as `BASELINE.md`: Stefan Castillo /
STU-22456 for the student detail step, APP-10001 / Aisha Rahman for the
application detail step), then every row logged after that cutoff was read
back and grouped by `service`/`source`. `source = 'interactive-read-live'`
is this session's own traffic; `source = 'reconciliation'` rows in the same
window are the `reconcile_15min` Cron firing on its own schedule during the
capture — real, live, correctly attributed by `api_call_log`'s own design,
and excluded from the interactive count below because they're not something
this scripted session caused.

**A bug was found and fixed by this exact measurement, before the numbers
below were captured.** The first live run of this script showed CRM traffic
that shouldn't have existed post-migration. Traced to `/api/attention` — a
second endpoint the Dashboard page calls alongside `/api/dashboard`, for
the "Needs attention" panel — which had been missed in phases 4/5 and was
still calling the pre-migration `listApplications`/`listEnrolments`/
`listIntakes` helpers (3 live CRM calls, every dashboard load). Fixed to
read from the same Datastore projection every other route uses (commit
`102cdac`), redeployed, and confirmed live before this session was run.
`ARCHITECTURE.md` §9 and this repo's commit history have the full account.

## CRM call count, per step

| # | Step | Baseline (`c1c2687`) | Result (live, `102cdac`) |
|---|---|---|---|
| 2 | Dashboard (+ Needs attention) | 8 | **0** |
| 3 | Students list | 3 | **0** |
| 4 | Student detail (Stefan Castillo) | 5 | **0** |
| 5 | Applications list | 2 | **0** |
| 6 | Application detail (APP-10001) | 5 | **0** |
| 7 | Programmes list | 4 | **0** |
| 8 | Intakes list | 3 | **0** |
| 9 | Enrolments list | 2 | **0** |
| | **Total** | **32** | **0** |

**Zero live Zoho CRM calls for the entire 9-step session — a 100%
reduction**, confirmed directly from `api_call_log` (not inferred): no row
with `service = 'crm'` and `source = 'interactive-read-live'` was logged at
any point during the capture window. Every read in the script came from the
Datastore projection (`crm_students`/`crm_applications`/`crm_programmes`/
`crm_intakes`/`crm_enrolments`), kept current by write-through, Signals
events, and the reconciliation Cron — the four sync paths in
`ARCHITECTURE.md` §2 — rather than by a live call made in response to the
page load itself.

This does **not** mean Zoho CRM is called zero times overall — it means the
*browser-facing read path* costs zero live calls. The real, ongoing CRM
call volume moved to the sync paths that keep the projection fresh
independent of how many people are looking at the app: the 3 reconciliation
Cron jobs (visible above as the `source = 'reconciliation'` rows firing
during this exact capture window) and the 15 Signals rules delivering
near-real-time updates. That's the trade this architecture makes —
predictable, schedule-bounded background sync traffic instead of traffic
that scales with every page view.

## Non-CRM calls (Books, Desk) — unchanged, for context only

Captured in the same session, `source = 'interactive-read-live'`:

| Service | Calls | Why |
|---|---|---|
| Books | 5 | Dashboard's `invoiceTotals()` (3 pages) + student detail's Books-customer resolution and invoice list (2) |
| Desk | 15 | Dashboard's `ticketTotals()` (13 pages) + student detail's Desk-contact resolution and ticket list (2) |

Identical code path to `BASELINE.md` (Books/Desk are out of scope for this
PoC — see `ARCHITECTURE.md` §1), so these numbers aren't a result of the
migration; they're shown so the "0" above isn't mistaken for "the app makes
no live calls at all." They'll also drift over time as the org's real
invoice/ticket counts grow, since both helpers paginate through the full
set rather than returning a single aggregate (`books.js:244`,
`desk.js:202`) — worth knowing if these numbers are ever re-measured and
come back different from what's shown here.

## Summary

| | Baseline | Result | Change |
|---|---|---|---|
| Live CRM calls for the scripted session | 32 | 0 | **-100%** |
| `/api/dashboard`'s own CRM calls (the kickoff prompt's headline figure) | 5 | 0 | -100% |

The single highest-value change the kickoff prompt called out up front —
`/api/dashboard` — went from 5 live CRM calls to 0, exactly as intended by
phase 4. The rest of the read path (list/detail routes for all 5 entities,
phase 5) and the previously-missed `/api/attention` sibling endpoint
(found and fixed during this measurement) followed the same pattern:
every one of them now costs 0 live CRM calls, with correctness maintained
by the four independent sync paths documented in `ARCHITECTURE.md`.
