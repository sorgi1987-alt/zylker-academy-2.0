'use strict';
/**
 * The "needs attention" queue.
 *
 * A pure function over already-normalised records: it issues no requests and
 * holds no state, so every rule below can be exercised offline against fixed
 * data. index.js gathers CRM, LMS and Books independently and hands the results
 * in — including the failures, which arrive as nulls rather than exceptions.
 * That is deliberate: a Books outage must cost the finance item and nothing
 * else, and the CRM items have to render whether or not the other two answered.
 *
 * Every item carries a destination that is already filtered, so acting on an
 * item never means re-deriving the filter by hand on the destination page.
 */

const SEV = { INFO: 'information', WARNING: 'warning', CRITICAL: 'critical' };
const RANK = { [SEV.CRITICAL]: 0, [SEV.WARNING]: 1, [SEV.INFO]: 2 };

const DAY = 86400000;

/** Whole days between a date and `now`. Null for anything unparseable. */
function daysSince(value, now) {
  if (!value) return null;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  return Math.floor((now - t) / DAY);
}

/** Whole days from `now` until a date. Negative once the date has passed. */
function daysUntil(value, now) {
  const d = daysSince(value, now);
  return d === null ? null : -d;
}

/**
 * Picks the record that has been waiting longest on `dateField`.
 * A record with no usable date cannot be "oldest" — it is not evidence of age.
 */
function oldestBy(rows, dateField) {
  let best = null;
  let bestT = Infinity;
  rows.forEach((r) => {
    const v = r[dateField];
    const t = v ? Date.parse(v) : NaN;
    if (Number.isNaN(t)) return;
    if (t < bestT) { bestT = t; best = r; }
  });
  return best;
}

const STAGE = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  DOCUMENTS_PENDING: 'Documents Pending',
  OFFER_ISSUED: 'Offer Issued'
};

/**
 * Builds the queue.
 *
 * @param {object}   input
 * @param {Array}    input.applications  normalised CRM applications
 * @param {Array}    input.enrolments    normalised CRM enrolments
 * @param {Array}    input.intakes       normalised CRM intakes, with counts.activeEnrolments
 * @param {Array?}   input.lmsEnrolments LMS demonstration records, or null when unavailable
 * @param {object?}  input.lmsStatus     connector status, or null when unavailable
 * @param {object?}  input.booksTotals   invoice totals, or null when unavailable or unconfigured
 * @param {string?}  input.booksState    'ok' | 'unavailable' | 'not_configured'
 * @param {number}   input.now           epoch ms, injected so the rules are testable
 */
function build({
  applications = [],
  enrolments = [],
  intakes = [],
  lmsEnrolments = null,
  lmsStatus = null,
  booksTotals = null,
  booksState = 'ok',
  now = Date.now()
} = {}) {
  const items = [];
  const push = (item) => { if (item && (item.count > 0 || item.unavailable)) items.push(item); };

  /* ------------------------------ admissions ----------------------------- */

  const submitted = applications.filter((a) => a.stage === STAGE.SUBMITTED);
  const oldestSubmitted = oldestBy(submitted, 'applicationDate');
  const submittedAge = oldestSubmitted ? daysSince(oldestSubmitted.applicationDate, now) : null;
  push({
    key: 'applications-awaiting-review',
    category: 'Admissions',
    title: 'Applications awaiting review',
    explanation: 'Submitted applications on which no review has started.',
    // Age is what makes a queue urgent, not size: ten applications from this
    // morning are normal, one from three weeks ago is not.
    severity: submittedAge !== null && submittedAge >= 14 ? SEV.CRITICAL
      : submittedAge !== null && submittedAge >= 5 ? SEV.WARNING : SEV.INFO,
    count: submitted.length,
    source: 'crm',
    to: `/applications?stage=${encodeURIComponent(STAGE.SUBMITTED)}`,
    oldest: oldestSubmitted ? {
      label: oldestSubmitted.name || oldestSubmitted.applicationId || `Application ${oldestSubmitted.id}`,
      date: oldestSubmitted.applicationDate,
      days: submittedAge,
      to: `/applications/${oldestSubmitted.id}`
    } : null
  });

  const docsPending = applications.filter((a) => a.stage === STAGE.DOCUMENTS_PENDING);
  const oldestDocs = oldestBy(docsPending, 'applicationDate');
  const docsAge = oldestDocs ? daysSince(oldestDocs.applicationDate, now) : null;
  push({
    key: 'documents-pending',
    category: 'Admissions',
    title: 'Documents pending',
    explanation: 'Applications held while the applicant supplies documents.',
    severity: docsAge !== null && docsAge >= 21 ? SEV.WARNING : SEV.INFO,
    count: docsPending.length,
    source: 'crm',
    to: `/applications?stage=${encodeURIComponent(STAGE.DOCUMENTS_PENDING)}`,
    oldest: oldestDocs ? {
      label: oldestDocs.name || oldestDocs.applicationId || `Application ${oldestDocs.id}`,
      date: oldestDocs.applicationDate,
      days: docsAge,
      to: `/applications/${oldestDocs.id}`
    } : null
  });

  // An offer's response deadline is the CRM Closing_Date, normalised as
  // expectedDecisionDate. An offer with no deadline recorded cannot be late.
  const offers = applications.filter((a) => a.stage === STAGE.OFFER_ISSUED);
  const withDeadline = offers.filter((a) => a.expectedDecisionDate);
  const past = withDeadline.filter((a) => daysUntil(a.expectedDecisionDate, now) < 0);
  const soon = withDeadline.filter((a) => {
    const d = daysUntil(a.expectedDecisionDate, now);
    return d !== null && d >= 0 && d <= 7;
  });
  const nextDeadline = oldestBy(withDeadline, 'expectedDecisionDate');
  push({
    key: 'offers-awaiting-response',
    category: 'Admissions',
    title: 'Offers awaiting response',
    explanation: past.length
      ? `${past.length} past the recorded response date.`
      : soon.length
        ? `${soon.length} due within seven days.`
        : 'Offers issued and not yet accepted, rejected or withdrawn.',
    severity: past.length ? SEV.CRITICAL : soon.length ? SEV.WARNING : SEV.INFO,
    count: offers.length,
    source: 'crm',
    to: `/applications?stage=${encodeURIComponent(STAGE.OFFER_ISSUED)}`,
    oldest: nextDeadline ? {
      label: nextDeadline.name || nextDeadline.applicationId || `Application ${nextDeadline.id}`,
      date: nextDeadline.expectedDecisionDate,
      days: daysSince(nextDeadline.expectedDecisionDate, now),
      to: `/applications/${nextDeadline.id}`
    } : null
  });

  /* -------------------------------- intakes ------------------------------ */

  /*
   * A null capacity means "not limited", not "limit zero", so those intakes are
   * excluded rather than counted as full. Only intakes that have not already
   * finished are considered: a completed intake being full is not a problem.
   */
  const capped = intakes.filter((i) => i.capacity != null && i.capacity > 0
    && (!i.endDate || Date.parse(i.endDate) >= now));
  const atRisk = capped.filter((i) => {
    const used = (i.counts && i.counts.activeEnrolments) || 0;
    return used / i.capacity >= 0.9;
  });
  const atCapacity = atRisk.filter((i) => ((i.counts && i.counts.activeEnrolments) || 0) >= i.capacity);
  const soonest = oldestBy(atRisk, 'startDate');
  push({
    key: 'intakes-at-capacity',
    category: 'Capacity',
    title: 'Intakes near or at capacity',
    explanation: atCapacity.length
      ? `${atCapacity.length} at or over capacity; the rest are within ten per cent of it.`
      : 'Intakes filled to ninety per cent or more of their capacity.',
    severity: atCapacity.length ? SEV.CRITICAL : SEV.WARNING,
    count: atRisk.length,
    source: 'crm',
    to: '/intakes?capacity=at-risk',
    oldest: soonest ? {
      label: soonest.name || `Intake ${soonest.id}`,
      date: soonest.startDate,
      days: daysSince(soonest.startDate, now),
      to: `/intakes/${soonest.id}`
    } : null
  });

  /* ------------------------------- enrolments ---------------------------- */

  const unmapped = enrolments.filter((e) => e.status === 'Active' && !(e.lms && e.lms.enrolmentId));
  const oldestUnmapped = oldestBy(unmapped, 'enrolmentDate');
  push({
    key: 'enrolments-missing-lms-mapping',
    category: 'Learning',
    title: 'Enrolments without an LMS mapping',
    explanation: 'Active enrolments with no external LMS enrolment recorded against them.',
    severity: SEV.WARNING,
    count: unmapped.length,
    source: 'crm',
    to: '/enrolments?lmsMapped=no',
    oldest: oldestUnmapped ? {
      label: oldestUnmapped.reference || `Enrolment ${oldestUnmapped.id}`,
      date: oldestUnmapped.enrolmentDate,
      days: daysSince(oldestUnmapped.enrolmentDate, now),
      to: `/enrolments/${oldestUnmapped.id}`
    } : null
  });

  /* --------------------------- learning connector ------------------------ */

  if (lmsEnrolments === null || !lmsStatus || lmsStatus.status !== 'connected') {
    // Named explicitly rather than silently omitted: "no learning items" and
    // "learning could not be checked" are different facts.
    push({
      key: 'lms-unavailable',
      category: 'Learning',
      title: 'Learning data could not be checked',
      explanation: (lmsStatus && lmsStatus.detail)
        || 'The Catalyst LMS demonstration dataset did not respond, so learning items are not included below.',
      severity: SEV.WARNING,
      count: 0,
      unavailable: true,
      source: 'catalyst-lms',
      to: '/integration',
      oldest: null
    });
  } else {
    const STALE_DAYS = 30;
    const stale = lmsEnrolments.filter((e) => {
      if (e.lmsStatus !== 'In Progress') return false;
      const since = daysSince(e.lastActivityTime || e.startedDate, now);
      return since !== null && since >= STALE_DAYS;
    });
    const stalest = stale.slice().sort((a, b) => {
      const av = Date.parse(a.lastActivityTime || a.startedDate || 0) || 0;
      const bv = Date.parse(b.lastActivityTime || b.startedDate || 0) || 0;
      return av - bv;
    })[0] || null;
    push({
      key: 'learners-no-recent-activity',
      category: 'Learning',
      title: 'Learners with no recent activity',
      explanation: `Learners in progress with no recorded activity for ${STALE_DAYS} days or more.`,
      severity: SEV.WARNING,
      count: stale.length,
      source: 'catalyst-lms',
      demonstrationDataset: true,
      to: '/learning/enrolments?activity=stale',
      oldest: stalest ? {
        label: stalest.externalLearnerId || stalest.externalEnrolmentId || `Record ${stalest.id}`,
        date: stalest.lastActivityTime || stalest.startedDate,
        days: daysSince(stalest.lastActivityTime || stalest.startedDate, now),
        to: `/learning/enrolments/${stalest.id}`
      } : null
    });

    const failed = (lmsStatus.counts && lmsStatus.counts.failedSyncs) || 0;
    push({
      key: 'failed-synchronisations',
      category: 'Learning',
      title: 'Failed synchronisations',
      explanation: 'Records whose last push to CRM ended in an error and has not been retried.',
      severity: SEV.CRITICAL,
      count: failed,
      source: 'catalyst-lms',
      demonstrationDataset: true,
      to: '/learning/sync-log?result=error',
      oldest: null
    });
  }

  /* --------------------------------- books ------------------------------- */

  if (booksState === 'not_configured') {
    // Not an incident. A deployment with no Books org is a valid configuration
    // and should not raise a permanent warning.
  } else if (booksState !== 'ok' || !booksTotals) {
    push({
      key: 'books-unavailable',
      category: 'Finance',
      title: 'Invoices could not be checked',
      explanation: 'Zoho Books did not respond, so overdue invoices are not included below.',
      severity: SEV.WARNING,
      count: 0,
      unavailable: true,
      source: 'books',
      to: '/integration',
      oldest: null
    });
  } else {
    const o = booksTotals.oldestOverdue;
    push({
      key: 'overdue-invoices',
      category: 'Finance',
      title: 'Overdue invoices',
      explanation: booksTotals.truncated
        ? 'Invoices past their due date. More invoices exist than could be totalled, so this is a partial figure.'
        : 'Invoices past their due date and still carrying a balance.',
      severity: SEV.CRITICAL,
      count: booksTotals.overdueCount || 0,
      amount: booksTotals.overdueBalance,
      currency: booksTotals.currency || null,
      partial: booksTotals.truncated === true,
      source: 'books',
      to: '/invoices?status=overdue',
      oldest: o ? {
        label: o.invoiceNumber || `Invoice ${o.id}`,
        date: o.dueDate,
        days: o.daysOverdue,
        to: `/invoices/${o.id}`
      } : null
    });
  }

  // Critical first, then by size, so the panel reads top-down as a work queue.
  items.sort((a, b) => (RANK[a.severity] - RANK[b.severity]) || (b.count - a.count));
  return items;
}

/** Highest severity present, for the header indicator. Null when the queue is clear. */
function worstSeverity(items) {
  let worst = null;
  items.forEach((i) => {
    if (i.unavailable) return;
    if (worst === null || RANK[i.severity] < RANK[worst]) worst = i.severity;
  });
  return worst;
}

module.exports = { build, worstSeverity, SEV, _internals: { daysSince, daysUntil, oldestBy } };
