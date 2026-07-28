# Zylker Academy — what it does, what it solves, where it goes next

A working note for positioning this application with education customers, and a
roadmap of additions that make the case for Zoho Catalyst specifically.

---

## Part 1 — What the application does today

Zylker Academy is a staff portal that puts the whole student journey in one
place, on top of systems the institution already owns.

### The admissions and enrolment core

| Area | What staff can do |
|---|---|
| **Students** | Search and filter, create, edit, archive, delete when safe. Duplicate detection on normalised email. |
| **Applications** | Create against an existing or brand-new applicant, edit, move through admissions stages, withdraw, delete when permitted. |
| **Programmes** | Create, edit, activate/deactivate, map to a Zoho Learn course, delete only when nothing depends on them. |
| **Intakes** | Create, edit, open/close, with capacity, delivery method, location, dates, and live application/enrolment counts. |
| **Enrolments** | Create, edit, complete, cancel, delete when safe, with student/programme/intake links and Learn sync status. |

All of it reads and writes **live Zoho CRM records**. There is no separate
database to reconcile, and no nightly sync to go stale.

### The three integrations

- **Zoho CRM** — the operational system of record. Read and write.
- **Zoho Learn** — course catalogue, publication status, course URLs, mapped to
  CRM programmes by identifier where one is stored and by name otherwise
  (flagged as an inferred match, never silently). Read-only.
- **Zoho Books** — invoice list, detail, line items, payments, filters, and a
  per-student finance position. Read-only.

### The parts that make it a product rather than a set of forms

**Student 360.** One page holding personal details, current status,
applications, enrolments, programme and intake, the mapped Learn course, the
Books customer link, related invoices, outstanding balance and recent activity.
Each integration section loads independently, so Learn or Books being
unreachable degrades one card instead of the page.

**A dashboard where every figure names its source.** Nine KPIs badged CRM, Learn
or Books, each linking to the filtered list behind it. A source that fails reads
"Not available" — never zero. That distinction matters: "you have no overdue
invoices" and "we could not reach Books" are very different messages to give a
finance officer.

**Authentication and roles.** Catalyst embedded authentication; the application
never renders a password field. Five roles — Administrator, Admissions,
Academic, Finance, Viewer — decided in one permission matrix and enforced
server-side on every request. The UI hides what you cannot do; the function
refuses it regardless.

**Correctness controls that reflect how admissions actually goes wrong:**

- Stage transitions validated against a table, so an application cannot jump
  from Submitted to Enrolled.
- Reaching Enrolled provisions exactly one enrolment, idempotently — a repeated
  click or a retried request cannot create a second one.
- An intake must belong to the chosen programme.
- Capacity enforced per intake, overridable only by an administrator who
  explicitly confirms it.
- Duplicate students prevented on normalised email.
- Optimistic concurrency: two people editing the same record, and the second one
  is told rather than silently overwriting the first.
- Records with dependants are not deleted; the refusal names what is blocking.
- Every mutation is re-read from CRM before being reported as done.
- Every change is written to an audit trail with who, what, when and which
  fields — attributed to the authenticated user.

---

## Part 2 — The real problems this solves

### "Where is this applicant up to?"

In most institutions the answer lives across a spreadsheet, an inbox, the
finance system and someone's memory. The consequence is not just inefficiency —
it is applicants who go cold because nobody was sure whose turn it was. Student
360 makes that one page, and admissions stages make "whose turn is it" explicit
and enforced.

### Double-enrolment and double-charging

The single most common data-integrity failure in admissions is the same student
enrolled twice, because two people processed the same offer acceptance, or
because someone clicked twice on a slow connection. This application makes that
structurally impossible rather than unlikely: enrolment provisioning finds
before it creates.

### Overselling a cohort

Capacity is enforced at the point of enrolment, showing places remaining as
staff choose an intake. Going over requires an administrator to consciously
override — which is a legitimate thing to do, but now it is a decision with a
name attached rather than an accident.

### "Have they paid?"

Admissions staff routinely need a finance answer and do not have Books access.
Student 360 shows the invoice position beside the academic record, read-only, so
nobody needs a second login or a phone call to the bursar.

Crucially, when the link between a student and a Books customer is **ambiguous**
— two customers sharing an email — the application shows nothing and says why.
An unresolved link is recoverable; showing one student another's finances is a
data-protection incident.

### Institutional memory

The audit trail answers "who changed this offer, and when" — the question that
surfaces during an appeal, an audit, or a regulator's inspection, usually months
after the person who did it has forgotten.

### Data quality, enforced where it is created

CRM will happily store an end date before its start date, or a year of 0006.
Validation at the point of entry keeps the CRM clean for every other system that
reads it — reporting, marketing, statutory returns.

---

## Part 3 — Improvements that sharpen the Catalyst value case

The honest position today: this application uses Catalyst as **authentication +
serverless functions + a credential broker**. That is real value — no OAuth
token ever reaches the browser, and the whole thing deploys with one command —
but it is a fraction of the platform. Everything below is a genuine education
problem that also happens to showcase a Catalyst capability the customer is
paying for.

### Tier 1 — high value, low effort

**1. Nightly finance reconciliation** · *Catalyst Cron*
The `Finance_Status` field on enrolments is maintained by hand and drifts from
Books immediately. A scheduled job that reconciles it every night, and reports
what it changed, removes a whole category of "the system says one thing and
Books says another".
→ *Shows: scheduled jobs with no server to maintain.*

**2. Application-deadline and intake-start reminders** · *Catalyst Cron + Zoho Mail/Cliq*
Applicants who miss a deadline by two days are lost revenue. A daily job that
emails applicants with incomplete documents, and alerts staff to intakes filling
up or starting soon, turns the portal from a place you check into a system that
tells you.
→ *Shows: event-driven automation across the Zoho estate.*

**3. Offer letters and invoices as PDFs** · *Catalyst SmartBrowz + Stratus*
Generate a branded offer letter from the CRM record at the moment the stage
changes, store it in object storage, attach it to the student. Today this is a
manual mail-merge in every institution I have seen.
→ *Shows: document generation and object storage without third-party services.*

**4. A real-time admissions funnel** · *Catalyst Cache*
Dashboard aggregates currently re-query CRM on every load. Caching them makes
the dashboard instant and cuts CRM API consumption — which matters, because CRM
API limits are a genuine constraint at scale.
→ *Shows: managed caching as a first-class primitive.*

### Tier 2 — the differentiators

**5. Applicant self-service portal** · *Catalyst Authentication + AppSail*
Let applicants track their own application, upload documents and accept offers.
This is the single highest-value addition: it removes the largest source of
inbound admissions email entirely. The authentication layer already built here
extends to external users.
→ *Shows: one platform serving both staff and public-facing applications.*

**6. Document upload and verification** · *Catalyst Stratus + Zia OCR*
Passports, transcripts, English-language certificates. Store them, OCR them,
extract the fields, flag mismatches against the application. Document chasing is
where admissions teams lose most of their week.
→ *Shows: AI services integrated rather than bolted on.*

**7. Enrolment-likelihood scoring** · *Catalyst QuickML*
Train on historic applications to predict which offer-holders will actually
enrol. Institutions over-offer by guesswork; a model turns that into a number,
and directly affects revenue forecasting and cohort planning.
→ *Shows: ML on the customer's own data, no data science team required.*

**8. Two-way Zoho Learn provisioning** · *Catalyst Functions + Circuits*
Today Learn is read-only and enrolment sync is manual. Automatically create the
learner and enrol them on the mapped course when an enrolment is created, then
sync progress back. This is the loop that makes the CRM record tell the truth
about whether a student is actually studying.
→ *Shows: orchestration across Zoho apps with retry and error handling.*

**9. Attendance and at-risk alerts** · *Catalyst Circuits + Signals*
Combine Learn progress, attendance and finance status into an at-risk flag, and
alert the student's tutor. Retention is worth more than recruitment to most
institutions, and nobody currently has this view.
→ *Shows: multi-source workflow orchestration.*

### Tier 3 — platform proof points

**10. Statutory reporting exports** · *Catalyst Functions + Stratus*
UK HESA, EU equivalents, accreditation bodies. A scheduled export in the
required schema, versioned in object storage. Every institution does this
manually, painfully, once a year.

**11. Multi-campus data isolation** · *Catalyst Authentication + row-level rules*
Extend the permission layer so a campus administrator sees only their campus.
The role matrix is already centralised in one file, so this is an extension
rather than a rewrite.

**12. Zia-powered application triage** · *Catalyst Zia*
Summarise a personal statement, flag applications needing human review, detect
sentiment in applicant correspondence.

**13. A parent/sponsor view** · *Catalyst Authentication*
Sponsors and parents who fund study want to see progress and invoices without
staff intervention.

---

## Suggested demo narrative

1. **Sign in** — Catalyst authentication, no password handling in the app.
2. **Dashboard** — nine live figures, each badged with its source system.
3. **Create an application** for a brand-new applicant — one flow, no duplicate
   student created.
4. **Walk it to Enrolled** — an enrolment appears automatically. Click again:
   still one enrolment.
5. **Try to oversell an intake** — refused, with an administrator override.
6. **Student 360** — CRM, Learn and Books on one page.
7. **Break Books** (unset the org id) — dashboard still loads, one card reads
   "Not available".
8. **Sign in as Admissions instead of Administrator** — Finance disappears from
   the navigation, and the API refuses it too.

Point 7 is the one technical audiences remember: graceful degradation across
three integrations is the difference between a demo and a system.

---

## Current status, stated plainly

**Verified against the live deployment:** authentication and role resolution;
student create and read-back; application create; Books invoice retrieval;
Learn course catalogue; the production build; and 29 offline tests covering the
permission matrix, stage transitions, idempotent enrolment, capacity, duplicate
prevention, date validation and payload allow-listing.

**Not yet verified end-to-end:** the full checklist in `DEPLOYMENT.md` §5 —
notably the capacity override, delete-refusal paths, and Student-to-Books
matching against a student with an ambiguous email.

**Known limitations:** Learn and Books are read-only this phase; CRM Contacts has
no Books customer-id field so student-to-invoice matching relies on exact email;
Books totals on the dashboard are capped and flagged "Partial" beyond that; CRM
lists are capped at 200 rows per module per request.
