# Product readiness — Phase 2

Actionable dashboard, needs-attention queue, dashboard-to-filtered-list navigation.

Verified by 44 offline tests and a production build. Anything not verifiable offline is marked
**unverified — needs the deployed app**.

---

## 1. What changed

### Files added

| File | Purpose |
|---|---|
| `functions/zylker_api/attention.js` | The attention rules, as a pure function |
| `functions/zylker_api/test/attention.test.js` | 11 tests over those rules |
| `client/src/components/Attention.jsx` | The "Needs attention" panel |

### Files modified

| File | Change |
|---|---|
| `functions/zylker_api/index.js` | `GET /api/attention`; extended dashboard metrics, funnel, ageing; new list filters |
| `functions/zylker_api/books.js` | `invoiceTotals` now returns ageing buckets, overdue balance, oldest overdue, invoiced/paid totals |
| `functions/zylker_api/lms.js` | `status()` counts inactive learners |
| `client/src/pages/Dashboard.jsx` | Rebuilt |
| `client/src/components/Ui.jsx` | `FilterChips`, `Funnel`, `MoneyBarList` |
| `client/src/useApi.js` | `clearFilters`, `activeFilterCount` |
| `client/src/api.js` | `api.attention()` |
| `client/src/pages/Applications.jsx`, `Enrolments.jsx`, `Intakes.jsx`, `Invoices.jsx`, `LearningEnrolments.jsx` | Seed filters from the URL, show active-filter chips |
| `client/src/styles.css` | Chips, attention rows, funnel, section headings |

### Backend endpoints

**`GET /api/attention`** — new, `dashboard:read`. Returns `{ items, worstSeverity, total }` plus a
per-source status in `meta`. It is a separate endpoint from `/api/dashboard` on purpose: the panel
loads, fails and retries on its own, so a slow Books aggregation delays one card rather than the page.

**`GET /api/dashboard`** — extended, not replaced. New: `applicationsAwaitingAction`,
`offersAwaitingResponse`, `conversionRate`, `intakeCapacityWarnings`, `enrolmentsWithoutLmsMapping`,
`inactiveLearners`, `overdueBalance`, plus `admissionsFunnel`, `admissionsExits`,
`enrolmentsByProgramme`, `invoiceAgeing` and `intakeCapacity`. Existing keys are unchanged.

### New list filters (each one is a dashboard or attention destination)

| Filter | Meaning |
|---|---|
| `/applications?awaitingAction=true` | Submitted, Under Review or Documents Pending |
| `/enrolments?lmsMapped=no\|yes` | Whether an LMS enrolment id is recorded |
| `/enrolments?syncStatus=` | Last sync status written onto the CRM record |
| `/intakes?capacity=at-risk\|full` | ≥90% of capacity, or at/over it |
| `/learning/enrolments?activity=stale` | In progress, no activity for 30 days or more |

---

## 2. Attention-queue rules

Each item carries a category, an explanation, a severity, a count, the longest-waiting record, and a
destination that is already filtered.

| Item | Rule | Severity |
|---|---|---|
| Applications awaiting review | Stage `Submitted` | Critical ≥14 days old · Warning ≥5 · else Information |
| Documents pending | Stage `Documents Pending` | Warning ≥21 days · else Information |
| Offers awaiting response | Stage `Offer Issued` | Critical if any past its response date · Warning if any within 7 days · else Information |
| Intakes near or at capacity | ≥90% of a recorded capacity, not yet ended | Critical if any at/over · else Warning |
| Enrolments without an LMS mapping | Active, no LMS enrolment id | Warning |
| Learners with no recent activity | In progress, no activity ≥30 days | Warning |
| Failed synchronisations | Connector records whose last push errored | Critical |
| Overdue invoices | Books `overdue`, with balance | Critical |

**Severity is driven by age, not by size.** Twenty applications submitted this morning are a normal
day's work; one from three weeks ago is not. Ordering is critical first, then by count.

**Deliberate exclusions, each of which would otherwise be a false alarm**

- An intake with **no capacity recorded** is not limited, so it can be neither full nor at risk. It is
  excluded rather than treated as a limit of zero.
- An intake that has **already ended** being full is history, not work.
- An offer with **no response date recorded** cannot be late. It is counted, not escalated.
- A learner who has **never reported activity** has not gone quiet. Only records with a real activity
  or start date can go stale.
- A deployment with **no Books organisation** raises nothing — that is a valid configuration, not an
  incident.

**Failure isolation.** LMS and Books are settled independently and a rejection becomes a named
"could not be checked" row with a dash instead of a count. A zero would read as "nothing to do",
which is the opposite of what an outage means. An unavailable source is also excluded from
`worstSeverity`, so a timeout does not present itself as the most urgent thing on the page.

---

## 3. Dashboard

Grouped into **Admissions**, **Delivery**, **Learning** and **Finance**, with the attention panel
above them. Every card links to its filtered list, and the destination shows a chip naming the filter
— so arriving at a shorter list never raises "where did the other records go".

Card counts and destination row counts agree. `Applications awaiting action` spans three stages, so
it links to `?awaitingAction=true` which selects exactly those three, rather than to a single stage
that would have shown a different number.

Four visualisations, no decoration:

- **Admissions funnel** — cumulative, so the fall between steps is the drop-off rate and not a
  snapshot of who is sitting where. Rejected, withdrawn and deferred are exits, reported beside the
  funnel rather than inside it.
- **Active enrolments by programme**
- **Applications by stage**
- **Invoice ageing** — outstanding balance by how far past due, with `Not yet due` kept separate.
  An invoice with no due date lands there rather than being assumed current and late.

`Conversion to enrolled` is labelled **(all time)**. It is enrolled ÷ all applications ever recorded;
a rolling window would be more useful but would be a different number, so the label says which one it
is. With no applications at all it reads "—", not "0%".

Browser Back returns to the dashboard with its scroll position, since every card is an ordinary link.

---

## 4. Verification

**Verified offline — 44 tests pass** (33 before, 11 new)

- Age drives severity: 20 applications from today are Information; one 6 days old is Warning;
  one 20 days old is Critical and reports `oldest.days === 20`.
- An offer 60 days from its deadline is Information, 3 days is Warning, 2 days past is Critical.
- An offer with no deadline is counted but not escalated.
- Capacity: null capacity excluded; 89% produces no item, 90% Warning, 100% Critical; an ended
  intake excluded.
- Only *active* enrolments without an LMS id are flagged — mapped and completed ones are not.
- Inactive learners exclude the recently active, the never-started and the completed.
- An unavailable LMS and an unavailable Books each become a named item carrying the upstream detail,
  the CRM item still renders, and `worstSeverity` stays at `information`.
- `booksState: 'not_configured'` raises nothing.
- Overdue invoices carry balance, oldest invoice link and the partial flag when Books was truncated.
- Ordering puts the critical item first.
- Ageing buckets: no due date → `Not yet due`; 1/30 → `1–30 days`; 31 → `31–60`; 90 → `61–90`;
  91 → `Over 90 days`.
- `GET /api/attention` returns 401 to an anonymous caller.
- Production build succeeds (68 modules, 348 kB JS / 92 kB gzip, 21 kB CSS).
- CI gates pre-checked: test count 44 (needs ≥25); credential regex finds nothing in `client/dist/`.

**Unverified — needs the deployed app**

Real counts against the live CRM org · whether any attention item actually fires with your current
data · Books ageing against the real ledger · the funnel's shape.

---

## 5. Deploy

```
cd ~/Desktop/zylker-academy-app
git add -A
git commit -m "Phase 2: actionable dashboard, attention queue, filtered navigation"
git push origin main
```

No new environment variables.

## 6. Click-through checklist

1. Open the Dashboard. The **Needs attention** panel appears above the figures and can be refreshed
   on its own without reloading the page.
2. If any item is listed, confirm the severity word matches the coloured rail, and that the count on
   the right is a number (or a dash for an unavailable source).
3. Click an attention item. The destination opens with a **chip** naming the filter, and the row
   count matches the item's count.
4. Click **Applications awaiting action**. Confirm the chip reads "Queue · Awaiting our action" and
   the row count equals the card.
5. Click **Intakes near capacity** → the chip reads "At 90% or more of capacity".
6. Click **Enrolments without LMS mapping** → chip "LMS mapping · Not mapped to the LMS".
7. Click **Learners with no recent activity** → chip "Activity · No activity for 30 days or more".
8. Click **Overdue invoices** → the status chip appears on Finance.
9. On any of those, press **Clear all** — the list becomes unfiltered and the chips disappear.
10. Press Back from a destination; you return to the Dashboard where you left it.
11. Check the funnel: the top step should be the largest, and each percentage the fall from the step
    above. Rejected/withdrawn/deferred counts appear below it, not in the bars.
12. Confirm the Books cards say **Not available** rather than 0 if Books is unreachable, and that the
    CRM cards still show figures.

## 7. Remaining limitations

- **Unmatched Books customers** is not in the queue yet. Doing it correctly means applying the full
  matching priority — stored Books customer id, then verified identifier, then exact email — per
  student, and the id fields are not in the current CRM read. Reporting it from email alone would
  over-count. It lands in Phase 6 with the reconciliation queue.
- The 30-day inactivity threshold and the 90% capacity threshold are fixed in code. They become
  configurable in Phase 6 with the Settings area.
- Attention and dashboard each read CRM independently, so a dashboard load makes two sets of CRM
  queries. That buys the failure isolation; deduplicating it is a Phase 7 performance item.
- Conversion rate is lifetime only. A rolling window needs a date filter that does not exist yet.
