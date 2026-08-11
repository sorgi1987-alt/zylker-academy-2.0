import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

/* ------------------------------- toasts -------------------------------- */

const ToastCtx = createContext(() => {});

/** Fire a toast from anywhere: const toast = useToast(); toast('Saved'). */
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setItems((s) => [...s, { id, message, tone }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {/* aria-live so screen readers announce results of actions */}
      <div className="toast-wrap" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            <span>{t.message}</span>
            <button type="button" aria-label="Dismiss notification"
              onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))}>×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------- dialogs ------------------------------- */

/** Accessible modal: focus moves in, Escape closes, background is inert. */
export function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const first = ref.current && ref.current.querySelector('input,select,textarea,button');
    if (first) first.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-h">
          <h2>{title}</h2>
          <button type="button" className="btn" onClick={onClose} aria-label="Close dialog">Close</button>
        </div>
        <div className="modal-b">{children}</div>
      </div>
    </div>
  );
}

/** Confirmation gate for destructive actions. */
export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger = true, busy, onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={busy ? () => {} : onCancel}>
      <p style={{ marginTop: 0 }}>{message}</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className={`btn${danger ? ' danger' : ' primary'}`} onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </button>
        <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
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
  const map = {
    crm: ['Zoho CRM', 'ok'],
    lms: ['External LMS', 'info'],
    'catalyst-lms': ['External LMS', 'info'],
    catalyst: ['Zoho Catalyst', 'info'],
    books: ['Zoho Books', 'warn'],
    desk: ['Zoho Desk', 'warn']
  };
  const [label, tone] = map[source] || ['Unknown source', 'mute'];
  return <span className={`pill ${tone}`} title={title || `Data from ${label}`}>{label}</span>;
};

/**
 * Marks a section this application cannot change. Books is read-only in this
 * phase, and saying so up front is kinder than letting someone hunt for an edit
 * button that does not exist.
 */
export const ReadOnlyBadge = ({ system }) => (
  <span className="pill mute" title={`${system} is read-only in this application`}>
    Read-only
  </span>
);

/**
 * States that the learning data is a demonstration dataset held in Catalyst.
 *
 * This appears on every screen that shows it, because the provider names read
 * like live connections and they are not: nothing in this application contacts
 * Moodle, Canvas, TrainerCentral or any SCORM host. The mapping to CRM and the
 * push into it are real, and the wording separates the two deliberately.
 */
export const DemoDataBadge = () => (
  <span
    className="pill warn"
    title="Provider names are source labels on rows in the Catalyst Data Store. No request is made to any LMS product."
  >
    Demonstration dataset
  </span>
);

/** Renders a record's external reference when it has one. */
export const RefBadge = ({ reference }) =>
  reference ? <span className="pill mute mono" title="External reference">{reference}</span> : null;

export const Card = ({ title, action, children, pad = true }) => (
  <section className="card">
    {title && <div className="card-h"><h2>{title}</h2>{action}</div>}
    <div className={pad ? 'card-b' : ''}>{children}</div>
  </section>
);

export const Loading = ({ rows = 4, label = 'Loading' }) => (
  <div role="status" aria-live="polite" aria-label={label}>
    {Array.from({ length: rows }).map((_, i) => (
      <div className="skel" key={i} style={{ width: `${100 - i * 9}%` }} />
    ))}
  </div>
);

export const Empty = ({ title = 'Nothing to show yet', message }) => (
  <div className="state"><h3>{title}</h3><p>{message}</p></div>
);

export const ErrorState = ({ error, onRetry }) => (
  <div className="state err" role="alert">
    <h3>This information could not be loaded</h3>
    <p>{error?.message || 'An unexpected problem occurred.'}</p>
    {onRetry && <button className="btn" onClick={onRetry}>Try again</button>}
  </div>
);

/** Wraps any async page section in consistent loading / empty / error states. */
export const Async = ({ state, empty, children, emptyWhen }) => {
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={state.reload} />;
  const isEmpty = emptyWhen ? emptyWhen(state.data) : !state.data || (Array.isArray(state.data) && !state.data.length);
  if (isEmpty) return <Empty {...empty} />;
  return children(state.data, state.meta);
};

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
  Failed: 'stop'
};
export const Pill = ({ value, tone }) => {
  if (!value) return <span className="muted">—</span>;
  return <span className={`pill ${tone || TONE[value] || 'mute'}`}>{value}</span>;
};

/**
 * A single dashboard figure.
 *
 * `unavailable` and a zero value are shown differently on purpose: "Not
 * available" means the source did not answer, and must never be allowed to read
 * as "there are none".
 */
export const Kpi = ({ label, value, unavailable, source, to, partial, format }) => {
  const body = (
    <>
      <div className="label">
        {label}
        {source && <SourceBadge source={source} />}
      </div>
      {unavailable
        ? <div className="value na" title="This source could not be reached">Not available</div>
        : <div className="value mono">{format ? format(value) : (value ?? 0)}</div>}
      {partial && !unavailable && (
        <div className="field-hint">Partial — more records than could be totalled</div>
      )}
    </>
  );
  // A KPI that links somewhere is a link, not a div with an onClick, so it is
  // keyboard reachable and announces itself correctly.
  return to
    ? <Link className="card kpi kpi-link" to={to}>{body}</Link>
    : <div className="card kpi">{body}</div>;
};

/** Page-through control for a server-paginated list. */
export const Pagination = ({ page, totalPages, hasMore, total, onPage, busy }) => {
  const knowsTotal = Number.isFinite(totalPages);
  const canPrev = page > 1;
  const canNext = knowsTotal ? page < totalPages : hasMore === true;
  if (!canPrev && !canNext) return null;
  return (
    <nav className="pager" aria-label="Pagination">
      <button type="button" className="btn" disabled={!canPrev || busy} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span className="muted">
        {knowsTotal
          ? <>Page {page} of {totalPages}{Number.isFinite(total) ? ` · ${total} records` : ''}</>
          : <>Page {page}</>}
      </span>
      <button type="button" className="btn" disabled={!canNext || busy} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </nav>
  );
};

/** Labelled search box that submits on enter and can be cleared. */
export const SearchBox = ({ id = 'search', label = 'Search', value, onChange, placeholder }) => (
  <div className="field search-field">
    <label htmlFor={id}>{label}</label>
    <input
      id={id}
      type="search"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

/** Select bound to a list of options, with an "all" choice. */
export const FilterSelect = ({ id, label, value, onChange, options, allLabel = 'All' }) => (
  <div className="field">
    <label htmlFor={id}>{label}</label>
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{allLabel}</option>
      {options.map((o) => {
        const val = typeof o === 'string' ? o : o.value;
        const text = typeof o === 'string' ? o : o.label;
        return <option key={val} value={val}>{text}</option>;
      })}
    </select>
  </div>
);

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
  const active = chips.filter(Boolean);
  if (!active.length) return null;
  return (
    <div className="chips" role="group" aria-label="Active filters">
      <span className="chips-label">Filtered by</span>
      {active.map((c) => (
        <span className="chip" key={c.key}>
          <span className="chip-k">{c.label}</span>
          <span className="chip-v">{c.value}</span>
          <button type="button" onClick={c.onClear} aria-label={`Remove the ${c.label} filter`}>×</button>
        </span>
      ))}
      {onClearAll && active.length > 0 && (
        <button type="button" className="chip-clear" onClick={onClearAll}>Clear all</button>
      )}
    </div>
  );
};

/**
 * Explains that one integration is unavailable without implying the page failed.
 * Used wherever an LMS or Books section sits beside CRM data that loaded fine.
 */
export const SectionUnavailable = ({ system, detail, onRetry }) => (
  <div className="state" role="status">
    <h3>{system} is unavailable</h3>
    <p>{detail || `${system} did not respond. The rest of this page is unaffected.`}</p>
    {onRetry && <button type="button" className="btn" onClick={onRetry}>Try again</button>}
  </div>
);

/**
 * Admissions funnel.
 *
 * Cumulative by design: each step counts everyone who reached it, including
 * those who have since moved past it. That is what makes the fall between two
 * steps the drop-off rate rather than a snapshot of who is sitting where — and
 * the drop is stated in words beside each bar so it does not have to be
 * eyeballed from the bar lengths.
 */
export const Funnel = ({ steps = [], emptyText = 'No applications recorded.' }) => {
  if (!steps.length || !steps[0].count) {
    return <p className="muted" style={{ margin: 0, fontSize: 14 }}>{emptyText}</p>;
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
};

/** Bar list of currency amounts, used for invoice ageing. */
export const MoneyBarList = ({ data, order, currency, emptyText = 'No data yet.' }) => {
  const keys = order || Object.keys(data || {});
  const values = keys.map((k) => Number((data || {})[k] || 0));
  const max = Math.max(...values, 1);
  if (!keys.length || values.every((v) => v === 0)) {
    return <p className="muted" style={{ margin: 0, fontSize: 14 }}>{emptyText}</p>;
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
};

export const BarList = ({ data, emptyText = 'No data yet.' }) => {
  const entries = Object.entries(data || {});
  if (!entries.length) return <p className="muted" style={{ margin: 0, fontSize: 14 }}>{emptyText}</p>;
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
};

export const ConnDot = ({ label, status, detail }) => (
  <div className="conn">
    <span className={`dot ${status === 'connected' ? 'ok' : status === 'unavailable' ? 'stop' : 'mute'}`} />
    <strong>{label}</strong>
    <span className="muted">{status === 'connected' ? 'Connected' : detail || 'Unavailable'}</span>
  </div>
);

/**
 * Learning progress.
 *
 * A null percentage is rendered as "Not recorded", never as a 0% bar: the LMS
 * not having reported progress and a learner having made none are different
 * facts, and an empty bar reads as the second.
 */
export const Progress = ({ value }) => {
  if (value === null || value === undefined) {
    return <span className="muted">Not recorded</span>;
  }
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <span className="prog" role="img" aria-label={`${pct} per cent complete`}>
      <span className="prog-track"><span className="prog-fill" style={{ width: `${pct}%` }} /></span>
      <span className="mono prog-num">{pct}%</span>
    </span>
  );
};

export const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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
    return new Intl.NumberFormat('en-IE', {
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
