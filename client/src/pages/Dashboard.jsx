import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { api } from '../api.js';
import { useT } from '../i18n/I18nContext.jsx';
import {
  Async, Card, Kpi, BarList, MoneyBarList, Funnel, Pill, ConnDot, Modal,
  SourceBadge, DemoDataBadge, fmtDate, fmtMoney
} from '../components/Ui.jsx';
import AttentionPanel from '../components/Attention.jsx';

// Which KPI sections are hidden, remembered locally so the choice survives a
// reload without needing a backend field for it. Best-effort: a storage
// failure (private browsing, quota) just means every section shows, which is
// the safe direction to fail in.
const SECTIONS = ['admissions', 'delivery', 'learning', 'finance', 'support'];
const HIDDEN_STORAGE_KEY = 'zylker.dashboard.hiddenSections';
const readHiddenSections = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(HIDDEN_STORAGE_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((k) => SECTIONS.includes(k)) : [];
  } catch { return []; }
};
const writeHiddenSections = (keys) => {
  try { localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify(keys)); } catch { /* best-effort */ }
};

/**
 * Dashboard — an operational workspace rather than a summary.
 *
 * Two independent requests: the attention queue and the figures. They load and
 * fail separately, so a slow Books aggregation delays one panel instead of the
 * page, and within the figures each source is settled on its own — an
 * unreachable Books reads "Not available" on its own cards while the CRM ones
 * carry on.
 *
 * Every card is a link to the list it summarises, already filtered, and the
 * destination shows a chip naming that filter. A number here is the start of a
 * task, not the end of one.
 */
export default function Dashboard() {
  const t = useT();
  const state = useApi((o) => api.dashboard(o), []);
  const [hidden, setHidden] = useState(readHiddenSections);
  const [customizing, setCustomizing] = useState(false);

  const toggleSection = (key) => {
    setHidden((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      writeHiddenSections(next);
      return next;
    });
  };
  const shows = (key) => !hidden.includes(key);

  return (
    <>
      <div className="page-head page-head-row">
        <h1>{t('dashboard.pageTitle')}</h1>
        <div className="head-actions">
          <button type="button" className="btn" onClick={() => setCustomizing(true)}>
            {t('dashboard.customize')}
          </button>
          {/* Loads on its own request — see the note in Attention.jsx. */}
          <AttentionPanel />
        </div>
      </div>

      {customizing && (
        <Modal title={t('dashboard.customizeTitle')} onClose={() => setCustomizing(false)}>
          <p className="muted" style={{ marginTop: 0 }}>{t('dashboard.customizeIntro')}</p>
          <ul className="plain-list">
            {SECTIONS.map((key) => (
              <li key={key}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={shows(key)} onChange={() => toggleSection(key)} />
                  {t(`dashboard.section.${key}`)}
                </label>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {hidden.length === SECTIONS.length && (
        <p className="muted small" style={{ marginBottom: 16 }}>
          {t('dashboard.allSectionsHidden')}
        </p>
      )}

      <Async state={state} empty={{ title: t('dashboard.noDataYet') }} emptyWhen={(d) => !d}>
        {(d) => (
          <>
            {shows('admissions') && (
            <>
            <h2 className="sec-h">{t('dashboard.section.admissions')}</h2>
            <section className="grid g-kpi">
              {/* Submitted, Under Review and Documents Pending together, which is
                  exactly what ?awaitingAction=true selects — so the number here
                  and the row count there are the same number. */}
              <Kpi label={t('dashboard.kpi.applicationsAwaitingAction')} {...d.kpis.applicationsAwaitingAction}
                to="/applications?awaitingAction=true" />
              <Kpi label={t('dashboard.kpi.offersAwaitingResponse')} {...d.kpis.offersAwaitingResponse}
                to={`/applications?stage=${encodeURIComponent('Offer Issued')}`} />
              <Kpi label={t('dashboard.kpi.openApplications')} {...d.kpis.openApplications} to="/applications" />
              {/* Lifetime, not a rolling window — the label says so rather than
                  leaving the reader to assume the more flattering reading. */}
              <Kpi
                label={t('dashboard.kpi.conversionRate')}
                {...d.kpis.conversionRate}
                to={`/applications?stage=${encodeURIComponent('Enrolled')}`}
                format={(v) => (v === null || v === undefined ? '—' : `${v}%`)}
              />
              <Kpi label={t('dashboard.kpi.students')} {...d.kpis.totalStudents} to="/students" />
            </section>
            </>
            )}

            {shows('delivery') && (
            <>
            <h2 className="sec-h">{t('dashboard.section.delivery')}</h2>
            <section className="grid g-kpi">
              <Kpi label={t('dashboard.kpi.activeEnrolments')} {...d.kpis.activeEnrolments} to="/enrolments?status=Active" />
              <Kpi label={t('dashboard.kpi.enrolmentsWithoutLmsMapping')} {...d.kpis.enrolmentsWithoutLmsMapping}
                to="/enrolments?lmsMapped=no" />
              <Kpi label={t('dashboard.kpi.upcomingIntakes')} {...d.kpis.upcomingIntakes} to="/intakes" />
              <Kpi label={t('dashboard.kpi.intakeCapacityWarnings')} {...d.kpis.intakeCapacityWarnings}
                to="/intakes?capacity=at-risk" />
              <Kpi label={t('dashboard.kpi.activeProgrammes')} {...d.kpis.activeProgrammes} to="/programmes?active=true" />
            </section>
            </>
            )}

            {shows('learning') && (
            <>
            <h2 className="sec-h">{t('dashboard.section.learning')}</h2>
            <section className="grid g-kpi">
              <Kpi
                label={t('dashboard.kpi.averageProgress')}
                {...d.kpis.averageProgress}
                to="/learning/enrolments"
                format={(v) => (v === null || v === undefined ? '—' : `${v}%`)}
              />
              <Kpi label={t('dashboard.kpi.learnersNoRecentActivity')} {...d.kpis.inactiveLearners}
                to="/learning/enrolments?activity=stale" />
              {/* Counts learner completions, not distinct courses — labelled as such. */}
              <Kpi label={t('dashboard.kpi.courseCompletions')} {...d.kpis.completedCourses}
                to="/learning/enrolments?lmsStatus=Completed" />
              <Kpi label={t('dashboard.kpi.certificatesIssued')} {...d.kpis.certificatesIssued} to="/learning/enrolments" />
              <Kpi label={t('dashboard.kpi.unmappedLmsRecords')} {...d.kpis.unmappedLmsRecords}
                to="/learning/enrolments?mappingStatus=Unmapped" />
              <Kpi label={t('dashboard.kpi.failedSyncs')} {...d.kpis.failedSyncs} to="/learning/sync-log?result=error" />
              <Kpi label={t('dashboard.kpi.lmsCourses')} {...d.kpis.lmsCourses} to="/learning/courses" />
            </section>
            </>
            )}

            {shows('finance') && (
            <>
            <h2 className="sec-h">{t('dashboard.section.finance')}</h2>
            <section className="grid g-kpi">
              <Kpi label={t('dashboard.kpi.overdueInvoices')} {...d.kpis.overdueInvoices} to="/invoices?status=overdue" />
              <Kpi
                label={t('dashboard.kpi.overdueBalance')}
                {...d.kpis.overdueBalance}
                to="/invoices?status=overdue"
                format={(v) => fmtMoney(v, d.kpis.overdueBalance.currency)}
              />
              <Kpi label={t('dashboard.kpi.outstandingInvoices')} {...d.kpis.outstandingInvoices} to="/invoices?status=sent" />
              <Kpi
                label={t('dashboard.kpi.outstandingBalance')}
                {...d.kpis.outstandingBalance}
                to="/invoices"
                format={(v) => fmtMoney(v, d.kpis.outstandingBalance.currency)}
              />
            </section>
            </>
            )}

            {shows('support') && (
            <>
            <h2 className="sec-h">{t('dashboard.section.support')}</h2>
            <section className="grid g-kpi">
              <Kpi label={t('dashboard.kpi.openTickets')} {...d.kpis.openTickets} to="/tickets" />
              <Kpi label={t('dashboard.kpi.overdueTickets')} {...d.kpis.overdueTickets} to="/tickets?statusType=Open" />
            </section>
            </>
            )}

            <div className="grid g-2">
              <Card
                title={t('dashboard.card.admissionsFunnel')}
                action={<SourceBadge source="crm" />}
              >
                <Funnel steps={d.admissionsFunnel} />
                <p className="field-hint" style={{ marginTop: 12 }}>
                  {t('dashboard.funnelNote')}
                  {t('dashboard.funnelExits', {
                    rejected: d.admissionsExits.Rejected || 0,
                    withdrawn: d.admissionsExits.Withdrawn || 0,
                    deferred: d.admissionsExits.Deferred || 0
                  })}
                </p>
              </Card>

              <Card title={t('dashboard.card.activeEnrolmentsByProgramme')} action={<SourceBadge source="crm" />}>
                <BarList data={d.enrolmentsByProgramme} emptyText={t('dashboard.noActiveEnrolments')} />
              </Card>
            </div>

            <div className="grid g-2">
              <Card title={t('dashboard.card.applicationsByStage')} action={<SourceBadge source="crm" />}>
                <BarList data={d.applicationsByStage} emptyText={t('common.noApplicationsRecorded')} />
              </Card>

              <Card
                title={t('dashboard.card.invoiceAgeing')}
                action={(
                  <div className="head-actions">
                    <SourceBadge source="books" />
                    <Link className="btn" to="/invoices">{t('dashboard.allInvoices')}</Link>
                  </div>
                )}
              >
                {d.invoiceAgeing
                  ? (
                    <MoneyBarList
                      data={d.invoiceAgeing}
                      order={['Not yet due', '1–30 days', '31–60 days', '61–90 days', 'Over 90 days']}
                      currency={d.invoiceAgeingCurrency}
                      emptyText={t('dashboard.nothingOutstanding')}
                    />
                  )
                  : <p className="muted">{t('dashboard.booksUnavailable')}</p>}
              </Card>

              <Card
                title={t('dashboard.card.ticketsByStatus')}
                action={(
                  <div className="head-actions">
                    <SourceBadge source="desk" />
                    <Link className="btn" to="/tickets">{t('dashboard.allTickets')}</Link>
                  </div>
                )}
              >
                {d.ticketsByStatus
                  ? <BarList data={d.ticketsByStatus} emptyText={t('dashboard.noTicketsRecorded')} />
                  : <p className="muted">{t('dashboard.deskUnavailable')}</p>}
              </Card>
            </div>

            {d.intakeCapacity && d.intakeCapacity.length > 0 && (
              <Card
                title={t('dashboard.card.intakesNearCapacity')}
                action={<Link className="btn" to="/intakes?capacity=at-risk">{t('dashboard.seeAll')}</Link>}
              >
                <ul className="plain-list">
                  {d.intakeCapacity.map((i) => {
                    const full = i.activeEnrolments >= i.capacity;
                    return (
                      <li key={i.id}>
                        <Link to={`/intakes/${i.id}`}>{i.name}</Link>
                        <span className="muted"> · {t('dashboard.startsOn', { date: fmtDate(i.startDate) })} · </span>
                        <span className="mono">{t('common.ofCount', { used: i.activeEnrolments, total: i.capacity })}</span>
                        <span className={`pill ${full ? 'stop' : 'warn'}`}>
                          {full ? t('dashboard.atCapacity') : t('dashboard.nearCapacity')}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}

            <div className="grid g-2">
              <Card
                title={t('dashboard.card.lmsCoursesByProvider')}
                action={<div className="head-actions"><SourceBadge source="lms" /><DemoDataBadge /></div>}
              >
                {d.lmsCoursesByProvider
                  ? <BarList data={d.lmsCoursesByProvider} emptyText={t('dashboard.noCoursesRecorded')} />
                  : <p className="muted">{t('dashboard.lmsUnavailable')}</p>}
              </Card>
              <Card
                title={t('dashboard.card.learnersByLmsStatus')}
                action={<div className="head-actions"><SourceBadge source="lms" /><DemoDataBadge /></div>}
              >
                {d.learnersByLmsStatus
                  ? <BarList data={d.learnersByLmsStatus} emptyText={t('dashboard.noLearnerRecords')} />
                  : <p className="muted">{t('dashboard.lmsUnavailable')}</p>}
              </Card>
            </div>

            <Card
              title={t('dashboard.card.recentAdmissionsActivity')}
              action={<Link className="btn" to="/applications">{t('dashboard.allApplications')}</Link>}
            >
              {d.recentApplications.length ? (
                <div className="t-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{t('dashboard.table.application')}</th>
                        <th scope="col">{t('dashboard.table.stage')}</th>
                        <th scope="col">{t('dashboard.table.programme')}</th>
                        <th scope="col">{t('dashboard.table.applied')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.recentApplications.map((a) => (
                        <tr key={a.id}>
                          <td><Link to={`/applications/${a.id}`}>{a.name || a.applicationId || a.id}</Link></td>
                          <td><Pill value={a.stage} /></td>
                          <td>{a.programme ? a.programme.name : <span className="muted">—</span>}</td>
                          <td>{fmtDate(a.applicationDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="muted">{t('dashboard.noApplicationsYet')}</p>}
            </Card>

            <div className="grid g-2">
              <Card title={t('dashboard.card.upcomingIntakes')} action={<Link className="btn" to="/intakes">{t('dashboard.allIntakes')}</Link>}>
                {d.upcomingIntakes.length ? (
                  <ul className="plain-list">
                    {d.upcomingIntakes.map((i) => (
                      <li key={i.id}>
                        <Link to={`/intakes/${i.id}`}>{i.name}</Link>
                        <span className="muted"> · {t('dashboard.startsOn', { date: fmtDate(i.startDate) })} </span>
                        <Pill value={i.status} />
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted">{t('dashboard.noIntakesScheduled')}</p>}
              </Card>

              <Card title={t('dashboard.card.integrationStatus')} action={<Link className="btn" to="/integration">{t('dashboard.details')}</Link>}>
                <ConnDot label={t('dashboard.conn.crm')} status={d.connections.crm.status} detail={d.connections.crm.detail} />
                <ConnDot
                  label={t('dashboard.conn.lms')}
                  status={d.connections.lms.status}
                  detail={d.connections.lms.detail}
                />
                <ConnDot label={t('dashboard.conn.books')} status={d.connections.books.status} detail={d.connections.books.detail} />
                <ConnDot label={t('dashboard.conn.desk')} status={d.connections.desk.status} detail={d.connections.desk.detail} />
              </Card>
            </div>
          </>
        )}
      </Async>
    </>
  );
}
