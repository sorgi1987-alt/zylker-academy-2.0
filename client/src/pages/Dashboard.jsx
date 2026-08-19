import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
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
 * The dashboard's numbers are cache-backed rather than fetched fresh on
 * every load (functions/zylker_api/cache.js — a few minutes for the CRM
 * rollup, ~2 for Books/Desk), so "how old is this" is a real, answerable
 * question rather than always "just now" — this renders that answer.
 */
function timeAgo(date, t) {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 10) return t('dashboard.updatedJustNow');
  if (seconds < 60) return t('dashboard.updatedSecondsAgo', { seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('dashboard.updatedMinutesAgo', { minutes });
  const hours = Math.floor(minutes / 60);
  return t('dashboard.updatedHoursAgo', { hours });
}

// A single-arrow arc (like the nav's "activity" glyph) reads as visually
// off-centre in a small square button — its own ink is concentrated in one
// corner, so a flexbox-centred bounding box still looks lopsided. Two arrows
// (top-right and bottom-left) balance the icon's weight around its centre
// instead.
const IconRefresh = () => (
  <svg className="ic" viewBox="0 0 24 24" width="16" height="16" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

/**
 * Everything below the KPI grid — funnel, bar lists, tables, connection
 * status. Split out and memoized purely so it does not re-render when
 * Dashboard's own UI state changes (opening Customize, hiding a KPI tile,
 * dragging one around): none of that affects this section, but without a
 * memo boundary here every one of those clicks would re-render this whole
 * block anyway, since it's a sibling in the same component. `data` is the
 * one prop, and it only ever changes once — when the initial fetch resolves.
 */
const DashboardCharts = memo(function DashboardCharts({ data: d, externalReady, t }) {
  return (
    <>
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
          {!externalReady
            ? <div className="skel" style={{ height: 90 }} />
            : d.invoiceAgeing
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
          {!externalReady
            ? <div className="skel" style={{ height: 90 }} />
            : d.ticketsByStatus
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
  );
});

// Which KPI keys come from the Books/Desk half, and which source badge each
// carries — used to fill in a loading placeholder for these specific tiles
// while /api/dashboard/external is still in flight, so KpiGrid's flat
// KPI_DEFS list (which assumes every tile's data already exists) never sees
// an undefined entry.
const EXTERNAL_KPI_SOURCE = {
  outstandingInvoices: 'books', overdueInvoices: 'books', outstandingBalance: 'books', overdueBalance: 'books',
  openTickets: 'desk', overdueTickets: 'desk'
};

/**
 * Dashboard — an operational workspace rather than a summary.
 *
 * Three independent requests: the attention queue, the CRM+LMS figures, and
 * the Books+Desk figures. They load and fail separately, so a slow Books
 * aggregation delays its own tiles/cards instead of the whole page, and an
 * unreachable Books reads "Not available" on its own cards while the CRM
 * ones carry on.
 *
 * Every card is a link to the list it summarises, already filtered, and the
 * destination shows a chip naming that filter. A number here is the start of a
 * task, not the end of one.
 */
export default function Dashboard() {
  const t = useT();
  // Two independent requests for two independently-slow halves of the same
  // page (kickoff-prompt.md §2/§3's own reasoning for /api/attention,
  // extended here): CRM+LMS is fast and mostly cache-backed; Books/Desk can
  // still take a few seconds on a cold cache. Waiting for both before
  // rendering anything would mean the whole grid sits behind whichever one
  // is slower — instead the CRM-backed tiles/charts render as soon as
  // `state` resolves, and only the Books/Desk-derived tiles show their own
  // loading placeholder until `externalState` catches up.
  const state = useApi((o) => api.dashboard(o), []);
  const externalState = useApi((o) => api.dashboardExternal(o), []);
  const [hidden, setHidden] = useState(readHiddenKpis);
  const [customizing, setCustomizing] = useState(false);
  // Bumped to force KpiGrid to remount and re-read localStorage after a
  // reset — simpler than threading a "clear your internal state" prop
  // through to a component whose whole point is owning that state itself.
  const [layoutVersion, setLayoutVersion] = useState(0);

  // Stamped whenever either fetch (initial load or a manual Refresh)
  // resolves — this is when the browser last heard from the server, not
  // when the server's own cache entry was computed, but it's what "Refresh"
  // can actually promise: a new request, not a guarantee the cache happened
  // to be stale. With two independent requests this naturally settles on
  // whichever of the two finished more recently.
  const [lastUpdated, setLastUpdated] = useState(null);
  useEffect(() => {
    if (state.status === 'ready' || externalState.status === 'ready') setLastUpdated(new Date());
  }, [state.status, state.data, externalState.status, externalState.data]);
  // Re-renders the "Xm ago" text as time passes, without which it would only
  // ever update on some unrelated interaction re-rendering the page.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // One merged object for KpiGrid/DashboardCharts, memoized so opening
  // Customize or hiding a tile — neither of which touches this data — does
  // not defeat their own memoization by handing them a freshly-built object
  // every render (the same reasoning DashboardCharts' own memo comment
  // explains).
  const mergedData = useMemo(() => {
    if (!state.data) return null;
    const kpis = { ...state.data.kpis };
    if (externalState.data) {
      Object.assign(kpis, externalState.data.kpis);
    } else {
      const loading = externalState.status !== 'error';
      Object.keys(EXTERNAL_KPI_SOURCE).forEach((key) => {
        kpis[key] = { value: null, loading, unavailable: !loading, source: EXTERNAL_KPI_SOURCE[key] };
      });
    }
    const checking = { status: externalState.status === 'error' ? 'unavailable' : 'checking', label: null, detail: null };
    return {
      ...state.data,
      kpis,
      invoiceAgeing: externalState.data ? externalState.data.invoiceAgeing : null,
      invoiceAgeingCurrency: externalState.data ? externalState.data.invoiceAgeingCurrency : null,
      ticketsByStatus: externalState.data ? externalState.data.ticketsByStatus : null,
      connections: {
        ...state.data.connections,
        books: (externalState.data && externalState.data.connections.books) || checking,
        desk: (externalState.data && externalState.data.connections.desk) || checking
      }
    };
  }, [state.data, externalState.data, externalState.status]);
  const externalReady = Boolean(externalState.data);

  const refreshing = state.status === 'loading' || externalState.status === 'loading';
  const refreshAll = useCallback(() => {
    state.reload();
    externalState.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stable identity: passed to KpiGrid as `onHide`, and KpiGrid is memoized
  // specifically so that opening Customize or anything else on this page
  // doesn't re-render its 23 tiles — a new function reference here on every
  // Dashboard render would defeat that regardless of the memo.
  const toggleKpi = useCallback((key) => {
    setHidden((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      writeHiddenKpis(next);
      return next;
    });
  }, []);
  const resetLayout = () => {
    resetKpiLayout();
    setLayoutVersion((v) => v + 1);
  };

  return (
    <>
      <div className="page-head page-head-row">
        <h1>{t('dashboard.pageTitle')}</h1>
        <div className="head-actions">
          <button
            type="button"
            className={`btn icon-btn${refreshing ? ' spinning' : ''}`}
            onClick={refreshAll}
            disabled={refreshing}
            title={refreshing ? t('dashboard.refreshing') : t('dashboard.refresh')}
            aria-label={refreshing ? t('dashboard.refreshing') : t('dashboard.refresh')}
          >
            <IconRefresh />
          </button>
          {lastUpdated && <span className="muted small dash-updated">{timeAgo(lastUpdated, t)}</span>}
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

      {/* Gated on `state` (CRM+LMS) alone — that's the half without which
          almost nothing on this page can render at all. `externalState`
          (Books/Desk) is never awaited here; its own loading/failure shows
          up per-tile and per-card inside KpiGrid/DashboardCharts instead,
          via the placeholders built into `mergedData` above. */}
      <Async state={state} empty={{ title: t('dashboard.noDataYet') }} emptyWhen={() => !mergedData}>
        {() => (
          <>
            <KpiGrid key={layoutVersion} data={mergedData} hidden={hidden} onHide={toggleKpi} />

            <DashboardCharts data={mergedData} externalReady={externalReady} t={t} />
          </>
        )}
      </Async>
    </>
  );
}
