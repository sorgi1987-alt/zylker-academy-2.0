import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { api } from '../api.js';
import { useT } from '../i18n/I18nContext.jsx';
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

/** camelCase(item.key), e.g. 'tickets-overdue' -> 'ticketsOverdue'. */
const toCamel = (key) => key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function agePhrase(t, days) {
  if (days === null || days === undefined) return null;
  if (days < 0) {
    return Math.abs(days) === 1 ? t('common.attention.age.inOneDay') : t('common.attention.age.inDays', { days: Math.abs(days) });
  }
  if (days === 0) return t('common.attention.age.today');
  if (days === 1) return t('common.attention.age.oneDayAgo');
  return t('common.attention.age.daysAgo', { days });
}

function Item({ item }) {
  const t = useT();
  const age = item.oldest ? agePhrase(t, item.oldest.days) : null;
  // Falls back to the server's own English title/category if this item key has
  // no client-side translation yet — never a blank row.
  const byKey = t(`common.attention.byKey.${toCamel(item.key)}.title`);
  const title = byKey === `common.attention.byKey.${toCamel(item.key)}.title` ? item.title : byKey;
  const categoryKey = `common.attention.byKey.${toCamel(item.key)}.category`;
  const categoryVal = t(categoryKey);
  const category = categoryVal === categoryKey ? item.category : categoryVal;

  return (
    <Link className="attn-item" to={item.to}>
      <span className={`attn-sev ${item.severity}`} aria-hidden="true" />
      <span className="attn-body">
        <span className="attn-h">
          <strong>{title}</strong>
          <span className={`pill ${item.severity === 'critical' ? 'stop' : item.severity === 'warning' ? 'warn' : 'info'}`}>
            {t(`common.attention.severity.${item.severity}`) || item.severity}
          </span>
          <span className="muted small">{category}</span>
          {item.partial && <span className="pill mute">{t('common.attention.partial')}</span>}
        </span>

        <p className="attn-why">{item.explanation}</p>

        {item.amount !== undefined && item.amount !== null && (
          <p className="attn-oldest">
            {t('common.attention.balanceOutstanding')} <strong>{fmtMoney(item.amount, item.currency, { cents: true })}</strong>
          </p>
        )}

        {item.oldest && (
          <p className="attn-oldest">
            {t('common.attention.longestWaiting')} <strong>{item.oldest.label}</strong>
            {item.oldest.date && <> · {fmtDate(item.oldest.date)}</>}
            {age && <> ({age})</>}
          </p>
        )}
      </span>

      {/* An "unavailable" row has no meaningful count; showing 0 would read as
          "nothing to do", which is the opposite of what it means. */}
      {item.unavailable
        ? <span className="attn-count muted" aria-label={t('common.notAvailable')}>—</span>
        : <span className="attn-count mono">{item.count}</span>}
    </Link>
  );
}

// Beyond this many items the queue is truncated with a "Show all" toggle —
// the queue is already sorted critical-first, so what's cut off is always
// the least urgent, not an arbitrary slice.
const COLLAPSED_LIMIT = 5;

export default function AttentionPanel() {
  const t = useT();
  const state = useApi((o) => api.attention(o), []);
  const data = state.data;
  const [expanded, setExpanded] = useState(false);

  const action = (
    <button
      type="button"
      className="btn"
      onClick={state.reload}
      disabled={state.status === 'loading'}
    >
      {state.status === 'loading' ? t('common.attention.refreshing') : t('common.attention.refresh')}
    </button>
  );

  return (
    <Card title={t('common.attention.cardTitle')} action={action} pad={false}>
      {state.status === 'loading' && (
        <div style={{ padding: '16px 18px' }}>
          <Loading rows={3} label={t('common.attention.loadingLabel')} />
        </div>
      )}

      {state.status === 'error' && (
        <ErrorState error={state.error} onRetry={state.reload} />
      )}

      {state.status === 'ready' && data && (
        data.items.length ? (
          <div className="attn">
            {(expanded ? data.items : data.items.slice(0, COLLAPSED_LIMIT)).map((i) => (
              <Item key={i.key} item={i} />
            ))}
            {data.items.length > COLLAPSED_LIMIT && (
              <button type="button" className="btn attn-toggle" onClick={() => setExpanded((v) => !v)}>
                {expanded ? t('common.attention.showFewer') : t('common.attention.showAll', { count: data.items.length })}
              </button>
            )}
          </div>
        ) : (
          <p className="attn-clear">{t('common.attention.allClear')}</p>
        )
      )}
    </Card>
  );
}
