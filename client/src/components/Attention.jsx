import React from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { api } from '../api.js';
import { Card, Loading, ErrorState, fmtDate, fmtMoney } from './Ui.jsx';

/**
 * "Needs attention" — the work queue.
 *
 * Fetched on its own rather than as part of the dashboard payload, so it loads,
 * fails and retries independently: a Books timeout costs this panel a line, not
 * the whole page.
 *
 * Each row is a link to an already-filtered destination. Severity is carried by
 * a coloured rail AND by a word, because colour alone is not information for
 * everyone reading this.
 */

const SEVERITY_LABEL = {
  critical: 'Critical',
  warning: 'Warning',
  information: 'For information'
};

function agePhrase(days) {
  if (days === null || days === undefined) return null;
  if (days < 0) return `in ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function Item({ item }) {
  const age = item.oldest ? agePhrase(item.oldest.days) : null;

  return (
    <Link className="attn-item" to={item.to}>
      <span className={`attn-sev ${item.severity}`} aria-hidden="true" />
      <span className="attn-body">
        <span className="attn-h">
          <strong>{item.title}</strong>
          <span className={`pill ${item.severity === 'critical' ? 'stop' : item.severity === 'warning' ? 'warn' : 'info'}`}>
            {SEVERITY_LABEL[item.severity] || item.severity}
          </span>
          <span className="muted small">{item.category}</span>
          {item.partial && <span className="pill mute">Partial</span>}
        </span>

        <p className="attn-why">{item.explanation}</p>

        {item.amount !== undefined && item.amount !== null && (
          <p className="attn-oldest">
            Balance outstanding: <strong>{fmtMoney(item.amount, item.currency, { cents: true })}</strong>
          </p>
        )}

        {item.oldest && (
          <p className="attn-oldest">
            Longest waiting: <strong>{item.oldest.label}</strong>
            {item.oldest.date && <> · {fmtDate(item.oldest.date)}</>}
            {age && <> ({age})</>}
          </p>
        )}
      </span>

      {/* An "unavailable" row has no meaningful count; showing 0 would read as
          "nothing to do", which is the opposite of what it means. */}
      {item.unavailable
        ? <span className="attn-count muted" aria-label="Not available">—</span>
        : <span className="attn-count mono">{item.count}</span>}
    </Link>
  );
}

export default function AttentionPanel() {
  const state = useApi((o) => api.attention(o), []);
  const data = state.data;

  const action = (
    <button
      type="button"
      className="btn"
      onClick={state.reload}
      disabled={state.status === 'loading'}
    >
      {state.status === 'loading' ? 'Refreshing…' : 'Refresh'}
    </button>
  );

  return (
    <Card title="Needs attention" action={action} pad={false}>
      {state.status === 'loading' && (
        <div style={{ padding: '16px 18px' }}>
          <Loading rows={3} label="Working out what needs attention" />
        </div>
      )}

      {state.status === 'error' && (
        <ErrorState error={state.error} onRetry={state.reload} />
      )}

      {state.status === 'ready' && data && (
        data.items.length ? (
          <div className="attn">
            {data.items.map((i) => <Item key={i.key} item={i} />)}
          </div>
        ) : (
          <p className="attn-clear">
            Nothing is waiting. Applications, intakes, learning records and invoices
            are all within their thresholds.
          </p>
        )
      )}
    </Card>
  );
}
