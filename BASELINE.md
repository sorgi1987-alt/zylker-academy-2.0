# BASELINE — Zoho CRM API call volume before the read-model migration

What the pre-migration (`c1c2687`, "Add per-column totals and remembered
view to Applications board" — the last commit before any read-model PoC
work started) code costs in live Zoho CRM calls for one pass through the
scripted session `kickoff-prompt.md` §1 specifies: **login, dashboard,
students list, one student detail, applications list, one application
detail, programmes, intakes, enrolments.**

## Methodology

This is a **static count of `c1c2687`'s actual route-handler code**,
resolved against **real records in this org** for every data-dependent
branch (a detail page's conditional extra fetches depend on what's actually
linked to the specific record visited) — not a redeployment of the old code
and not an estimate. Every number below cites the exact file:line in the
pre-migration commit it comes from, and the exact real record used to
resolve each conditional, so it's independently checkable by anyone with
this repo and this org's data.

**Why not a live redeploy of the old code:** the old code makes no live
Zoho calls that the new code's `zoho.js`/`books.js`/`desk.js` clients don't
already make identically — `q()` (the pre-migration COQL helper) and the
current `zoho.crmQuery()` build the exact same query for the exact same
inputs, and Books/Desk are byte-for-byte unchanged between old and new code
(out of scope for this PoC — see `ARCHITECTURE.md` §1). A parallel
deployment of `c1c2687` would measure the identical call pattern this
static count already gives, at the cost of standing up and tearing down a
second live deployment against the same production CRM org. `RESULTS.md`'s
numbers, by contrast, **are** a live-captured session — see that document's
own methodology note.

Every list-route call in `c1c2687` is a single COQL query capped at
`limit 200` (`MAX_ROWS`), not paginated — confirmed by reading `q()` at
`c1c2687:functions/zylker_api/index.js:127`. So every count below is exact,
not an upper bound.

## The script and the real records used

1. **Login** — Catalyst embedded auth. 0 Zoho calls (not a CRM/Books/Desk
   operation).
2. **Dashboard** (`GET /api/dashboard`, landing view) — the dashboard page
   also triggers `GET /api/attention` (the "Needs attention" panel) as a
   separate client-side fetch, so both are counted here as "visiting the
   dashboard", matching what a real page load actually costs.
3. **Students list** (`GET /api/students`)
4. **One student detail** (`GET /api/students/:id`) — record used:
   **Stefan Castillo, STU-22456** (CRM id `1008713000000991073`), chosen
   because he has a linked application (and therefore a linked programme
   and intake), exercising this page's conditional fetches rather than its
   empty-state path.
5. **Applications list** (`GET /api/applications`)
6. **One application detail** (`GET /api/applications/:id`) — record used:
   **APP-10001, Aisha Rahman — DATA-101, Enrolled** (CRM id
   `1008713000000652132`), chosen because it has a linked student,
   programme, intake, *and* enrolment, exercising every conditional fetch
   this page can make.
7. **Programmes list** (`GET /api/programmes`)
8. **Intakes list** (`GET /api/intakes`)
9. **Enrolments list** (`GET /api/enrolments`)

## CRM call count, per step

| # | Step | CRM calls | Source (`c1c2687:functions/zylker_api/index.js`) |
|---|---|---|---|
| 2 | Dashboard | **8** | `/api/dashboard` line 483: `listStudents`, `listApplications`, `listProgrammes`, `listIntakes`, `listEnrolments` (5) + `/api/attention` line 767: `listApplications`, `listEnrolments`, `listIntakes` (3) |
| 3 | Students list | **3** | line 753: `listStudents`, `listApplications`, `listEnrolments` |
| 4 | Student detail (Stefan Castillo) | **5** | line 789: `listStudents` (by id) + line 795–796: `listApplications` (by contact), `listEnrolments` (by student) = 3, plus line 807–808: `listProgrammes`, `listIntakes` — both fire because Stefan has a linked application (programmeIds/intakeIds non-empty) = 2 more |
| 5 | Applications list | **2** | line 842: `listApplications`, `listStudents` |
| 6 | Application detail (APP-10001) | **5** | line 877: `listApplications` (by id) + line 881–885: `listEnrolments` (by application, unconditional), `listStudents`/`listProgrammes`/`listIntakes` (all 3 fire — APP-10001 has a linked student, programme, and intake) = 4 more. The further conditional `listEnrolments` for intake-capacity usage (line 900–904) does **not** fire: this application is at the terminal "Enrolled" stage, so `allowed.length === 0` and the `allowed.includes(STAGE.ENROLLED)` guard is false. |
| 7 | Programmes list | **4** | line 986–987: `listProgrammes`, `listEnrolments`, `listApplications`, `listIntakes` |
| 8 | Intakes list | **3** | line 1051: `listIntakes`, `listEnrolments`, `listApplications` |
| 9 | Enrolments list | **2** | line 1129: `listEnrolments`, `listStudents` |
| | **Total** | **32** | |

## Non-CRM calls (Books, Desk) — unchanged by this PoC, shown for context only

Books and Desk stay on today's live per-request read path in both the old
and the new code — this PoC's scope is the 5 CRM entities only (see
`ARCHITECTURE.md` §1). Their call counts are therefore identical whether
measured against `c1c2687` or the migrated app, and are not part of this
PoC's reduction claim. For reference, measured live against the *migrated*
app for this exact script (since the code is identical, this is a valid
stand-in — see `RESULTS.md`): `books.invoiceTotals()`/`desk.ticketTotals()`
each paginate through the org's full invoice/ticket set (confirmed live —
`books.js:244`, `desk.js:202`), which is why these counts are noticeably
larger than "one call per source" and will drift as the org's Books/Desk
data grows, unlike the fixed-`limit 200` CRM counts above.

## What to compare this against

`RESULTS.md` runs this exact script live against the deployed, migrated
app and reads the true count back from `api_call_log`. The comparison that
matters: the **32** CRM calls above, against whatever the live run shows.
