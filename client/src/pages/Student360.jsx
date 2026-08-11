import React, { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApi, useAction } from '../useApi.js';
import { api } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import { useT } from '../i18n/I18nContext.jsx';
import {
  Async, Card, Pill, Progress, SourceBadge, ReadOnlyBadge, DemoDataBadge, RefBadge,
  ConfirmDialog, SectionUnavailable, useToast, fmtDate, fmtMoney
} from '../components/Ui.jsx';
import { friendlyError } from '../components/Form.jsx';
import ActivityLog from '../components/ActivityLog.jsx';
import { Tabs, TabPanel, NoteDialog } from '../components/Record.jsx';
import { useBreadcrumbLeaf } from '../components/Shell.jsx';

/**
 * Student 360 — the primary record workspace.
 *
 * The page is assembled from three systems. The CRM half is the page's spine
 * and always renders; the Learning and Finance sections each report their own
 * state, so an outage in either degrades one tab rather than the whole record.
 * The backend guarantees this by resolving each integration independently and
 * never rejecting the response because one of them failed.
 *
 * The selected tab lives in the URL, so a link to a student's finances is a
 * link somebody can send.
 */

/* --------------------------- Zoho Books section --------------------------- */

/**
 * Invoices for this student.
 *
 * The heading states HOW the student was linked to a Books customer, because a
 * financial record shown against the wrong person is a serious error and the
 * reader deserves to know whether the link is an identifier or an email match.
 * An ambiguous email match shows nothing and says why — an unresolved link is
 * recoverable, showing someone else's invoices is not.
 */
function InvoiceSection({ invoices }) {
  const t = useT();

  if (!invoices) {
    return (
      <Card title={t('student360.invoices.title')}>
        <p className="muted">{t('student360.invoices.noAccess')}</p>
      </Card>
    );
  }

  if (invoices.status === 'not_configured') {
    return (
      <Card title={t('student360.invoices.title')} action={<SourceBadge source="books" />}>
        <p className="muted">{invoices.detail}</p>
      </Card>
    );
  }

  if (invoices.status === 'unavailable') {
    return (
      <Card title={t('student360.invoices.title')} action={<SourceBadge source="books" />}>
        <SectionUnavailable system="Zoho Books" detail={invoices.detail} />
      </Card>
    );
  }

  if (invoices.status === 'ambiguous') {
    return (
      <Card title={t('student360.invoices.title')} action={<SourceBadge source="books" />}>
        <div className="state" role="status">
          <h3>{t('student360.invoices.ambiguousTitle')}</h3>
          <p>{invoices.detail}</p>
          {invoices.match?.candidates?.length > 0 && (
            <ul className="plain-list">
              {invoices.match.candidates.map((c) => (
                <li key={c.id}>
                  <strong>{c.name}</strong> <span className="muted">· {c.email} · id {c.id}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="note">
            {t('student360.invoices.ambiguousNote')}
          </p>
        </div>
      </Card>
    );
  }

  if (invoices.status === 'unmatched') {
    return (
      <Card title={t('student360.invoices.title')} action={<SourceBadge source="books" />}>
        <p className="muted">{invoices.detail || t('student360.invoices.noCustomerLinked')}</p>
      </Card>
    );
  }

  const matchedOnLabel = invoices.match?.matchedOn === 'crm-field'
    ? t('student360.invoices.matchedOnField', { field: invoices.match.field })
    : t('student360.invoices.matchedOnEmail');

  return (
    <Card
      title={t('student360.invoices.title')}
      action={<div className="head-actions"><SourceBadge source="books" /><ReadOnlyBadge system="Zoho Books" /></div>}
    >
      <p className="note">
        {t('student360.invoices.linkedBefore')} <span className="mono">{invoices.match.customerId}</span>{' '}
        {t('student360.invoices.linkedAfter', { matchedOn: matchedOnLabel })}
      </p>

      <dl className="dl">
        <dt>{t('student360.invoices.outstandingBalance')}</dt>
        <dd className="mono">{fmtMoney(invoices.outstandingBalance, invoices.currency, { cents: true })}</dd>
      </dl>

      {invoices.invoices.length ? (
        <div className="t-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('student360.invoices.table.invoice')}</th>
                <th scope="col">{t('student360.invoices.table.date')}</th>
                <th scope="col">{t('student360.invoices.table.due')}</th>
                <th scope="col">{t('student360.invoices.table.status')}</th>
                <th scope="col">{t('student360.invoices.table.total')}</th>
                <th scope="col">{t('student360.invoices.table.balance')}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.invoices.map((inv) => (
                <tr key={inv.id}>
                  <td><Link to={`/invoices/${inv.id}`}>{inv.invoiceNumber || inv.id}</Link></td>
                  <td>{fmtDate(inv.invoiceDate)}</td>
                  <td>{fmtDate(inv.dueDate)}</td>
                  <td><Pill value={inv.paymentStatus} /></td>
                  <td className="mono">{fmtMoney(inv.total, inv.currency, { cents: true })}</td>
                  <td className="mono">{fmtMoney(inv.balance, inv.currency, { cents: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">{t('student360.invoices.noInvoices')}</p>}

      {invoices.hasMore && (
        <p className="note">
          {t('student360.invoices.moreNote')}{' '}
          <Link to={`/invoices?customerId=${invoices.match.customerId}`}>{t('student360.invoices.seeAllFinance')}</Link>.
        </p>
      )}
    </Card>
  );
}

/* --------------------------- Zoho Desk section ----------------------------- */

/**
 * Tickets for this student.
 *
 * Same shape and the same reasoning as InvoiceSection: the heading states HOW
 * the student was linked to a Desk contact, an ambiguous email match shows
 * nothing rather than guessing, and an outage renders as "not available"
 * rather than an empty table that could be mistaken for "no tickets".
 */
function TicketSection({ tickets }) {
  const t = useT();

  if (!tickets) {
    return (
      <Card title={t('student360.tickets.title')}>
        <p className="muted">{t('student360.tickets.noAccess')}</p>
      </Card>
    );
  }

  if (tickets.status === 'not_configured') {
    return (
      <Card title={t('student360.tickets.title')} action={<SourceBadge source="desk" />}>
        <p className="muted">{tickets.detail}</p>
      </Card>
    );
  }

  if (tickets.status === 'unavailable') {
    return (
      <Card title={t('student360.tickets.title')} action={<SourceBadge source="desk" />}>
        <SectionUnavailable system="Zoho Desk" detail={tickets.detail} />
      </Card>
    );
  }

  if (tickets.status === 'ambiguous') {
    return (
      <Card title={t('student360.tickets.title')} action={<SourceBadge source="desk" />}>
        <div className="state" role="status">
          <h3>{t('student360.tickets.ambiguousTitle')}</h3>
          <p>{tickets.detail}</p>
          {tickets.match?.candidates?.length > 0 && (
            <ul className="plain-list">
              {tickets.match.candidates.map((c) => (
                <li key={c.id}>
                  <strong>{c.name}</strong> <span className="muted">· {c.email} · id {c.id}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="note">
            {t('student360.tickets.ambiguousNote')}
          </p>
        </div>
      </Card>
    );
  }

  if (tickets.status === 'unmatched') {
    return (
      <Card title={t('student360.tickets.title')} action={<SourceBadge source="desk" />}>
        <p className="muted">{tickets.detail || t('student360.tickets.noContactLinked')}</p>
      </Card>
    );
  }

  const matchedOnLabel = tickets.match?.matchedOn === 'crm-field'
    ? t('student360.tickets.matchedOnField', { field: tickets.match.field })
    : t('student360.tickets.matchedOnEmail');

  return (
    <Card
      title={t('student360.tickets.title')}
      action={<div className="head-actions"><SourceBadge source="desk" /><ReadOnlyBadge system="Zoho Desk" /></div>}
    >
      <p className="note">
        {t('student360.tickets.linkedBefore')} <span className="mono">{tickets.match.contactId}</span>{' '}
        {t('student360.tickets.linkedAfter', { matchedOn: matchedOnLabel })}
      </p>

      <dl className="dl">
        <dt>{t('student360.tickets.openTickets')}</dt>
        <dd className="mono">{tickets.openCount}</dd>
      </dl>

      {tickets.tickets.length ? (
        <div className="t-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('student360.tickets.table.ticket')}</th>
                <th scope="col">{t('student360.tickets.table.subject')}</th>
                <th scope="col">{t('student360.tickets.table.status')}</th>
                <th scope="col">{t('student360.tickets.table.created')}</th>
                <th scope="col">{t('student360.tickets.table.due')}</th>
              </tr>
            </thead>
            <tbody>
              {tickets.tickets.map((tk) => (
                <tr key={tk.id}>
                  <td><Link to={`/tickets/${tk.id}`}>{tk.ticketNumber || tk.id}</Link></td>
                  <td>{tk.subject || <span className="muted">—</span>}</td>
                  <td>
                    <Pill value={tk.status} />
                    {tk.overdue && <div className="muted small">{t('student360.tickets.overdue')}</div>}
                  </td>
                  <td>{fmtDate(tk.createdTime)}</td>
                  <td>{tk.dueDate ? fmtDate(tk.dueDate) : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">{t('student360.tickets.noTickets')}</p>}

      {tickets.hasMore && (
        <p className="note">
          {t('student360.tickets.moreNote')}{' '}
          <Link to={`/tickets?contactId=${tickets.match.contactId}`}>{t('student360.tickets.seeAllSupport')}</Link>.
        </p>
      )}
    </Card>
  );
}

/* -------------------------------- overview -------------------------------- */

/**
 * The summary tab.
 *
 * Answers the questions somebody opens a student record to ask — where are they
 * in the process, what are they on, are they progressing, do they owe anything —
 * and links to the tab that holds the detail behind each answer.
 */
function Overview({ d, onTab }) {
  const t = useT();
  const s = d.student;
  const active = d.enrolments.find((e) => e.status === 'Active') || null;
  const latest = [...d.applications]
    .sort((a, b) => String(b.applicationDate || '').localeCompare(String(a.applicationDate || '')))[0] || null;

  // Averaged across the learner's records. Records that have never reported a
  // percentage are left out rather than counted as zero, which would drag the
  // average down for a course that simply has not reported yet.
  const reported = d.learning.filter((l) => l.progressPercentage !== null);
  const avgProgress = reported.length
    ? Math.round(reported.reduce((sum, l) => sum + l.progressPercentage, 0) / reported.length)
    : null;

  const financeKnown = d.invoices && d.invoices.status === 'matched';
  const ticketsKnown = d.tickets && d.tickets.status === 'matched';

  return (
    <>
      <div className="grid g-2">
        <Card title={t('student360.overview.identity')} action={<SourceBadge source="crm" />}>
          <dl className="dl">
            <dt>{t('student360.overview.fullName')}</dt><dd>{s.fullName || '—'}</dd>
            <dt>{t('student360.overview.email')}</dt><dd>{s.email || '—'}</dd>
            <dt>{t('student360.overview.studentId')}</dt><dd className="mono">{s.studentId || '—'}</dd>
            <dt>{t('student360.overview.status')}</dt><dd><Pill value={s.status} /></dd>
            <dt>{t('student360.overview.externalReference')}</dt><dd className="mono">{s.externalReference || '—'}</dd>
            <dt>{t('student360.overview.added')}</dt><dd>{fmtDate(s.createdTime)}</dd>
            <dt>{t('student360.overview.lastModified')}</dt><dd>{fmtDate(s.modifiedTime)}</dd>
          </dl>
        </Card>

        <Card title={t('student360.overview.whereTheyAre')} action={<SourceBadge source="crm" />}>
          <dl className="dl">
            <dt>{t('student360.overview.currentProgramme')}</dt>
            <dd>
              {active && active.programme
                ? <Link to={`/programmes/${active.programme.id}`}>{active.programme.name}</Link>
                : latest && latest.programme
                  ? <>{latest.programme.name} <span className="muted">{t('student360.overview.appliedFor')}</span></>
                  : <span className="muted">{t('student360.overview.none')}</span>}
            </dd>
            <dt>{t('student360.overview.currentIntake')}</dt>
            <dd>
              {active && active.intake
                ? <Link to={`/intakes/${active.intake.id}`}>{active.intake.name}</Link>
                : latest && latest.intake
                  ? <>{latest.intake.name} <span className="muted">{t('student360.overview.appliedFor')}</span></>
                  : <span className="muted">{t('student360.overview.none')}</span>}
            </dd>
            <dt>{t('student360.overview.latestApplication')}</dt>
            <dd>
              {latest
                ? (
                  <>
                    <Link to={`/applications/${latest.id}`}>{latest.name || latest.applicationId}</Link>{' '}
                    <Pill value={latest.stage} />
                  </>
                )
                : <span className="muted">{t('student360.overview.none')}</span>}
            </dd>
            <dt>{t('student360.overview.activeEnrolment')}</dt>
            <dd>
              {active
                ? <Link to={`/enrolments/${active.id}`}>{active.reference || active.id}</Link>
                : <span className="muted">{t('student360.overview.none')}</span>}
            </dd>
          </dl>
        </Card>
      </div>

      <div className="grid g-2">
        <Card
          title={t('student360.overview.learningProgress')}
          action={<div className="head-actions"><SourceBadge source="lms" /><DemoDataBadge /></div>}
        >
          {d.learning.length ? (
            <>
              <dl className="dl">
                <dt>{t('student360.overview.averageProgress')}</dt>
                <dd><Progress value={avgProgress} /></dd>
                <dt>{t('student360.overview.records')}</dt>
                <dd className="mono">{d.learning.length}</dd>
                <dt>{t('student360.overview.completed')}</dt>
                <dd className="mono">{d.learning.filter((l) => l.lmsStatus === 'Completed').length}</dd>
              </dl>
              <button type="button" className="btn" onClick={() => onTab('learning')}>
                {t('student360.overview.seeLearningRecords')}
              </button>
            </>
          ) : (
            <p className="muted">
              {t('student360.overview.noLearningRecords')}
            </p>
          )}
        </Card>

        <Card
          title={t('student360.overview.finance')}
          action={<div className="head-actions"><SourceBadge source="books" /><ReadOnlyBadge system="Zoho Books" /></div>}
        >
          {/* A balance is only stated when a Books customer was actually
              resolved. "€0 outstanding" for an unmatched student would be a
              claim this application cannot make. */}
          {financeKnown ? (
            <>
              <dl className="dl">
                <dt>{t('student360.overview.outstandingBalance')}</dt>
                <dd className="mono">
                  {fmtMoney(d.invoices.outstandingBalance, d.invoices.currency, { cents: true })}
                </dd>
                <dt>{t('student360.overview.invoices')}</dt>
                <dd className="mono">{d.invoices.invoices.length}</dd>
              </dl>
              <button type="button" className="btn" onClick={() => onTab('finance')}>{t('student360.overview.seeInvoices')}</button>
            </>
          ) : (
            <p className="muted">
              {(d.invoices && d.invoices.detail)
                || t('student360.overview.noBooksCustomer')}
            </p>
          )}
        </Card>
        <Card
          title={t('student360.overview.support')}
          action={<div className="head-actions"><SourceBadge source="desk" /><ReadOnlyBadge system="Zoho Desk" /></div>}
        >
          {/* An open-ticket count is only stated once a Desk contact was actually
              resolved — "0 open tickets" for an unmatched student would be a
              claim this application cannot make. */}
          {ticketsKnown ? (
            <>
              <dl className="dl">
                <dt>{t('student360.overview.openTickets')}</dt>
                <dd className="mono">{d.tickets.openCount}</dd>
                <dt>{t('student360.overview.tickets')}</dt>
                <dd className="mono">{d.tickets.tickets.length}</dd>
              </dl>
              <button type="button" className="btn" onClick={() => onTab('support')}>{t('student360.overview.seeTickets')}</button>
            </>
          ) : (
            <p className="muted">
              {(d.tickets && d.tickets.detail)
                || t('student360.overview.noDeskContact')}
            </p>
          )}
        </Card>
      </div>

      <Card
        title={t('student360.overview.recentActivity')}
        action={<button type="button" className="btn" onClick={() => onTab('activity')}>{t('student360.overview.allActivity')}</button>}
      >
        <ActivityLog rows={(d.activity || []).slice(0, 5)} />
      </Card>
    </>
  );
}

/* -------------------------------- the page -------------------------------- */

const TAB_KEYS = ['overview', 'applications', 'enrolments', 'learning', 'finance', 'support', 'activity'];

export default function Student360() {
  const { id } = useParams();
  const navigate = useNavigate();
  const can = useCan();
  const toast = useToast();
  const t = useT();
  const state = useApi((o) => api.student(id, o), [id]);
  const [confirm, setConfirm] = useState(null);
  const [noting, setNoting] = useState(false);
  const [params, setParams] = useSearchParams();

  const action = useAction(async () => { await state.reload(); });

  // The tab is held in the URL so a link to a student's finances can be sent to
  // somebody else and open where it was left.
  const requested = params.get('tab');
  const tab = TAB_KEYS.includes(requested) ? requested : 'overview';
  const setTab = (key) => {
    const next = new URLSearchParams(params);
    if (key === 'overview') next.delete('tab'); else next.set('tab', key);
    setParams(next, { replace: true });
  };

  const loaded = state.data && state.data.student;
  useBreadcrumbLeaf(loaded ? (loaded.fullName || loaded.email || null) : null);

  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/students/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast(t('student360.linkCopied'));
    } catch {
      // Clipboard access can be refused; saying so beats a silent no-op.
      toast(t('student360.linkCopyFailed'), 'warn');
    }
  };

  const onArchive = (student) => setConfirm({
    title: t('student360.archive.title'),
    message: t('student360.archive.message'),
    confirmLabel: t('student360.archive.confirmLabel'),
    run: async () => {
      const r = await action.run(() => api.archiveStudent(id, { expectedModifiedTime: student.modifiedTime }));
      if (r) { toast(t('student360.archive.toast')); setConfirm(null); }
    }
  });

  const onDelete = () => setConfirm({
    title: t('student360.delete.title'),
    message: t('student360.delete.message'),
    confirmLabel: t('student360.delete.confirmLabel'),
    run: async () => {
      const r = await action.run(() => api.deleteStudent(id));
      if (r) { toast(t('student360.delete.toast')); navigate('/students', { replace: true }); }
    }
  });

  return (
    <Async state={state} empty={{ title: t('student360.notFound') }} emptyWhen={(d) => !d || !d.student}>
      {(d) => {
        const s = d.student;
        const outstanding = d.invoices && d.invoices.status === 'matched'
          ? d.invoices.invoices.filter((i) => i.outstanding).length
          : null;
        const openTickets = d.tickets && d.tickets.status === 'matched'
          ? d.tickets.openCount
          : null;

        const tabs = [
          { key: 'overview', label: t('student360.tabs.overview') },
          { key: 'applications', label: t('student360.tabs.applications'), count: d.applications.length },
          { key: 'enrolments', label: t('student360.tabs.enrolments'), count: d.enrolments.length },
          { key: 'learning', label: t('student360.tabs.learning'), count: d.learning.length },
          // A null count means the source did not answer, which is not zero.
          { key: 'finance', label: t('student360.tabs.finance'), count: outstanding },
          { key: 'support', label: t('student360.tabs.support'), count: openTickets },
          { key: 'activity', label: t('student360.tabs.activity'), count: (d.activity || []).length }
        ];

        return (
          <>
            <div className="page-head">
              <h1>{s.fullName || t('student360.unnamedStudent')}</h1>
              <p>
                <Pill value={s.status} />{' '}
                <RefBadge reference={s.studentId || s.externalReference} />
              </p>
              <div className="head-actions">
                {can('student:write') && (
                  <>
                    <Link className="btn" to={`/students/${id}/edit`}>{t('student360.edit')}</Link>
                    {s.status !== 'Withdrawn' && (
                      <button type="button" className="btn" onClick={() => onArchive(s)}>{t('student360.archiveAction')}</button>
                    )}
                  </>
                )}
                {can('application:write') && (
                  <Link className="btn" to={`/applications/new?studentId=${id}`}>{t('student360.newApplication')}</Link>
                )}
                {can('enrolment:write') && (
                  <Link className="btn" to={`/enrolments/new?studentId=${id}`}>{t('student360.newEnrolment')}</Link>
                )}
                {can('activity:write') && (
                  <button type="button" className="btn" onClick={() => setNoting(true)}>{t('student360.addNote')}</button>
                )}
                <button type="button" className="btn" onClick={copyLink}>{t('student360.copyLink')}</button>
                {s.meta && s.meta.crmUrl && (
                  <a className="btn" href={s.meta.crmUrl} target="_blank" rel="noreferrer noopener">
                    {t('student360.openInCrm')}
                  </a>
                )}
                {can('student:delete') && (
                  <button type="button" className="btn danger" onClick={onDelete}>{t('student360.deleteAction')}</button>
                )}
              </div>
            </div>

            {action.error && (
              <div className="state err" role="alert">
                <h3>{t('student360.actionFailedTitle')}</h3>
                <p>{friendlyError(action.error)}</p>
              </div>
            )}

            <Tabs tabs={tabs} active={tab} onChange={setTab} label={t('student360.tabsLabel')} />

            <TabPanel id="overview" active={tab}>
              <Overview d={d} onTab={setTab} />
            </TabPanel>

            <TabPanel id="applications" active={tab}>
              <Card title={t('student360.applications.title')} action={<SourceBadge source="crm" />}>
                {d.applications.length ? (
                  <div className="t-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">{t('student360.applications.table.application')}</th>
                          <th scope="col">{t('student360.applications.table.stage')}</th>
                          <th scope="col">{t('student360.applications.table.programme')}</th>
                          <th scope="col">{t('student360.applications.table.intake')}</th>
                          <th scope="col">{t('student360.applications.table.applied')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.applications.map((a) => (
                          <tr key={a.id}>
                            <td><Link to={`/applications/${a.id}`}>{a.name || a.applicationId}</Link></td>
                            <td><Pill value={a.stage} /></td>
                            <td>{a.programme ? a.programme.name : <span className="muted">—</span>}</td>
                            <td>{a.intake ? a.intake.name : <span className="muted">—</span>}</td>
                            <td>{fmtDate(a.applicationDate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="muted">{t('student360.applications.empty')}</p>}
              </Card>
            </TabPanel>

            <TabPanel id="enrolments" active={tab}>
              <Card title={t('student360.enrolments.title')} action={<SourceBadge source="crm" />}>
                {d.enrolments.length ? (
                  <div className="t-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">{t('student360.enrolments.table.enrolment')}</th>
                          <th scope="col">{t('student360.enrolments.table.status')}</th>
                          <th scope="col">{t('student360.enrolments.table.programme')}</th>
                          <th scope="col">{t('student360.enrolments.table.intake')}</th>
                          <th scope="col">{t('student360.enrolments.table.enrolled')}</th>
                          <th scope="col">{t('student360.enrolments.table.progress')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.enrolments.map((e) => (
                          <tr key={e.id}>
                            <td><Link to={`/enrolments/${e.id}`}>{e.reference || e.externalReference || e.id}</Link></td>
                            <td><Pill value={e.status} /></td>
                            <td>{e.programme ? e.programme.name : <span className="muted">—</span>}</td>
                            <td>{e.intake ? e.intake.name : <span className="muted">—</span>}</td>
                            <td>{fmtDate(e.enrolmentDate)}</td>
                            <td className="mono">
                              {e.lms.progressPercentage === null ? '—' : `${e.lms.progressPercentage}%`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="muted">{t('student360.enrolments.empty')}</p>}
              </Card>

              <Card title={t('student360.enrolments.programmesTitle')} action={<SourceBadge source="crm" />}>
                {d.programmes.length ? (
                  <ul className="plain-list">
                    {d.programmes.map((p) => (
                      <li key={p.id}>
                        <Link to={`/programmes/${p.id}`}>{p.name}</Link>
                        {p.code && <span className="mono muted"> {p.code}</span>}
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted">{t('student360.enrolments.noProgrammes')}</p>}
              </Card>
            </TabPanel>

            <TabPanel id="learning" active={tab}>
              <Card
                title={t('student360.learning.title')}
                action={(
                  <div className="head-actions">
                    <SourceBadge source="lms" />
                    <DemoDataBadge />
                    <Link className="btn" to="/learning/enrolments">{t('student360.learning.learningHub')}</Link>
                  </div>
                )}
              >
                {d.learning.length ? (
                  <div className="t-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">{t('student360.learning.table.course')}</th>
                          <th scope="col">{t('student360.learning.table.provider')}</th>
                          <th scope="col">{t('student360.learning.table.status')}</th>
                          <th scope="col">{t('student360.learning.table.progress')}</th>
                          <th scope="col">{t('student360.learning.table.score')}</th>
                          <th scope="col">{t('student360.learning.table.certificate')}</th>
                          <th scope="col">{t('student360.learning.table.lastActivity')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.learning.map((l) => (
                          <tr key={l.id}>
                            <td>
                              <Link to={`/learning/enrolments/${l.id}`}>
                                {l.course ? l.course.name : l.externalCourseId || l.externalEnrolmentId}
                              </Link>
                            </td>
                            <td>{l.provider}</td>
                            <td><Pill value={l.lmsStatus} /></td>
                            <td><Progress value={l.progressPercentage} /></td>
                            <td className="mono">
                              {l.assessmentScore === null ? <span className="muted">—</span> : l.assessmentScore}
                            </td>
                            <td>
                              <Pill value={l.certificateStatus} />
                              {l.certificateUrl && (
                                <> <a href={l.certificateUrl} target="_blank" rel="noreferrer noopener">{t('student360.learning.viewCertificate')}</a></>
                              )}
                            </td>
                            <td>{l.lastActivityTime ? fmtDate(l.lastActivityTime) : <span className="muted">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted">
                    {t('student360.learning.noRecords')}
                  </p>
                )}
              </Card>

              <Card title={t('student360.learning.identifiersTitle')} action={<SourceBadge source="crm" />}>
                <dl className="dl">
                  <dt>{t('student360.learning.provider')}</dt><dd>{s.lms.provider || <span className="muted">—</span>}</dd>
                  <dt>{t('student360.learning.lmsUserId')}</dt><dd className="mono">{s.lms.userId || <span className="muted">{t('student360.learning.notLinked')}</span>}</dd>
                  <dt>{t('student360.learning.lastSync')}</dt><dd>{s.lms.lastSync ? fmtDate(s.lms.lastSync) : <span className="muted">—</span>}</dd>
                </dl>
                <p className="note">
                  {t('student360.learning.identifiersNote')}
                </p>
              </Card>
            </TabPanel>

            <TabPanel id="finance" active={tab}>
              <InvoiceSection invoices={can('invoice:read') ? d.invoices : null} />
            </TabPanel>

            <TabPanel id="support" active={tab}>
              <TicketSection tickets={can('ticket:read') ? d.tickets : null} />
            </TabPanel>

            <TabPanel id="activity" active={tab}>
              <Card title={t('student360.activity.title')}>
                <ActivityLog rows={d.activity} />
              </Card>
            </TabPanel>

            {noting && (
              <NoteDialog
                entityType="student"
                recordId={s.id}
                onClose={() => setNoting(false)}
                onDone={async () => { await state.reload(); }}
              />
            )}

            {confirm && (
              <ConfirmDialog
                title={confirm.title}
                message={confirm.message}
                confirmLabel={confirm.confirmLabel}
                busy={action.busy}
                onConfirm={confirm.run}
                onCancel={() => setConfirm(null)}
              />
            )}
          </>
        );
      }}
    </Async>
  );
}
