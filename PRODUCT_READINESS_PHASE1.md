# Product readiness — Phase 1

Global application shell, global Create menu, global search, consistent loading and error states.

Everything below is either verified by the offline suite (`node --test`), by a production build, or
marked explicitly as **unverified — needs the deployed app**.

---

## 1. Initial audit

### Routes and pages that already existed

| Area | Frontend routes | Backend endpoints |
|---|---|---|
| Identity | `/login` | `GET /api/me` |
| Dashboard | `/dashboard` | `GET /api/dashboard` |
| Students | `/students`, `/students/new`, `/students/:id`, `/students/:id/edit` | list, detail, create, update, archive, delete |
| Applications | `/applications`, `/applications/new`, `/applications/:id` | list, detail, create, update, transition, archive, delete |
| Enrolments | `/enrolments`, `/enrolments/new`, `/enrolments/:id` | list, detail, create, update, archive, complete, delete |
| Programmes | `/programmes`, `/programmes/:id` | list, detail, create, update, set-active, delete |
| Intakes | `/intakes`, `/intakes/:id` | list, detail, create, update, set-status, delete |
| Learning Hub | `/learning/courses`, `/learning/courses/:id`, `/learning/enrolments`, `/learning/enrolments/:id`, `/learning/sync-log` | list/detail/create/update/archive/map/sync/bulk-sync for courses and enrolments |
| Finance | `/invoices`, `/invoices/:id` | list, detail, per-student invoices (read-only) |
| Integration | `/integration` | `GET /api/integration-status`, `GET /api/diag` |

### Implementation matrix

**Existing and reusable — left alone**

- `permissions.js`: role → permission matrix, wildcard administrator, fail-closed unknown role.
- `auth.js`: `requireAuth` → `requirePermission` on every route; origin check, rate limit, JSON check,
  idempotency replay on writes.
- `normalise.js`: one shaping function per CRM module, `null` never coerced to `0`.
- `useApi.js`: `useApi` / `usePagedList` / `useDebounced` / `useAction` — loading, error, abort,
  server-side pagination and filter reset already correct.
- `Ui.jsx`: `Async`, `Loading`, `Empty`, `ErrorState`, `Pagination`, `SourceBadge`, `DemoDataBadge`,
  `Progress`, `Kpi`, toasts, `Modal`, `ConfirmDialog`.
- Books customer matching priority (stored id → verified identifier → exact email → unmatched, never by name).

**Required improvement — done in this phase**

- Shell was a bare sidebar plus a right-aligned user button. No header, no search, no Create,
  no breadcrumbs, no environment badge, no mobile behaviour (the sidebar reflowed into a nine-item
  row that pushed content below the fold).
- Sidebar had no icons, no collapse, no tooltips.

**Missing — deferred to later phases, as scheduled in the spec**

Attention queue and actionable dashboard (Phase 2) · workflow panel, enrolment workspace,
Student 360 tabs (Phase 3) · saved views, bulk actions, CSV export, column config (Phase 4) ·
LMS mapping wizard and simulate-update (Phase 5) · notifications centre, finance reconciliation
queue, Settings area (Phase 6) · full accessibility and performance pass (Phase 7).

**Out of scope**

Zoho Learn (removed, not reintroduced) · Books writes (read-only this phase) ·
live LMS connections (the dataset is Catalyst-hosted demonstration data and is labelled as such).

### Findings worth recording

- No UI action was found that lacked a server-side permission check. Every write route resolves a
  permission through `requirePermission`; hiding a control is presentation only.
- No credential of any kind appears in the client bundle. The only Zoho-shaped string is the literal
  text `ZOHO_BOOKS_ORG_ID` in Integration Status help copy — the name of an environment variable,
  not a value.

---

## 2. What changed

### Files added

- `client/src/components/Shell.jsx` — header, sidebar, breadcrumbs, global search, Create menu, About.

### Files modified

| File | Change |
|---|---|
| `client/src/App.jsx` | Shell extracted; `NAV` now drives the menu; routes untouched |
| `client/src/AuthContext.jsx` | Carries the server-reported `environment` |
| `client/src/api.js` | `api.search(q)` |
| `client/src/pages/Programmes.jsx` | Opens its existing create dialog on `?new=1` |
| `client/src/pages/Intakes.jsx` | Same |
| `client/src/styles.css` | Header, breadcrumbs, popups, search, collapsed rail, mobile drawer, skip link |
| `functions/zylker_api/index.js` | `GET /api/search`; `environment` on `/api/me` |
| `functions/zylker_api/test/api.test.js` | Search added to the anonymous-rejection list; new search behaviour test |

### Backend endpoints

- **`GET /api/search?q=`** — new. Authenticated. Declares no single permission because the set it
  covers depends on the role: it checks `student:read`, `application:read`, `enrolment:read`,
  `programme:read` and `intake:read` individually and **only fetches the modules the caller may read**,
  so an unauthorised module is never retrieved, let alone filtered afterwards. Minimum query 2
  characters, 5 results per entity, grouped by entity, each result carrying label, secondary line,
  reference and a direct link.
- **`GET /api/me`** — now also returns `{ environment: { name, label } }`, derived from the request
  host (`*.development.*` → Development) with a `ZYLKER_ENVIRONMENT` override.

### Frontend routes

No routes added or removed. `/programmes?new=1` and `/intakes?new=1` are read by those pages to open
the create dialog that already existed, rather than building second forms.

---

## 3. Phase 1 features

**Global header** — breadcrumbs, global search, environment badge, Create menu, Help/About, user
name + role + sign out, and a hamburger on mobile.

**Global Create** — New student / application / enrolment / programme / intake, each shown only when
the role holds the matching `:write` permission. A role that may create nothing gets no button at all.
*New LMS demonstration record is deliberately absent:* no create form exists for it yet, and it is
scheduled for Phase 5 with the mapping wizard. A menu item leading nowhere would be worse than none.

**Global search** — debounced 300 ms, minimum 2 characters, superseded requests aborted so a slow
early keystroke cannot overwrite later results. Grouped by entity with "showing 5 of 23" when
truncated. Full keyboard operation: `⌘K`/`Ctrl+K` to focus, arrows to move, Enter to open, Escape to
close, with `role="combobox"`/`listbox`/`option` and `aria-activedescendant`. Distinct loading,
too-short, no-results and error states; a 403 is worded as a permission problem, not a failure.

**Sidebar** — icons, active route via `aria-current`, collapsible rail with tooltips and aria-labels
when collapsed, off-canvas drawer on mobile with scrim, Escape-to-close and focus moved into it.
Collapse preference stored under `zylker:<user id>:navCollapsed`, so two people sharing a browser
profile do not inherit each other's layout.

**Breadcrumbs** — on every path deeper than one segment. `useBreadcrumbLeaf(label)` is exported so
Phase 3's detail pages can replace "Details" with the record's own name.

**Also added** — a skip-to-content link, and an About dialog stating plainly that Books is read-only
and the Learning Hub is a Catalyst demonstration dataset.

**Authentication is unchanged.** Routes stay behind `AuthProvider`, no data call can be issued before
`status === 'authenticated'`, and every backend endpoint still validates the user independently.

---

## 4. Verification

**Verified offline**

- `node --test` — **33/33 pass** (32 before, plus the new search test).
- `GET /api/search?q=…` returns 401 `UNAUTHENTICATED` when anonymous.
- A 1-character query returns `meta.tooShort` and **issues zero CRM queries**.
- A name matching a student, an application title and an enrolment's student groups under all three.
- Searching `INT-0090` returns only the intake and links to `/intakes/90` — references are searchable.
- A term nobody holds returns `total: 0` and an empty group list, not an error.
- Production build succeeds: 67 modules, 337 kB JS (89.5 kB gzip), 18.5 kB CSS.
- Bundle credential scan: no client secret, refresh token, OAuth id or API host.

**Unverified — needs the deployed app** (please run the checklist below)

Live search results against the real CRM org · the environment badge reading "Development" on the
development gateway · mobile drawer behaviour on a real device · the `?new=1` dialogs opening.

---

## 5. Deploy

Deployment is by push. `.github/workflows/deploy.yml` runs `verify` (function deps → 33 tests →
test-count assertion → `npm ci` + client build → credential scan of the bundle) and, only if that
passes on `main`, `deploy` (unique client version from the run number → build → `catalyst deploy`
with `CATALYST_TOKEN` → smoke test of `/api/health` and an anonymous `/api/students`).

```
cd ~/Desktop/zylker-academy-app
git add -A
git commit -m "Phase 1: global shell, Create menu and global search"
git push origin main
```

Pre-checked locally against the exact CI gates:

- test count `33` — the workflow requires at least 25.
- the workflow's credential regex
  (`client_secret|refresh_token|access_token|1000\.[a-f0-9]{32}|jwtSecret`) finds nothing in `client/dist/`.
- production build succeeds.

Nothing in this phase needs a new environment variable. `ZYLKER_ENVIRONMENT` is available as an
override for the header badge but is not required — the badge is derived from the request host.

A local `catalyst deploy --only functions,client -p 11922000000014048` still works if you want to
skip CI, but it bypasses the test and credential gates.

## 6. Click-through checklist

1. Sign out, load a deep link such as `#/students`, confirm the login screen appears and that after
   signing in you land on that page.
2. Header shows your name, your role, and a **Development** badge.
3. Type `mur` (or any two letters that exist) in the search box — results appear grouped by entity.
4. Press `⌘K` from anywhere; the search box takes focus.
5. Arrow down through results across a group boundary, press Enter, confirm you land on that record.
6. Search a reference such as `STU-0001` or an intake id; confirm it matches.
7. Search `zzzznotarecord`; confirm "No records match", not an error.
8. Open **Create** — confirm you only see entries your role can act on. Choose **New programme**;
   the dialog opens and the `?new=1` disappears from the URL. Press Back — the dialog must not reopen.
9. Open a detail page; confirm breadcrumbs appear and each parent crumb navigates.
10. Collapse the sidebar; hover an icon and confirm the tooltip. Reload — it stays collapsed.
11. Narrow the window below ~900 px: the sidebar becomes a drawer. Open it, press Escape, confirm it
    closes. Tap a link and confirm it closes on navigation.
12. Press Tab from the top of the page: the first stop is **Skip to main content**.
13. Open **Help** and confirm the About text.
14. Sign in as a lower-privileged role if you have one and confirm the Create menu shrinks and search
    returns nothing it should not.

## 7. Remaining limitations

- Search caps at 200 rows per module (the existing `MAX_ROWS` COQL ceiling) and 5 shown per entity.
  On a large org a match beyond that ceiling would be missed; moving to CRM-side search is a
  Phase 4/7 performance item.
- No notifications indicator in the header yet — Phase 6.
- Breadcrumb leaves on detail pages read "Details" until Phase 3 wires `useBreadcrumbLeaf`.
- The five business roles still resolve through `ZYLKER_ROLE_MAP`, unchanged by this phase.
