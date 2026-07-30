# Product readiness — Phase 3

Application workflow panel, enrolment workspace, Student 360.

Verified by 52 offline tests and a production build. Anything not verifiable offline is marked
**unverified — needs the deployed app**.

---

## 1. What changed

### Files added

| File | Purpose |
|---|---|
| `client/src/components/Workflow.jsx` | Stage tracker, blocked-action reasons, transition dialog |
| `client/src/components/Record.jsx` | Contextual warnings, record tabs, internal-note dialog |
| `functions/zylker_api/test/workflow.test.js` | 8 tests over the workflow, note and permission rules |

### Files modified

| File | Change |
|---|---|
| `functions/zylker_api/index.js` | `workflow` block on application detail; `warnings` + `intakeUsage` on enrolment detail; `POST /api/notes` |
| `functions/zylker_api/writes.js` | `PIPELINE_ORDER`, `EXIT_STAGES`, `completedStages()`; transition accepts comment/decision date/documents status; `noteCreate` |
| `functions/zylker_api/auth.js` | Audit entries can carry a free-text note |
| `functions/zylker_api/permissions.js` | New `activity:write` permission |
| `functions/zylker_api/normalise.js`, `config.js` | `meta.crmUrl` for an "Open in Zoho CRM" link |
| `client/src/pages/ApplicationDetail.jsx` | Uses the workflow panel; breadcrumb names the record |
| `client/src/pages/EnrolmentDetail.jsx` | Warnings, reactivate, add note, invoices link, breadcrumb |
| `client/src/pages/Student360.jsx` | Rebuilt as tabs with an overview and quick actions |
| `client/src/components/ActivityLog.jsx` | Renders notes as text, never as a field diff |
| `client/src/pages/NewApplication.jsx`, `NewEnrolment.jsx` | Accept `?studentId=` |

---

## 2. Application workflow

A stage tracker showing the pipeline left to right, with each step marked **Passed**, **Current** or
**Not reached** — in words as well as colour. Below it: the available next actions, the reasons any
are blocked, the linked intake's capacity, and a link to the enrolment once one exists.

**The panel cannot disagree with the API.** `workflow` is computed on the server from the same
transition table `applicationTransition` validates against, so a button is never offered that is
guaranteed to 422, and "why is X not offered?" is answered by the server's own reason rather than by
a rule restated in the browser.

**Blocked actions carry reasons.** Each mirrors a check the write handler actually performs: no
linked student (an enrolment cannot be created), no programme or intake (a warning, not a block), and
a full intake, with the counts. A disabled button explains itself in text as well as in a tooltip,
because a touch user never sees a tooltip.

**Exits are not steps.** Rejected, Withdrawn and Deferred are held separately from the pipeline. An
application that left at Rejected is not claimed to have "passed" Under Review — a tracker that
showed it that way would be describing a process that does not exist.

### The transition dialog collects only what CRM can hold

| Field | Where it goes |
|---|---|
| Decision date | `Decision_Date`, and only on a decision stage. Blank means today. |
| Documents required | `Documents_Status`, and only when moving to Documents Pending. |
| Comment | The **activity trail**, attributed and timestamped. Not the CRM record. |

**Follow-up date and responsible staff member are not offered.** The Application module has no field
for either. Inventing an API name would fail at the CRM boundary, and accepting the values and
dropping them would be worse — the user would believe they were saved.

The comment mechanism needed nowhere to live either, so it rides inside the audit entry's JSON rather
than in a new Data Store column. That was deliberate: adding a column would mean a schema change an
existing deployment would not have, `insertRow` would fail against it, and the audit writer swallows
its own errors — the note would vanish silently while appearing to succeed.

---

## 3. Enrolment workspace

Server-computed contextual warnings across all three systems, sorted critical first:

| Warning | Severity |
|---|---|
| Intake belongs to a different programme than the enrolment | Critical |
| Intake over capacity | Critical |
| Last synchronisation to CRM ended in an error | Critical |
| No intake linked | Warning |
| No external learning record linked | Warning |
| No learner activity for 30 days on a course still in progress | Warning |
| Invoices overdue for this student | Warning |
| Intake exactly at capacity | Information |
| Invoices outstanding for this student | Information |

**Nothing here blocks an action.** An overdue invoice is stated next to an academic action, not used
to bar it — the warning even says so — because no business rule in this application requires it.

New actions: **Reactivate** for a cancelled enrolment (Completed is deliberately not reopened; that
would rewrite an outcome), **Add note**, and **Invoices**, which appears only when a Books customer
was actually resolved. A link with an empty customer filter would show every invoice in the org under
this student's name.

---

## 4. Student 360

Six tabs — Overview, Applications, Enrolments, Learning, Finance, Activity — with counts, arrow-key
navigation and the selected tab in the URL, so a link to a student's finances is one you can send.

**Overview** answers what someone opens the record to ask: identity, where they are in the process,
current programme and intake, latest application, active enrolment, average learning progress,
outstanding balance, recent activity. Each summary links to the tab holding the detail.

**Counts distinguish nothing from unknown.** A tab count of `null` renders no badge at all. The
Finance count is null when no Books customer was matched, because "0 outstanding invoices" would be a
claim this application cannot make about an unmatched student.

**Average progress excludes records that have never reported a percentage** rather than counting them
as zero, which would drag the average down for a course that simply has not reported yet.

Quick actions: Edit, Archive, New application, New enrolment (both pre-select this student), Add
note, Copy link, Open in Zoho CRM, Delete — each gated on the matching permission.

---

## 5. Verification

**Verified offline — 52 tests pass** (44 before, 8 new)

- `completedStages` returns nothing for the first step, three steps before Offer Issued, five before
  Enrolled, and **nothing at all for Rejected, Withdrawn or null**.
- No exit stage appears in the pipeline order.
- A transition comment reaches the audit entry and **never appears in the CRM payload** — asserted
  against `comment`, `Comment`, `followUpDate` and `responsibleStaff`.
- A supplied decision date is written; on a non-decision stage no decision date is invented.
- An impossible date (`2026-02-31`) is refused and **nothing is written**.
- Documents status is written when supplied; omitting it does not blank the existing value.
- A note performs no CRM create or update, reports no changed fields, and is refused for an unknown
  entity, an empty body, over 1000 characters, or a record that does not exist.
- `activity:write` is denied to Viewer and Finance, granted to Admissions, Academic and Administrator,
  and grants nothing else — Academic can note a student without being able to edit one.
- `POST /api/notes` returns 401 to an anonymous caller.
- Production build succeeds (70 modules, 361 kB JS / 96 kB gzip, 24 kB CSS).
- CI gates pre-checked: test count 52 (needs ≥25); credential regex finds nothing in `client/dist/`.

**Unverified — needs the deployed app**

Whether the workflow panel's blockers fire against real records · the audit note round-tripping
through the live Data Store · **the "Open in Zoho CRM" link format** (see limitations).

---

## 6. Deploy

```
cd ~/Desktop/zylker-academy-app
git add -A
git commit -m "Phase 3: workflow panel, enrolment workspace, Student 360 tabs"
git push origin main
```

Optional new environment variable: `ZOHO_CRM_APP_URL` (defaults to `https://crm.zoho.eu`).

## 7. Click-through checklist

1. Open an application. The stage tracker shows the pipeline, with the current step marked **Current**
   and earlier ones **Passed**.
2. Open a rejected or withdrawn application — no step should be marked Passed, and a note should
   explain that it left the pipeline.
3. Press a "Move to…" button. The dialog offers a decision date only on a decision stage, and a
   documents field only for Documents Pending.
4. Enter a comment and confirm. Check the Activity card: the comment appears as text, **not** as a
   changed field, attributed to you.
5. Open the application in Zoho CRM and confirm no comment was written to the record.
6. Expand "Why are the other stages not offered?" and confirm each reason names the current stage.
7. On an application with no linked student, confirm **Move to Enrolled** is disabled and the reason
   is listed in text below the buttons.
8. Open an enrolment. Confirm any warnings appear above the cards with a severity word.
9. Use **Add note** on the enrolment, then confirm it appears in Activity.
10. Sign in as a Viewer or Finance role if you have one — **Add note** should not appear.
11. Open a student. Move through the tabs with the arrow keys; confirm the URL gains `?tab=finance`
    and that reloading keeps you there.
12. For a student with no Books customer, confirm the Finance tab has **no count badge** and the
    Overview finance card explains why rather than showing a zero balance.
13. Use **New application** from a student — the student should be pre-selected.
14. Use **Copy link**, paste it, and confirm it opens the same student.
15. Try **Open in Zoho CRM** and tell me whether it lands on the right record (see below).

## 8. Remaining limitations

- **The "Open in Zoho CRM" link is unverified.** It is built as
  `https://crm.zoho.eu/crm/tab/<Module>/<id>` from `ZOHO_CRM_APP_URL`. If it does not land correctly
  in your org, the fix is one config value and one line in `normalise.js` — tell me what the working
  URL looks like and I will correct it.
- **Change Intake is not implemented.** Moving an enrolment between intakes needs capacity checking
  and a programme-match check on the target, and `enrolmentUpdate` does not accept an intake today.
  Doing it badly would let an enrolment land on an intake belonging to another programme — exactly
  the state the new warning exists to catch. It needs its own handler with its own tests.
- **Retry synchronisation and Link LMS learner** stay in the Learning Hub, where Phase 5 builds the
  mapping wizard. The enrolment page links there rather than duplicating half of it.
- Breadcrumb leaves are wired on Application, Enrolment and Student. Programme, Intake, Invoice and
  the Learning pages still read "Details".
- The 30-day inactivity threshold is still fixed in code; it becomes configurable in Phase 6.
