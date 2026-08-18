import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { api } from '../api.js';
import { useT } from '../i18n/I18nContext.jsx';
import { Modal, Loading, ErrorState, fmtDate, fmtMoney } from './Ui.jsx';

/**
 * "Needs attention" — the work queue.
 *
 * Fetched on its own rather than as part of the dashboard payload, so it loads,
 * fails and retries independently: a Books timeout costs this panel a line, not
 * the whole page.
 *
 * Rendered as a button next to the page title rather than an always-open card:
 * the full queue used to be the tallest thing on the dashboard, pushing every
 * KPI below the fold on first load. The button's own tone/count already say
 * whether anything needs a look, so nothing is lost by putting the detail
 * behind a click.
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

/**
 * The button's own badge: total count across every non-unavailable item, and
 * a tone matching the worst severity present — so the button itself already
 * answers "is anything urgent" without opening the modal.
 */
function summarise(items) {
  let total = 0;
  let worst = null; // null | 'info' | 'warning' | 'critical'
  const rank = { info: 1, warning: 2, critical: 3 };
  items.forEach((i) => {
    if (!i.unavailable && typeof i.count === 'number') total += i.count;
    const r = rank[i.severity] || 0;
    if (r > (rank[worst] || 0)) worst = i.severity;
  });
  const tone = worst === 'critical' ? 'stop' : worst === 'warning' ? 'warn' : worst ? 'info' : 'mute';
  return { total, tone };
}

export default function AttentionPanel() {
  const t = useT();
  const state = useApi((o) => api.attention(o), []);
  const data = state.data;
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);

  const items = (data && data.items) || [];
  const { total, tone } = summarise(items);

  return (
    <>
      <button
        type="button"
        className={`btn attn-trigger ${tone}`}
        onClick={() => setOpen(true)}
      >
        {t('common.attention.cardTitle')}
        {state.status === 'ready' && (
          <span className={`pill ${tone}`}>
            {total > 0 ? total : t('common.attention.allClearShort')}
          </span>
        )}
      </button>

      {open && (
        <Modal title={t('common.attention.cardTitle')} onClose={() => setOpen(false)} wide>
          <div className="head-actions" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className="btn"
              onClick={state.reload}
              disabled={state.status === 'loading'}
            >
              {state.status === 'loading' ? t('common.attention.refreshing') : t('common.attention.refresh')}
            </button>
          </div>

          {state.status === 'loading' && <Loading rows={3} label={t('common.attention.loadingLabel')} />}

          {state.status === 'error' && (
            <ErrorState error={state.error} onRetry={state.reload} />
          )}

          {state.status === 'ready' && data && (
            items.length ? (
              <div className="attn">
                {(expanded ? items : items.slice(0, COLLAPSED_LIMIT)).map((i) => (
                  <Item key={i.key} item={i} />
                ))}
                {items.length > COLLAPSED_LIMIT && (
                  <button type="button" className="btn attn-toggle" onClick={() => setExpanded((v) => !v)}>
                    {expanded ? t('common.attention.showFewer') : t('common.attention.showAll', { count: items.length })}
                  </button>
                )}
              </div>
            ) : (
              <p className="attn-clear">{t('common.attention.allClear')}</p>
            )
          )}
        </Modal>
      )}
    </>
  );
}
