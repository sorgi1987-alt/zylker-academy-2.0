# Zylker Academy — deployment and verification runbook

Everything below has to run on your machine: the Catalyst CLI and its
credentials live there, not in my session. Work through it in order — the
Catalyst environment variables and the Books connection must exist *before* the
first deploy, or the Finance section will report "not configured" and the
identity diagnostics will be harder to read.

---

## 1. Catalyst environment variables

Console → your project → **Settings → Environment Variables** (Development).

| Variable | Required | Value | Why |
|---|---|---|---|
| `ZOHO_BOOKS_ORG_ID` | Yes, for Finance | Your Books organisation id | Never guessed in code. A wrong id silently returns another org's data or an empty list. |
| `ZOHO_DESK_ORG_ID` | Yes, for Support | Your Desk organisation id | Distinct from the Books org id. Sent as an `orgId` header on every Desk call; never guessed in code. |
| `ZYLKER_ROLE_MAP` | Optional | `{"sergio.castanares+admissions@zohotest.com":"admissions"}` | Maps an email to one of `administrator`, `admissions`, `academic`, `finance`, `viewer`. |
| `ZYLKER_DEFAULT_ROLE` | Optional | `viewer` | Role for any authenticated user not in the map. Defaults to `viewer`. |
| `AUDIT_TABLE` | Optional | `admissions_audit` | Data Store table for the audit trail. |
| `MUTATION_RATE_LIMIT` | Optional | `60` | Mutations per user per minute, per function instance. |
| `REFERENCE_PREFIX` | Optional | `TEST` | Tags every reference this deployment mints, e.g. `TEST-STU-M4X1PQ2A`. Set it for a verification run, then clear it. |
| `ZOHO_BOOKS_PAGE_SIZE` | Optional | `50` | Invoices per page. |
| `ZOHO_BOOKS_MAX_PAGES` | Optional | `10` | Ceiling on pages walked for the dashboard totals. |
| `RECONCILE_SECRET` | Yes, for reconciliation | a long random string | Read-model PoC (kickoff-prompt.md). Authorizes `POST /api/admin/reconcile-sync` — this route has no Catalyst session behind it (it's called by a Cron Job, not a signed-in user), so it's gated by this shared secret sent as an `x-reconcile-secret` header instead of `requireAuth`. Unset means the route refuses every call. |

**Note for this project specifically:** environment variables here are set at the
**function level** (Console → your function → Settings → Environment
Variables), not the project level the rest of this section describes —
confirmed for `Zylker-Academy-Signals`. Set them once the `zylker_api`
function exists (i.e. after the first deploy).

### Reconciliation Cron jobs (read-model PoC, phase 7)

Once `zylker_api` is deployed and `RECONCILE_SECRET` is set, create 3 Cron
Jobs (Console → **Job Scheduling → Cron** → New Cron, or the
`Create_Cron_Job` management API) — all with **target type: Webhook**,
**method: POST**, **URL**: `https://<your-domain>/server/zylker_api/api/admin/reconcile-sync`,
and a custom header `x-reconcile-secret: <the same value as RECONCILE_SECRET>`.
Body per job, matching `reconciliation.js`'s `SCHEDULE_TIERS`:

| Cron name | Schedule | Body |
|---|---|---|
| `reconcile-15min` | every 15 minutes | `{"entities":["applications","enrolments"]}` |
| `reconcile-hourly` | hourly | `{"entities":["students"]}` |
| `reconcile-daily` | daily | `{"entities":["programmes","intakes"]}` |

These aren't created yet — there's no deployed URL to point them at until
after the first deploy.

Do **not** set `ZYLKER_AUTH_BYPASS`. It exists only for a local harness and
would make every request unauthenticated-but-allowed.

To find the Books organisation id: Zoho Books → **Settings → Organisation
Profile**, or `GET https://www.zohoapis.eu/books/v3/organizations` with a token
that has `ZohoBooks.settings.READ`.

## 2. Zoho Books Catalyst Connection

The project currently has `zylker_zoho` (CRM) and `zylker_learn`. Books needs a
third.

Console → **Integrations → Catalyst Connectors → New Connection**

- **Connection name:** `zylker_books` — this exact string, or set `BOOKS_CONNECTION` to whatever you use.
- **Service:** Zoho OAuth (EU accounts domain, matching the rest of the estate).
- **Scopes:**
  - `ZohoBooks.invoices.READ`
  - `ZohoBooks.contacts.READ`
  - `ZohoBooks.settings.READ` *(only if you want the org lookup to work; the app does not require it)*

Read scopes only. The application has no route that writes to Books, so a write
scope would grant reach it never uses.

While you are there, confirm `zylker_zoho` carries CRM **write** scopes for the
five modules — `ZohoCRM.modules.contacts.ALL`, `.deals.ALL`, `.products.ALL`,
and the custom `Intakes` / `Enrolments` modules — plus
`ZohoCRM.settings.modules.READ` and `ZohoCRM.settings.fields.READ`, which the
module-label and picklist lookups use.

## 2b. Zoho Desk Catalyst Connection

The project now needs a fourth connection alongside `zylker_zoho` (CRM),
`zylker_learn` and `zylker_books`.

Console → **Integrations → Catalyst Connectors → New Connection**

- **Connection name:** `zylker_desk` — this exact string, or set `DESK_CONNECTION` to whatever you use.
- **Service:** Zoho OAuth (EU accounts domain, matching the rest of the estate).
- **Scopes:**
  - `Desk.tickets.READ`
  - `Desk.contacts.READ`
  - `Desk.basic.READ` *(baseline scope Desk requires for most API calls)*
  - `Desk.search.READ` *(required — Desk puts search endpoints, e.g.
    `/contacts/search`, behind their own scope, separate from
    `Desk.contacts.READ`. Missing this produces a `SCOPE_MISMATCH` error
    specifically on the student-to-contact email lookup, confirmed against a
    live deployment on 11 Aug 2026 — not a guess.)*

Read scopes only. The application has no route that writes to Desk, so a write
scope would grant reach it never uses.

If you add `Desk.search.READ` to a connection that was already authorised
without it, saving the new scope list is not enough — you must **re-authorise**
the connection for Zoho to reissue a token that actually carries it.

To find the Desk organisation id: Zoho Desk → **Setup → Developer Space**, or
`GET https://desk.zoho.eu/api/v1/organizations` with a token that has
`Desk.basic.READ`. It is a different id from `ZOHO_BOOKS_ORG_ID`.

## 3a. Deploying from GitHub (recommended)

`.github/workflows/deploy.yml` is ready to go. It mirrors the workflow already
running for your CRM 2.0 project, with two additions: the test suite gates the
deploy, and the deployment is smoke-tested afterwards.

**One-time setup**

1. Create the repository on GitHub (private — this deploys to a live CRM org).
2. Add a repository secret named `CATALYST_TOKEN`, generated the same way as
   the one for CRM 2.0. Never commit it; the workflow reads it from the secret.
3. Push:

```bash
cd ~/Desktop/zylker-academy-app
git add -A
git commit -m "Authenticated education management portal"
git branch -M main
git remote add origin git@github.com:<you>/zylker-academy-app.git
git push -u origin main
```

**What runs**

| Job | Trigger | Does |
|---|---|---|
| `verify` | every push **and** pull request | installs deps, runs the 54 backend tests, builds the client, and greps the bundle for credential-shaped strings |
| `deploy` | pushes to `main` only, and only if `verify` passed | bumps the client version, rebuilds, deploys functions + client, then smoke-tests |

Three details worth knowing:

- **The client version is bumped per run.** Catalyst rejects a client version it
  has already seen, so the workflow rewrites `client/client-package.json` to
  `1.<run-number>.0`. Note this project copies that file from `client/`, not
  `client/public/` as CRM 2.0 does — the build script differs.
- **The smoke test asserts `/api/students` returns 401** to an anonymous caller.
  If the authentication layer ever regresses, the deploy fails rather than
  quietly shipping an open API over a live CRM org.
- **`client/dist/` is gitignored** and built in CI. `catalyst.json` points at it,
  so it must exist at deploy time — which the workflow guarantees.

**Adding an approval gate.** The `deploy` job declares
`environment: development`. Create that environment in GitHub with a required
reviewer and every deploy waits for a human. Worth doing before this points at
a production org.

## 3b. Deploying from your machine

```bash
cd ~/Desktop/zylker-academy-app/functions/zylker_api
npm test                     # 54 offline tests; all should pass

cd ~/Desktop/zylker-academy-app/client
npm install
npm run build

cd ~/Desktop/zylker-academy-app
catalyst deploy --only functions,client -p 11922000000133164
```

## 4. The identity problem — resolved 28 July 2026

The first deployment looped on the sign-in screen. Diagnosed in the browser
against the live deployment, the cause was two separate faults:

**Fault 1 — the loop.** `catalyst.auth.signIn()` is not "show a form". When the
browser already holds a valid session it takes the post-login path immediately
and redirects back to the app. The app then asked the server, was refused,
rendered the sign-in screen, called `signIn()` again, and reloaded — forever.
`Login.jsx` now checks for an existing browser session first and never calls
`signIn()` when one exists.

**Fault 2 — the server could not see the session.** Confirmed by calling
Catalyst's own endpoint from the browser:

| Call | Result |
|---|---|
| `/baas/v1/project/…/project-user/current` with session cookies | **200**, full user record (Sergio, App Administrator) |
| the same, without the CSRF header | **200**, full user record |
| the same, with **no credentials** | **401**, no record |
| `zcatalyst-sdk-node`'s `getCurrentUser()` inside the function | `null` |

So the platform endpoint resolves the session perfectly well; the SDK wrapper
does not. `identity.js` gained a fifth strategy, `catalyst_session_forwarded`,
which forwards the caller's session cookies — unread — to that endpoint and
takes the identity from Catalyst's reply.

**This is not the `x-zc-user-*` mistake.** That approach read an identity
*claim* out of a header (`x-zc-user-id: 12345` — anyone can type that). This
forwards a *credential* and has it validated by its issuer, and the third row of
that table is the proof: with no credentials the endpoint returns 401 and
resolves nobody. The `Host` header used to address the endpoint is checked
against the Catalyst domain, so a spoofed Host cannot point session validation
at a server that would answer "yes, they're an administrator". Both properties
are covered by tests.

The four SDK strategies are still tried first, so if Zoho fixes `getCurrentUser()`
the documented path wins automatically. After deploying, check **Integration
Status → Identity resolved by** to see which one answered.

## 5. Verification checklist

Tick these off against the deployed app. The offline suite already covers the
logic; these cover the platform.

**Authentication**

1. Open the app in a private window → branded sign-in screen, no application data.
2. `curl -s -o /dev/null -w '%{http_code}' <function-url>/api/students` → `401`.
3. Sign in → the app loads; the sidebar shows your name and role.
4. Reload the page → still signed in, no second sign-in prompt.
5. Deep-link to `#/invoices` while signed out → after signing in you land on `/invoices`, not the dashboard.
6. Sign out from the user menu → returned to the sign-in screen; browser back does not restore data.

**CRM create / read-back** — set `REFERENCE_PREFIX=TEST` first, and name records `TEST-…`.

7. Create a student `TEST-Student One` → open the record → the fields you entered are shown (this is a read-back from CRM, not the form's own state).
8. Edit it → reload → the change persisted.
9. Create a student with the same email → refused, `409`, "already exists".
10. Create a programme `TEST-Programme`, then an intake `TEST-Intake` under it with capacity 1.
11. Create an application for the test student on `TEST-Programme`, choosing an intake belonging to a *different* programme → the intake is not offered; if you force it via the API, `422 INTAKE_PROGRAMME_MISMATCH`.
12. Move the application Submitted → Under Review → Offer Issued → Offer Accepted → Enrolled. At Enrolled an enrolment appears and the student becomes Active.
13. Press the Enrolled transition again (or replay the request) → **no second enrolment**. Check the Enrolments list.
14. Enrol a second student into `TEST-Intake` (capacity 1) → `409 INTAKE_AT_CAPACITY`. As an administrator, tick the override → it proceeds.
15. Try to delete `TEST-Programme` → refused while the intake exists. Delete the enrolment, application, intake, then the programme.

**Integrations**

16. Course Catalogue loads; programmes with no Learn course still appear, with unavailable fields labelled.
17. Finance loads invoices; Next/Previous page through them; open one and confirm line items.
18. Open the Student 360 for a student with a Books customer → the invoice card states how the link was made ("stored Books customer id" or "exact email match").
19. Temporarily break Books (clear `ZOHO_BOOKS_ORG_ID`, redeploy) → the dashboard CRM cards still load and the Books cards read "Not available"; Student 360 still renders. Restore it afterwards.
20. Open the Student 360 Support tab for a student with a Desk contact → the ticket card states how the link was made, and the tab count matches the open-ticket count shown on the Overview tab. Support (`/tickets`) lists and paginates.
21. Temporarily break Desk (clear `ZOHO_DESK_ORG_ID`, redeploy) → the dashboard and Student 360 still render, the Support KPIs and connection dot read "Not available" / "Unavailable", and nothing else on the page is affected. Restore it afterwards.

**Client bundle**

22. `grep -aiE 'client_secret|refresh_token|access_token|1000\.[a-f0-9]{32}' client/dist/assets/*.js` → no matches. (Verified clean at build time in this session.)

## 6. Assigning roles later

Catalyst itself only has "App Administrator" and "App User", so the five
business roles live in `ZYLKER_ROLE_MAP`. To give someone the Admissions role:

1. Add them as a project user in the Catalyst console.
2. Add `"their.email@domain":"admissions"` to `ZYLKER_ROLE_MAP`.
3. Redeploy the function (environment variables are read at request time, but the
   parsed map is cached per container, so a redeploy makes it immediate).

If Catalyst later supports custom roles, add a branch to `roleFor()` in
`functions/zylker_api/permissions.js` that reads `user.catalystRole`. Nothing
else in the application needs to change — that function is the only place a role
is decided.

## 7. Known limitations

- **Catalyst identity is unproven on this project.** Four resolution strategies are
  attempted; if none answers, every request is `401`. This is the open Zoho
  support question and is the one thing that cannot be worked around safely:
  the platform `x-zc-user-*` headers are client-injectable on this gateway, so
  trusting them would make authorization bypassable.
- **`zcatalyst-sdk-node` is at 3.4.0**, which is the latest published version
  (checked 28 Jul 2026) — there is no newer SDK to upgrade into.
- **Books totals on the dashboard are capped** at `ZOHO_BOOKS_MAX_PAGES` pages.
  Beyond that the figure is flagged "Partial" rather than presented as complete.
- **Books gives no total invoice count**, so the Finance list shows "Page n" with
  a Next button rather than "page n of m".
- **CRM lists are capped at 200 rows per module** per request and paginated in the
  function. A list at the cap says so. Cross-entity enrichment (counting a
  programme's enrolments, resolving an applicant's email) is why paging is not
  pushed into COQL.
- **Rate limiting and idempotency are per function instance**, so with several
  instances the effective mutation ceiling is the limit times the instance
  count. The durable no-duplicate-enrolment guarantee is the find-before-create
  logic in `writes.js`, not the idempotency cache.
- **No Books customer id field exists on CRM Contacts** (verified against live
  metadata — `Zoho_Books_Customer_ID`, `Books_Customer_ID` and
  `Books_Contact_ID` all return `INVALID_QUERY`). Student-to-Books matching
  therefore falls to exact normalised email. The code already reads a stored id
  first and will start using it the day such a field is added, with no code
  change. Adding it is a CRM metadata change and I have not made one.
- **Learn, Books and Desk are read-only** in this phase, by design.
- **The Support ticket list filters by `statusType`** (Open / Closed / On Hold —
  Desk's own fixed enum), not by the organisation's custom status labels.
  Custom status names are not resolved live because doing so would need the
  `Desk.settings.READ` scope, which the connection deliberately does not carry.
- **No Desk contact id field exists on CRM Contacts** — this has not been
  verified against this org's live metadata (unlike the equivalent Books
  claim above, which was checked directly). Student-to-Desk matching
  therefore falls to exact normalised email until `Zoho_Desk_Contact_ID` or
  `Desk_Contact_ID` is confirmed to exist or is added. The code already reads
  a stored id first and will start using it the day such a field is added,
  with no code change.
