import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT, getLocale } from '../i18n/I18nContext.jsx';

/* ------------------------------- toasts -------------------------------- */

const ToastCtx = createContext(() => {});

/** Fire a toast from anywhere: const toast = useToast(); toast('Saved'). */
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const t = useT();
  const [items, setItems] = useState([]);
  const push = useCallback((message, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setItems((s) => [...s, { id, message, tone }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {/* aria-live so screen readers announce results of actions */}
      <div className="toast-wrap" role="status" aria-live="polite">
        {items.map((x) => (
          <div key={x.id} className={`toast ${x.tone}`}>
            <span>{x.message}</span>
            <button type="button" aria-label={t('common.dismissNotification')}
              onClick={() => setItems((s) => s.filter((y) => y.id !== x.id))}>×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------- dialogs ------------------------------- */

/**
 * Accessible modal: focus moves in, Escape closes, background is inert.
 *
 * `busy` blocks every dismiss path (Escape, backdrop click, the header Close
 * button) while a save is in flight — without it, dismissing mid-save orphans
 * the request: a later failure has nowhere to show itself, and the user walks
 * away believing it succeeded.
 */
export function Modal({ title, onClose, children, wide = false, busy = false }) {
  const t = useT();
  const ref = useRef(null);
  const close = () => { if (!busy) onClose(); };
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const first = ref.current && ref.current.querySelector('input,select,textarea,button');
    if (first) first.focus();
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, busy]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-h">
          <h2>{title}</h2>
          <button type="button" className="btn" onClick={close} disabled={busy} aria-label={t('common.closeDialog')}>
            {t('common.close')}
          </button>
        </div>
        <div className="modal-b">{children}</div>
      </div>
    </div>
  );
}

/** Confirmation gate for destructive actions. */
export function ConfirmDialog({ title, message, confirmLabel, danger = true, busy, onConfirm, onCancel }) {
  const t = useT();
  return (
    <Modal title={title} onClose={onCancel} busy={busy}>
      <p style={{ marginTop: 0 }}>{message}</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className={`btn${danger ? ' danger' : ' primary'}`} onClick={onConfirm} disabled={busy}>
          {busy ? t('common.working') : (confirmLabel || t('common.confirm'))}
        </button>
        <button className="btn" onClick={onCancel} disabled={busy}>{t('common.cancel')}</button>
      </div>
    </Modal>
  );
}

/* ------------------------------- badges -------------------------------- */

/**
 * Names the system a value came from. Every figure on a screen that mixes
 * sources carries one of these, so "0 invoices" and "Books is unreachable" are
 * never mistaken for each other.
 */
export const SourceBadge = ({ source, title }) => {
  const t = useT();
  const map = {
    crm: [t('common.sourceCrm'), 'ok'],
    lms: [t('common.sourceLms'), 'info'],
    'catalyst-lms': [t('common.sourceLms'), 'info'],
    catalyst: [t('common.sourceCatalyst'), 'info'],
    books: [t('common.sourceBooks'), 'warn'],
    desk: [t('common.sourceDesk'), 'warn']
  };
  const [label, tone] = map[source] || [t('common.unknownSource'), 'mute'];
  return <span className={`pill ${tone}`} title={title || t('common.dataFrom', { label })}>{label}</span>;
};

/**
 * Marks a section this application cannot change. Books and Desk are
 * read-only in this phase, and saying so up front is kinder than letting
 * someone hunt for an edit button that does not exist.
 */
export const ReadOnlyBadge = ({ system }) => {
  const t = useT();
  return (
    <span className="pill mute" title={t('common.readOnlyTitle', { system })}>
      {t('common.readOnly')}
    </span>
  );
};

/**
 * States that the learning data is a demonstration dataset held in Catalyst.
 *
 * This appears on every screen that shows it, because the provider names read
 * like live connections and they are not: nothing in this application contacts
 * Moodle, Canvas, TrainerCentral or any SCORM host. The mapping to CRM and the
 * push into it are real, and the wording separates the two deliberately.
 */
export const DemoDataBadge = () => {
  const t = useT();
  return (
    <span className="pill warn" title={t('common.demoDatasetTitle')}>
      {t('common.demoDataset')}
    </span>
  );
};

/** Renders a record's external reference when it has one. */
export const RefBadge = ({ reference }) =>
  reference ? <span className="pill mute mono" title="External reference">{reference}</span> : null;

/**
 * `header`, when given, replaces the default `<h2>{title}</h2>{action}` row
 * entirely with custom content (e.g. a view selector + inline search box) —
 * used by the Students/Applications/Programmes list pages, whose "view" is
 * no longer just a page title. Every other caller keeps using `title`/
 * `action` unchanged.
 */
export const Card = ({ title, action, header, headerClassName, children, pad = true }) => (
  <section className="card">
    {header
      ? <div className={`card-h${headerClassName ? ` ${headerClassName}` : ''}`}>{header}</div>
      : (title && <div className="card-h"><h2>{title}</h2>{action}</div>)}
    <div className={pad ? 'card-b' : ''}>{children}</div>
  </section>
);

export const Loading = ({ rows = 4, label }) => {
  const t = useT();
  return (
    <div role="status" aria-live="polite" aria-label={label || t('common.loading')}>
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skel" key={i} style={{ width: `${100 - i * 9}%` }} />
      ))}
    </div>
  );
};

export const Empty = ({ title, message }) => {
  const t = useT();
  return <div className="state"><h3>{title || t('common.nothingToShowYet')}</h3><p>{message}</p></div>;
};

export const ErrorState = ({ error, onRetry }) => {
  const t = useT();
  return (
    <div className="state err" role="alert">
      <h3>{t('common.loadError')}</h3>
      <p>{error?.message || t('common.unexpectedError')}</p>
      {onRetry && <button className="btn" onClick={onRetry}>{t('common.tryAgain')}</button>}
    </div>
  );
};

/** Wraps any async page section in consistent loading / empty / error states. */
export const Async = ({ state, empty, children, emptyWhen }) => {
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={state.reload} />;
  const isEmpty = emptyWhen ? emptyWhen(state.data) : !state.data || (Array.isArray(state.data) && !state.data.length);
  if (isEmpty) return <Empty {...empty} />;
  return children(state.data, state.meta);
};

// Pill TONE keys are literal values returned by the CRM/Desk/LMS backends
// (stage names, statuses) and are deliberately NOT translated: the same
// string is also the tone lookup key here and is sent back to the API as a
// filter (?status=Active, ?stage=Submitted). Translating the label without a
// separate value/label split would break one or the other.
const TONE = {
  Active: 'ok', Completed: 'info', Enrolled: 'ok', Open: 'ok', Synced: 'ok',
  'Open for Applications': 'ok', Running: 'ok', Paid: 'ok',
  Pending: 'warn', 'On Hold': 'warn', Deferred: 'warn', 'Not Synced': 'warn',
  Draft: 'mute', Planning: 'mute', Applicant: 'info', 'In Progress': 'info',
  Withdrawn: 'stop', Cancelled: 'stop', Rejected: 'stop', Suspended: 'stop', Error: 'stop',
  // External LMS vocabulary
  Mapped: 'ok', Published: 'ok', Issued: 'ok',
  Unmapped: 'warn',
  Invited: 'info',
  'Not Started': 'mute', 'Not Available': 'mute', Retired: 'mute',
  Failed: 'stop',
  // Application pipeline stages not already covered above
  Submitted: 'mute', 'Under Review': 'info', 'Documents Pending': 'warn',
  'Offer Issued': 'info', 'Offer Accepted': 'ok'
};
/** The same tone lookup Pill uses, exposed for callers (e.g. the Kanban
 * board) that need to colour something other than a pill by picklist value. */
export const toneFor = (value) => TONE[value] || 'mute';
export const Pill = ({ value, tone }) => {
  if (!value) return <span className="muted">—</span>;
  return <span className={`pill ${tone || toneFor(value)}`}>{value}</span>;
};

/**
 * A single dashboard figure.
 *
 * `unavailable` and a zero value are shown differently on purpose: "Not
 * available" means the source did not answer, and must never be allowed to read
 * as "there are none".
 */
/**
 * Memoized: the dashboard renders up to 23 of these in one grid, and a
 * KPI's own props (value/label/format/etc, all sourced from the one stable
 * `data` object useApi hands back) never change just because something
 * elsewhere on the page did — Customize, hiding a tile, or dragging one
 * around all re-render Dashboard/KpiGrid, and without this every other tile
 * would re-render along with them for no reason.
 */
export const Kpi = React.memo(({ label, value, unavailable, source, to, partial, format, loading }) => {
  const t = useT();
  const body = (
    <>
      <div className="label">
        {/* title gives the full text back on hover/focus for a label the
            two-line clamp below has truncated. */}
        <span className="label-text" title={label}>{label}</span>
        {source && <SourceBadge source={source} />}
      </div>
      {/*
       * Distinct from `unavailable`: this source hasn't answered YET (its own
       * independent request is still in flight, e.g. Books/Desk loading
       * after the CRM-backed tiles have already rendered — see Dashboard.jsx)
       * rather than having answered with a failure. Showing "Not available"
       * here would be a false claim about a source that just hasn't been
       * asked yet.
       */}
      {loading
        ? <div className="skel" style={{ width: '55%', height: 30, marginTop: 6 }} />
        : unavailable
          ? <div className="value na" title={t('common.notAvailableTitle')}>{t('common.notAvailable')}</div>
          : <div className="value mono">{format ? format(value) : (value ?? 0)}</div>}
      {partial && !unavailable && !loading && (
        <div className="field-hint">{t('common.partial')}</div>
      )}
    </>
  );
  // A KPI that links somewhere is a link, not a div with an onClick, so it is
  // keyboard reachable and announces itself correctly.
  return to
    ? <Link className="card kpi kpi-link" to={to}>{body}</Link>
    : <div className="card kpi">{body}</div>;
});

/** Page-through control for a server-paginated list. */
export const Pagination = ({ page, totalPages, hasMore, total, onPage, busy }) => {
  const t = useT();
  const knowsTotal = Number.isFinite(totalPages);
  const canPrev = page > 1;
  const canNext = knowsTotal ? page < totalPages : hasMore === true;
  if (!canPrev && !canNext) return null;
  return (
    <nav className="pager" aria-label={t('common.pagination')}>
      <button type="button" className="btn" disabled={!canPrev || busy} onClick={() => onPage(page - 1)}>
        {t('common.previous')}
      </button>
      <span className="muted">
        {knowsTotal
          ? <>{t('common.pageOf', { page, totalPages })}{Number.isFinite(total) ? ` · ${t('common.recordsCount', { total })}` : ''}</>
          : <>{t('common.pageOnly', { page })}</>}
      </span>
      <button type="button" className="btn" disabled={!canNext || busy} onClick={() => onPage(page + 1)}>
        {t('common.next')}
      </button>
    </nav>
  );
};

/**
 * `onExport` does the fetch-all-matching-rows + serialize + download work
 * (page-specific: which fields, which columns); this just owns the busy
 * state and turns a thrown error into a toast, the same shape every other
 * async button action in this app already uses.
 */
export const ExportCsvButton = ({ onExport, label }) => {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onExport();
    } catch {
      toast(t('common.errors.genericFetchError'), 'err');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="btn" onClick={run} disabled={busy}>
      {busy ? t('common.working') : (label || t('common.exportCsv'))}
    </button>
  );
};

/** Labelled search box that submits on enter and can be cleared. */
export const SearchBox = ({ id = 'search', label, value, onChange, placeholder }) => {
  const t = useT();
  return (
    <div className="field search-field">
      <label htmlFor={id}>{label || t('common.search')}</label>
      <input
        id={id}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
};

/** Select bound to a list of options, with an "all" choice. */
export const FilterSelect = ({ id, label, value, onChange, options, allLabel }) => {
  const t = useT();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel || t('common.all')}</option>
        {options.map((o) => {
          const val = typeof o === 'string' ? o : o.value;
          const text = typeof o === 'string' ? o : o.label;
          return <option key={val} value={val}>{text}</option>;
        })}
      </select>
    </div>
  );
};

/**
 * Shows which filters are currently narrowing a list, and lets each one be
 * removed.
 *
 * This exists because a dashboard card can arrive here with a filter already
 * applied. Without a visible chip the destination looks like the whole list but
 * is not, and "where did the other records go" is a much worse question than
 * one extra row of controls.
 */
export const FilterChips = ({ chips = [], onClearAll }) => {
  const t = useT();
  const active = chips.filter(Boolean);
  if (!active.length) return null;
  return (
    <div className="chips" role="group" aria-label={t('common.activeFilters')}>
      <span className="chips-label">{t('common.filteredBy')}</span>
      {active.map((c) => (
        <span className="chip" key={c.key}>
          <span className="chip-k">{c.label}</span>
          <span className="chip-v">{c.value}</span>
          <button type="button" onClick={c.onClear} aria-label={t('common.removeFilter', { label: c.label })}>×</button>
        </span>
      ))}
      {onClearAll && active.length > 0 && (
        <button type="button" className="chip-clear" onClick={onClearAll}>{t('common.clearAll')}</button>
      )}
    </div>
  );
};

/**
 * Explains that one integration is unavailable without implying the page failed.
 * Used wherever an LMS, Books or Desk section sits beside CRM data that loaded fine.
 */
export const SectionUnavailable = ({ system, detail, onRetry }) => {
  const t = useT();
  return (
    <div className="state" role="status">
      <h3>{t('common.sourceUnavailable', { system })}</h3>
      <p>{detail || t('common.sourceUnavailableDetail', { system })}</p>
      {onRetry && <button type="button" className="btn" onClick={onRetry}>{t('common.tryAgain')}</button>}
    </div>
  );
};

/**
 * Admissions funnel.
 *
 * Cumulative by design: each step counts everyone who reached it, including
 * those who have since moved past it. That is what makes the fall between two
 * steps the drop-off rate rather than a snapshot of who is sitting where — and
 * the drop is stated in words beside each bar so it does not have to be
 * eyeballed from the bar lengths.
 */
export const Funnel = React.memo(({ steps = [], emptyText }) => {
  const t = useT();
  if (!steps.length || !steps[0].count) {
    return <p className="muted" style={{ margin: 0, fontSize: 14 }}>{emptyText || t('common.noApplicationsRecorded')}</p>;
  }
  const top = steps[0].count || 1;
  return (
    <div className="funnel">
      {steps.map((s, i) => {
        const prev = i === 0 ? null : steps[i - 1].count;
        const drop = prev && prev > 0 ? Math.round(((prev - s.count) / prev) * 100) : null;
        return (
          <div className="funnel-row" key={s.stage}>
            <span className="nm">{s.stage}</span>
            <span className="funnel-bar">
              <span style={{ width: `${Math.max(1, (s.count / top) * 100)}%` }} />
            </span>
            <span className="ct">{s.count}</span>
            <span className="drop">
              {drop === null ? '' : drop > 0 ? `−${drop}%` : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
});

/** Bar list of currency amounts, used for invoice ageing. */
export const MoneyBarList = React.memo(({ data, order, currency, emptyText }) => {
  const t = useT();
  const keys = order || Object.keys(data || {});
  const values = keys.map((k) => Number((data || {})[k] || 0));
  const max = Math.max(...values, 1);
  if (!keys.length || values.every((v) => v === 0)) {
    return <p className="muted" style={{ margin: 0, fontSize: 14 }}>{emptyText || t('common.noDataYet')}</p>;
  }
  return (
    <div>
      {keys.map((k, i) => (
        <div className="bar-row" key={k}>
          <span className="nm">{k}</span>
          <span className="bar"><span style={{ width: `${(values[i] / max) * 100}%` }} /></span>
          <span className="ct mono" style={{ width: 96 }}>{fmtMoney(values[i], currency)}</span>
        </div>
      ))}
    </div>
  );
});

export const BarList = React.memo(({ data, emptyText }) => {
  const t = useT();
  const entries = Object.entries(data || {});
  if (!entries.length) return <p className="muted" style={{ margin: 0, fontSize: 14 }}>{emptyText || t('common.noDataYet')}</p>;
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <div>
      {entries.sort((a, b) => b[1] - a[1]).map(([k, v]) => (
        <div className="bar-row" key={k}>
          <span className="nm">{k}</span>
          <span className="bar"><span style={{ width: `${(v / max) * 100}%` }} /></span>
          <span className="ct mono">{v}</span>
        </div>
      ))}
    </div>
  );
});

// 'checking' is a client-side-only status (Dashboard.jsx, while the Books/
// Desk half of the dashboard is still loading independently of the CRM/LMS
// half) — never something a health-check route itself reports.
export const ConnDot = React.memo(({ label, status, detail }) => {
  const t = useT();
  return (
    <div className="conn">
      <span className={`dot ${status === 'connected' ? 'ok' : status === 'unavailable' ? 'stop' : 'mute'}`} />
      <strong>{label}</strong>
      <span className="muted">
        {status === 'connected' ? t('common.connected')
          : status === 'checking' ? t('common.checking')
          : detail || t('common.unavailable')}
      </span>
    </div>
  );
});

/**
 * Learning progress.
 *
 * A null percentage is rendered as "Not recorded", never as a 0% bar: the LMS
 * not having reported progress and a learner having made none are different
 * facts, and an empty bar reads as the second.
 */
export const Progress = ({ value }) => {
  const t = useT();
  if (value === null || value === undefined) {
    return <span className="muted">{t('common.notRecorded')}</span>;
  }
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <span className="prog" role="img" aria-label={t('common.percentComplete', { pct })}>
      <span className="prog-track"><span className="prog-fill" style={{ width: `${pct}%` }} /></span>
      <span className="mono prog-num">{pct}%</span>
    </span>
  );
};

export const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(getLocale(), { day: '2-digit', month: 'short', year: 'numeric' });
};
/** Same as fmtDate, plus a time — for sync/event timestamps where "today" isn't precise enough. */
export const fmtDateTime = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleString(getLocale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
/**
 * Formats money in the currency the source system reported. Defaults to EUR
 * only when nothing was supplied — the currency is never assumed away, because
 * showing a Books total in the wrong currency is a factual error, not a cosmetic
 * one. Cents are shown for invoice amounts and dropped for rounded totals.
 */
export const fmtMoney = (n, currency = 'EUR', { cents = false } = {}) => {
  if (n === null || n === undefined || n === '') return '—';
  try {
    return new Intl.NumberFormat(getLocale(), {
      style: 'currency',
      currency: currency || 'EUR',
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0
    }).format(n);
  } catch {
    // An unrecognised ISO code must not blank the figure out.
    return `${currency || ''} ${Number(n).toFixed(cents ? 2 : 0)}`.trim();
  }
};
