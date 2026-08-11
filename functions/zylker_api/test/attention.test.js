'use strict';
/**
 * Attention-queue rules.
 *
 * `attention.build` is a pure function over normalised records with `now`
 * injected, so every threshold below is asserted against fixed data rather than
 * against whatever the clock happens to say. These are the rules that decide
 * what staff are told to do first; they should not be able to drift silently.
 *
 * Run with:  node --test functions/zylker_api/test/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const attention = require('../attention.js');
const books = require('../books.js');
const desk = require('../desk.js');

const NOW = Date.parse('2026-07-30T12:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString().slice(0, 10);
const inDays = (n) => new Date(NOW + n * 86400000).toISOString().slice(0, 10);

const find = (items, key) => items.find((i) => i.key === key) || null;

/** Minimal build with the LMS, Books and Desk halves switched off. */
const crmOnly = (over) => attention.build({
  lmsEnrolments: null, lmsStatus: null, booksState: 'not_configured', deskState: 'not_configured', now: NOW, ...over
});

test('an empty estate produces no items at all', () => {
  const items = crmOnly({});
  assert.deepEqual(items.filter((i) => !i.unavailable).map((i) => i.key), [],
    'nothing to act on should mean nothing shown');
  assert.equal(attention.worstSeverity(items), null);
});

test('application age, not queue size, drives severity', () => {
  const app = (id, date) => ({ id, name: `App ${id}`, stage: 'Submitted', applicationDate: date });

  // Twenty applications from this morning are a normal day's work.
  const fresh = crmOnly({
    applications: Array.from({ length: 20 }, (_, i) => app(String(i), daysAgo(0)))
  });
  const freshItem = find(fresh, 'applications-awaiting-review');
  assert.equal(freshItem.count, 20);
  assert.equal(freshItem.severity, 'information');

  // One from six days ago is not.
  const stale = crmOnly({ applications: [app('1', daysAgo(6))] });
  assert.equal(find(stale, 'applications-awaiting-review').severity, 'warning');

  const veryStale = crmOnly({ applications: [app('1', daysAgo(20))] });
  const item = find(veryStale, 'applications-awaiting-review');
  assert.equal(item.severity, 'critical');
  assert.equal(item.oldest.days, 20);
  assert.equal(item.oldest.to, '/applications/1');
  assert.equal(item.to, '/applications?stage=Submitted', 'the destination must arrive filtered');
});

test('an offer past its recorded response date is critical, one approaching is a warning', () => {
  const offer = (id, deadline) => ({ id, name: `Offer ${id}`, stage: 'Offer Issued', expectedDecisionDate: deadline });

  const far = crmOnly({ applications: [offer('1', inDays(60))] });
  assert.equal(find(far, 'offers-awaiting-response').severity, 'information');

  const soon = crmOnly({ applications: [offer('1', inDays(3))] });
  assert.equal(find(soon, 'offers-awaiting-response').severity, 'warning');

  const late = crmOnly({ applications: [offer('1', daysAgo(2))] });
  const item = find(late, 'offers-awaiting-response');
  assert.equal(item.severity, 'critical');
  assert.match(item.explanation, /past the recorded response date/);

  // An offer with no deadline recorded cannot be late — it is counted, not escalated.
  const noDeadline = crmOnly({ applications: [{ id: '9', stage: 'Offer Issued', expectedDecisionDate: null }] });
  const nd = find(noDeadline, 'offers-awaiting-response');
  assert.equal(nd.count, 1);
  assert.equal(nd.severity, 'information');
});

test('capacity: unlimited and finished intakes are excluded, not treated as full', () => {
  const intake = (id, capacity, active, endDate) => ({
    id, name: `Intake ${id}`, capacity, endDate, startDate: inDays(30),
    counts: { activeEnrolments: active }
  });

  // A null capacity means "not limited". Counting it as zero would report every
  // uncapped intake as permanently over capacity.
  const unlimited = crmOnly({ intakes: [intake('1', null, 500, null)] });
  assert.equal(find(unlimited, 'intakes-at-capacity'), null);

  // 89% is fine; 90% is the threshold.
  assert.equal(find(crmOnly({ intakes: [intake('1', 100, 89, null)] }), 'intakes-at-capacity'), null);
  const near = find(crmOnly({ intakes: [intake('1', 100, 90, null)] }), 'intakes-at-capacity');
  assert.equal(near.severity, 'warning');
  assert.equal(near.to, '/intakes?capacity=at-risk');

  const full = find(crmOnly({ intakes: [intake('1', 100, 100, null)] }), 'intakes-at-capacity');
  assert.equal(full.severity, 'critical');

  // An intake that has already ended being full is history, not a task.
  const finished = crmOnly({ intakes: [intake('1', 10, 10, daysAgo(10))] });
  assert.equal(find(finished, 'intakes-at-capacity'), null);
});

test('only active enrolments without an LMS enrolment id are flagged', () => {
  const items = crmOnly({
    enrolments: [
      { id: '1', reference: 'ENR-1', status: 'Active', enrolmentDate: daysAgo(40), lms: { enrolmentId: null } },
      { id: '2', reference: 'ENR-2', status: 'Active', enrolmentDate: daysAgo(5), lms: { enrolmentId: 'X' } },
      { id: '3', reference: 'ENR-3', status: 'Completed', enrolmentDate: daysAgo(90), lms: { enrolmentId: null } }
    ]
  });
  const item = find(items, 'enrolments-missing-lms-mapping');
  assert.equal(item.count, 1, 'a mapped enrolment and a completed one are both excluded');
  assert.equal(item.oldest.label, 'ENR-1');
  assert.equal(item.to, '/enrolments?lmsMapped=no');
});

test('a learner who never reported activity is not counted as having gone quiet', () => {
  const lmsStatus = { status: 'connected', counts: { failedSyncs: 0 } };
  const items = attention.build({
    lmsStatus,
    lmsEnrolments: [
      { id: '1', lmsStatus: 'In Progress', lastActivityTime: daysAgo(45), externalLearnerId: 'L1' },
      { id: '2', lmsStatus: 'In Progress', lastActivityTime: daysAgo(3), externalLearnerId: 'L2' },
      { id: '3', lmsStatus: 'In Progress', lastActivityTime: null, startedDate: null, externalLearnerId: 'L3' },
      { id: '4', lmsStatus: 'Completed', lastActivityTime: daysAgo(200), externalLearnerId: 'L4' }
    ],
    booksState: 'not_configured',
    deskState: 'not_configured',
    now: NOW
  });
  const item = find(items, 'learners-no-recent-activity');
  assert.equal(item.count, 1, 'recent, never-started and completed learners are all excluded');
  assert.equal(item.oldest.label, 'L1');
  assert.equal(item.to, '/learning/enrolments?activity=stale');
});

test('an unavailable source becomes a named item, never a silent zero', () => {
  const items = attention.build({
    applications: [{ id: '1', stage: 'Submitted', applicationDate: daysAgo(1) }],
    lmsEnrolments: null,
    lmsStatus: { status: 'unavailable', detail: 'Data Store timed out' },
    booksState: 'unavailable',
    booksTotals: null,
    deskState: 'unavailable',
    deskTotals: null,
    now: NOW
  });

  const lms = find(items, 'lms-unavailable');
  assert.ok(lms, 'an unreachable connector must be stated');
  assert.equal(lms.unavailable, true);
  assert.equal(lms.count, 0);
  assert.match(lms.explanation, /Data Store timed out/);

  assert.ok(find(items, 'books-unavailable'), 'an unreachable Books must be stated');
  assert.ok(find(items, 'desk-unavailable'), 'an unreachable Desk must be stated');

  // The CRM item still renders — one integration failing costs one line.
  assert.ok(find(items, 'applications-awaiting-review'));

  // An unavailable source must not be reported as the worst thing happening.
  assert.equal(attention.worstSeverity(items), 'information');
});

test('a deployment with no Books org raises nothing — that is a valid configuration', () => {
  const items = attention.build({
    booksState: 'not_configured', deskState: 'not_configured', lmsEnrolments: null, lmsStatus: null, now: NOW
  });
  assert.equal(find(items, 'books-unavailable'), null);
  assert.equal(find(items, 'overdue-invoices'), null);
  assert.equal(find(items, 'desk-unavailable'), null);
  assert.equal(find(items, 'tickets-overdue'), null);
});

test('overdue invoices carry their balance, oldest invoice and partial flag', () => {
  const items = attention.build({
    lmsEnrolments: null, lmsStatus: null, booksState: 'ok', deskState: 'not_configured', now: NOW,
    booksTotals: {
      overdueCount: 3, overdueBalance: 4210.5, currency: 'EUR', truncated: true,
      oldestOverdue: { id: '77', invoiceNumber: 'INV-0077', dueDate: daysAgo(120), daysOverdue: 120 }
    }
  });
  const item = find(items, 'overdue-invoices');
  assert.equal(item.severity, 'critical');
  assert.equal(item.count, 3);
  assert.equal(item.amount, 4210.5);
  assert.equal(item.partial, true);
  assert.match(item.explanation, /partial figure/);
  assert.equal(item.oldest.to, '/invoices/77');
  assert.equal(item.to, '/invoices?status=overdue');
});

test('overdue tickets carry their oldest ticket and partial flag', () => {
  const items = attention.build({
    lmsEnrolments: null, lmsStatus: null, booksState: 'not_configured', deskState: 'ok', now: NOW,
    deskTotals: {
      overdueCount: 2, truncated: true,
      oldestOverdue: { id: '55', ticketNumber: 'TCK-0055', subject: 'Cannot access course', dueDate: daysAgo(10), daysOverdue: 10 }
    }
  });
  const item = find(items, 'tickets-overdue');
  assert.equal(item.severity, 'critical');
  assert.equal(item.count, 2);
  assert.equal(item.partial, true);
  assert.match(item.explanation, /partial figure/);
  assert.equal(item.oldest.label, 'Cannot access course');
  assert.equal(item.oldest.to, '/tickets/55');
  assert.equal(item.to, '/tickets?statusType=Open');
});

test('the queue is ordered critical first, then by size', () => {
  const items = attention.build({
    applications: [
      { id: '1', stage: 'Submitted', applicationDate: daysAgo(1) },
      { id: '2', stage: 'Submitted', applicationDate: daysAgo(1) },
      { id: '3', stage: 'Offer Issued', expectedDecisionDate: daysAgo(1) }
    ],
    lmsEnrolments: null, lmsStatus: null, booksState: 'not_configured', deskState: 'not_configured', now: NOW
  });
  assert.equal(items[0].key, 'offers-awaiting-response', 'the critical item sorts first');
  assert.equal(attention.worstSeverity(items), 'critical');
});

test('invoice ageing buckets money by how far past due it is', () => {
  const bucket = books._internals.ageingBucket;
  assert.equal(bucket(null), 'Not yet due', 'an invoice with no due date is not assumed current-and-late');
  assert.equal(bucket(-5), 'Not yet due');
  assert.equal(bucket(0), 'Not yet due');
  assert.equal(bucket(1), '1–30 days');
  assert.equal(bucket(30), '1–30 days');
  assert.equal(bucket(31), '31–60 days');
  assert.equal(bucket(90), '61–90 days');
  assert.equal(bucket(91), 'Over 90 days');
});

test('a ticket is overdue only when open, past its due date, and a due date exists at all', () => {
  const isOverdue = desk._internals.isOverdue;
  const now = Date.parse('2026-07-30T12:00:00Z');
  assert.equal(isOverdue({ statusType: 'Open', dueDate: '2026-07-01' }, now), true);
  assert.equal(isOverdue({ statusType: 'Open', dueDate: '2026-08-15' }, now), false, 'not yet due');
  assert.equal(isOverdue({ statusType: 'Open', dueDate: null }, now), false, 'no due date is not evidence of lateness');
  assert.equal(isOverdue({ statusType: 'Closed', dueDate: '2026-07-01' }, now), false, 'a closed ticket is not overdue');
});
