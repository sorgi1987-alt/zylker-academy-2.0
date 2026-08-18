import React, { useState } from 'react';
import GridLayout, { WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { Kpi, fmtMoney } from './Ui.jsx';
import { useT } from '../i18n/I18nContext.jsx';

const ReactGridLayout = WidthProvider(GridLayout);

const GRID_COLS = 12;
const TILE_W = 3;
const TILE_H = 3;
const ROW_HEIGHT = 34;
const TILES_PER_ROW = GRID_COLS / TILE_W;

/**
 * Every KPI tile, flattened into one list instead of grouped by section in
 * JSX. A flat list with a stable `key` per tile is what makes free drag,
 * resize and per-tile hide possible: react-grid-layout tracks each item by
 * that key independently of whatever section it happens to belong to, and
 * the Customize modal (Dashboard.jsx) reads the same list to build its
 * per-tile checkboxes.
 */
export const KPI_DEFS = [
  {
    key: 'applicationsAwaitingAction', section: 'admissions', labelKey: 'dashboard.kpi.applicationsAwaitingAction',
    // Submitted, Under Review and Documents Pending together, which is exactly
    // what ?awaitingAction=true selects — so the number here and the row count
    // there are the same number.
    render: (t, d) => (
      <Kpi label={t('dashboard.kpi.applicationsAwaitingAction')} {...d.kpis.applicationsAwaitingAction}
        to="/applications?awaitingAction=true" />
    )
  },
  {
    key: 'offersAwaitingResponse', section: 'admissions', labelKey: 'dashboard.kpi.offersAwaitingResponse',
    render: (t, d) => (
      <Kpi label={t('dashboard.kpi.offersAwaitingResponse')} {...d.kpis.offersAwaitingResponse}
        to={`/applications?stage=${encodeURIComponent('Offer Issued')}`} />
    )
  },
  {
    key: 'openApplications', section: 'admissions', labelKey: 'dashboard.kpi.openApplications',
    render: (t, d) => <Kpi label={t('dashboard.kpi.openApplications')} {...d.kpis.openApplications} to="/applications" />
  },
  {
    key: 'conversionRate', section: 'admissions', labelKey: 'dashboard.kpi.conversionRate',
    // Lifetime, not a rolling window — the label says so rather than leaving
    // the reader to assume the more flattering reading.
    render: (t, d) => (
      <Kpi
        label={t('dashboard.kpi.conversionRate')}
        {...d.kpis.conversionRate}
        to={`/applications?stage=${encodeURIComponent('Enrolled')}`}
        format={(v) => (v === null || v === undefined ? '—' : `${v}%`)}
      />
    )
  },
  {
    key: 'students', section: 'admissions', labelKey: 'dashboard.kpi.students',
    render: (t, d) => <Kpi label={t('dashboard.kpi.students')} {...d.kpis.totalStudents} to="/students" />
  },

  {
    key: 'activeEnrolments', section: 'delivery', labelKey: 'dashboard.kpi.activeEnrolments',
    render: (t, d) => <Kpi label={t('dashboard.kpi.activeEnrolments')} {...d.kpis.activeEnrolments} to="/enrolments?status=Active" />
  },
  {
    key: 'enrolmentsWithoutLmsMapping', section: 'delivery', labelKey: 'dashboard.kpi.enrolmentsWithoutLmsMapping',
    render: (t, d) => (
      <Kpi label={t('dashboard.kpi.enrolmentsWithoutLmsMapping')} {...d.kpis.enrolmentsWithoutLmsMapping}
        to="/enrolments?lmsMapped=no" />
    )
  },
  {
    key: 'upcomingIntakes', section: 'delivery', labelKey: 'dashboard.kpi.upcomingIntakes',
    render: (t, d) => <Kpi label={t('dashboard.kpi.upcomingIntakes')} {...d.kpis.upcomingIntakes} to="/intakes" />
  },
  {
    key: 'intakeCapacityWarnings', section: 'delivery', labelKey: 'dashboard.kpi.intakeCapacityWarnings',
    render: (t, d) => (
      <Kpi label={t('dashboard.kpi.intakeCapacityWarnings')} {...d.kpis.intakeCapacityWarnings}
        to="/intakes?capacity=at-risk" />
    )
  },
  {
    key: 'activeProgrammes', section: 'delivery', labelKey: 'dashboard.kpi.activeProgrammes',
    render: (t, d) => <Kpi label={t('dashboard.kpi.activeProgrammes')} {...d.kpis.activeProgrammes} to="/programmes?active=true" />
  },

  {
    key: 'averageProgress', section: 'learning', labelKey: 'dashboard.kpi.averageProgress',
    render: (t, d) => (
      <Kpi
        label={t('dashboard.kpi.averageProgress')}
        {...d.kpis.averageProgress}
        to="/learning/enrolments"
        format={(v) => (v === null || v === undefined ? '—' : `${v}%`)}
      />
    )
  },
  {
    key: 'learnersNoRecentActivity', section: 'learning', labelKey: 'dashboard.kpi.learnersNoRecentActivity',
    render: (t, d) => (
      <Kpi label={t('dashboard.kpi.learnersNoRecentActivity')} {...d.kpis.inactiveLearners}
        to="/learning/enrolments?activity=stale" />
    )
  },
  {
    // Counts learner completions, not distinct courses — labelled as such.
    key: 'courseCompletions', section: 'learning', labelKey: 'dashboard.kpi.courseCompletions',
    render: (t, d) => (
      <Kpi label={t('dashboard.kpi.courseCompletions')} {...d.kpis.completedCourses}
        to="/learning/enrolments?lmsStatus=Completed" />
    )
  },
  {
    key: 'certificatesIssued', section: 'learning', labelKey: 'dashboard.kpi.certificatesIssued',
    render: (t, d) => <Kpi label={t('dashboard.kpi.certificatesIssued')} {...d.kpis.certificatesIssued} to="/learning/enrolments" />
  },
  {
    key: 'unmappedLmsRecords', section: 'learning', labelKey: 'dashboard.kpi.unmappedLmsRecords',
    render: (t, d) => (
      <Kpi label={t('dashboard.kpi.unmappedLmsRecords')} {...d.kpis.unmappedLmsRecords}
        to="/learning/enrolments?mappingStatus=Unmapped" />
    )
  },
  {
    key: 'failedSyncs', section: 'learning', labelKey: 'dashboard.kpi.failedSyncs',
    render: (t, d) => <Kpi label={t('dashboard.kpi.failedSyncs')} {...d.kpis.failedSyncs} to="/learning/sync-log?result=error" />
  },
  {
    key: 'lmsCourses', section: 'learning', labelKey: 'dashboard.kpi.lmsCourses',
    render: (t, d) => <Kpi label={t('dashboard.kpi.lmsCourses')} {...d.kpis.lmsCourses} to="/learning/courses" />
  },

  {
    key: 'overdueInvoices', section: 'finance', labelKey: 'dashboard.kpi.overdueInvoices',
    render: (t, d) => <Kpi label={t('dashboard.kpi.overdueInvoices')} {...d.kpis.overdueInvoices} to="/invoices?status=overdue" />
  },
  {
    key: 'overdueBalance', section: 'finance', labelKey: 'dashboard.kpi.overdueBalance',
    render: (t, d) => (
      <Kpi
        label={t('dashboard.kpi.overdueBalance')}
        {...d.kpis.overdueBalance}
        to="/invoices?status=overdue"
        format={(v) => fmtMoney(v, d.kpis.overdueBalance.currency)}
      />
    )
  },
  {
    key: 'outstandingInvoices', section: 'finance', labelKey: 'dashboard.kpi.outstandingInvoices',
    render: (t, d) => <Kpi label={t('dashboard.kpi.outstandingInvoices')} {...d.kpis.outstandingInvoices} to="/invoices?status=sent" />
  },
  {
    key: 'outstandingBalance', section: 'finance', labelKey: 'dashboard.kpi.outstandingBalance',
    render: (t, d) => (
      <Kpi
        label={t('dashboard.kpi.outstandingBalance')}
        {...d.kpis.outstandingBalance}
        to="/invoices"
        format={(v) => fmtMoney(v, d.kpis.outstandingBalance.currency)}
      />
    )
  },

  {
    key: 'openTickets', section: 'support', labelKey: 'dashboard.kpi.openTickets',
    render: (t, d) => <Kpi label={t('dashboard.kpi.openTickets')} {...d.kpis.openTickets} to="/tickets" />
  },
  {
    key: 'overdueTickets', section: 'support', labelKey: 'dashboard.kpi.overdueTickets',
    render: (t, d) => <Kpi label={t('dashboard.kpi.overdueTickets')} {...d.kpis.overdueTickets} to="/tickets?statusType=Open" />
  }
];

const LAYOUT_STORAGE_KEY = 'zylker.dashboard.kpiLayout';
const HIDDEN_STORAGE_KEY = 'zylker.dashboard.hiddenKpis';
const KNOWN_KEYS = new Set(KPI_DEFS.map((d) => d.key));

// Reading/writing localStorage can throw (private browsing, storage disabled)
// — that's not worth losing the page over, so a stored preference is
// best-effort, same convention as Applications.jsx's remembered view.
const readJSON = (key, fallback) => {
  try {
    const raw = JSON.parse(localStorage.getItem(key));
    return raw && typeof raw === 'object' ? raw : fallback;
  } catch { return fallback; }
};
const writeJSON = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* best-effort */ }
};

export const readHiddenKpis = () => {
  const raw = readJSON(HIDDEN_STORAGE_KEY, []);
  return Array.isArray(raw) ? raw.filter((k) => KNOWN_KEYS.has(k)) : [];
};
export const writeHiddenKpis = (keys) => writeJSON(HIDDEN_STORAGE_KEY, keys);
export const resetKpiLayout = () => { try { localStorage.removeItem(LAYOUT_STORAGE_KEY); } catch { /* best-effort */ } };

// A tile with no stored override falls back to this — a stable, deterministic
// slot computed once from its position in KPI_DEFS, not from whatever else is
// currently hidden. That's what lets a hidden tile reappear roughly where it
// was instead of jumping to wherever the current visible list happens to end.
const DEFAULT_POSITIONS = KPI_DEFS.reduce((acc, def, idx) => {
  acc[def.key] = {
    x: (idx % TILES_PER_ROW) * TILE_W,
    y: Math.floor(idx / TILES_PER_ROW) * TILE_H,
    w: TILE_W,
    h: TILE_H
  };
  return acc;
}, {});

/**
 * The dashboard's KPI area as a free drag/resize/hide grid.
 *
 * Layout overrides (position + size, per tile) and which tiles are hidden are
 * two separate, independently-persisted pieces of state: hiding a tile must
 * not lose its position, so unhiding it later puts it back roughly where it
 * was rather than at whatever slot is next free.
 */
export default function KpiGrid({ data, hidden, onHide }) {
  const t = useT();
  const [overrides, setOverrides] = useState(() => readJSON(LAYOUT_STORAGE_KEY, {}));

  const visible = KPI_DEFS.filter((def) => !hidden.includes(def.key));
  const layout = visible.map((def) => ({
    i: def.key,
    ...(overrides[def.key] || DEFAULT_POSITIONS[def.key])
  }));

  // Persisted only when a drag/resize actually settles, not on every
  // intermediate frame react-grid-layout reports while the gesture is still
  // moving — onLayoutChange fires continuously during a drag, and writing to
  // localStorage that often is wasted work for a value nobody reads until
  // the gesture stops anyway.
  const persist = (newLayout) => {
    setOverrides((prev) => {
      const merged = { ...prev };
      newLayout.forEach((item) => {
        merged[item.i] = { x: item.x, y: item.y, w: item.w, h: item.h };
      });
      writeJSON(LAYOUT_STORAGE_KEY, merged);
      return merged;
    });
  };

  return (
    <ReactGridLayout
      className="kpi-grid"
      layout={layout}
      cols={GRID_COLS}
      rowHeight={ROW_HEIGHT}
      margin={[16, 16]}
      isResizable
      isDraggable
      resizeHandles={['se']}
      draggableCancel=".kpi-hide-btn"
      onDragStop={persist}
      onResizeStop={persist}
    >
      {visible.map((def) => (
        <div key={def.key} className="kpi-grid-item">
          {def.render(t, data)}
          <span className="kpi-section-tag">{t(`dashboard.section.${def.section}`)}</span>
          <button
            type="button"
            className="kpi-hide-btn"
            title={t('dashboard.hideKpi')}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onHide(def.key); }}
          >
            ×
          </button>
        </div>
      ))}
    </ReactGridLayout>
  );
}
