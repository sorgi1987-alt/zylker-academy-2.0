import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { api } from '../api.js';
import { useT } from '../i18n/I18nContext.jsx';
import {
  Async, Card, BarList, MoneyBarList, Funnel, Pill, ConnDot, Modal,
  SourceBadge, DemoDataBadge, fmtDate
} from '../components/Ui.jsx';
import AttentionPanel from '../components/Attention.jsx';
import KpiGrid, { KPI_DEFS, readHiddenKpis, writeHiddenKpis, resetKpiLayout } from '../components/KpiGrid.jsx';

const SECTIONS = ['admissions', 'delivery', 'learning', 'finance', 'support'];

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
  const [hidden, setHidden] = useState(readHiddenKpis);
  const [customizing, setCustomizing] = useState(false);
  // Bumped to force KpiGrid to remount and re-read localStorage after a
  // reset — simpler than threading a "clear your internal state" prop
  // through to a component whose whole point is owning that state itself.
  const [layoutVersion, setLayoutVersion] = useState(0);

  const toggleKpi = (key) => {
    setHidden((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      writeHiddenKpis(next);
      return next;
    });
  };
  const resetLayout = () => {
    resetKpiLayout();
    setLayoutVersion((v) => v + 1);
  };

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
          {SECTIONS.map((section) => (
            <div key={section} style={{ marginBottom: 14 }}>
              <p className="sec-h" style={{ margin: '0 0 6px' }}>{t(`dashboard.section.${section}`)}</p>
              <ul className="plain-list">
                {KPI_DEFS.filter((def) => def.section === section).map((def) => (
                  <li key={def.key}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!hidden.includes(def.key)}
                        onChange={() => toggleKpi(def.key)}
                      />
                      {t(def.labelKey)}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <button type="button" className="btn" onClick={resetLayout}>
            {t('dashboard.resetLayout')}
          </button>
        </Modal>
      )}

      {hidden.length === KPI_DEFS.length && (
        <p className="muted small" style={{ marginBottom: 16 }}>
          {t('dashboard.allSectionsHidden')}
        </p>
      )}

      <Async state={state} empty={{ title: t('dashboard.noDataYet') }} emptyWhen={(d) => !d}>
        {(d) => (
          <>
            <KpiGrid key={layoutVersion} data={d} hidden={hidden} onHide={toggleKpi} />

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
