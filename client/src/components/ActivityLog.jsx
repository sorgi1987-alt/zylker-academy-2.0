import React from 'react';
import { useT, getLocale } from '../i18n/I18nContext.jsx';

const ACTION_KEY = {
  'application:create': 'applicationCreate',
  'application:update': 'applicationUpdate',
  'application:transition': 'applicationTransition',
  'application:archive': 'applicationArchive',
  'application:delete': 'applicationDelete',
  'student:create': 'studentCreate',
  'student:update': 'studentUpdate',
  'student:archive': 'studentArchive',
  'student:delete': 'studentDelete',
  'enrolment:create': 'enrolmentCreate',
  'enrolment:update': 'enrolmentUpdate',
  'enrolment:archive': 'enrolmentArchive',
  'enrolment:complete': 'enrolmentComplete',
  'enrolment:delete': 'enrolmentDelete',
  'student:note': 'note',
  'application:note': 'note',
  'enrolment:note': 'note',
  'programme:create': 'programmeCreate',
  'programme:update': 'programmeUpdate',
  'programme:activate': 'programmeActivate',
  'programme:deactivate': 'programmeDeactivate',
  'programme:delete': 'programmeDelete',
  'intake:create': 'intakeCreate',
  'intake:update': 'intakeUpdate',
  'intake:status': 'intakeStatus',
  'intake:delete': 'intakeDelete'
};

const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

/**
 * The audit entry's `changedFields` names every field the edit *submitted*,
 * not every field whose value actually moved — a save that re-sends a field
 * untouched still lists it. Keeps a field only when before/after truly
 * differ; a field with no before/after captured at all (e.g. an archive
 * action) has nothing to compare, so it is kept rather than guessed away.
 */
function realChanges(a) {
  return (a.changedFields || []).filter((f) => {
    const hasBefore = a.before && Object.prototype.hasOwnProperty.call(a.before, f);
    const hasAfter = a.after && Object.prototype.hasOwnProperty.call(a.after, f);
    if (!hasBefore && !hasAfter) return true;
    return fmt(a.before ? a.before[f] : undefined) !== fmt(a.after ? a.after[f] : undefined);
  });
}

/**
 * Renders an audit trail.
 *
 * Presentational only: the rows come from whichever detail endpoint already
 * loaded them, so opening a record does not cost a second round trip. Each
 * entry names WHO acted — the audit table stores the authenticated user, which
 * the previous unauthenticated build could not do.
 */
export default function ActivityLog({ rows, unavailable }) {
  const t = useT();
  if (unavailable) {
    return <p className="muted small">{t('common.activity.unavailable')}</p>;
  }
  if (!rows || !rows.length) {
    return <p className="muted small">{t('common.activity.empty')}</p>;
  }

  return (
    <ol className="timeline">
      {rows.map((a) => (
        <li key={a.id}>
          <div>
            <strong>{(ACTION_KEY[a.action] && t(`common.activity.action.${ACTION_KEY[a.action]}`)) || a.action}</strong>{' '}
            {a.result !== 'success' && <span className="pill stop">{a.result}</span>}
            {a.recordRef && <span className="mono muted small"> · {a.recordRef}</span>}
          </div>
          <div className="muted small">
            {a.occurredAt ? new Date(a.occurredAt).toLocaleString(getLocale()) : '—'}
            {a.actor ? ` · ${a.actor}` : ''}
            {a.actorRole ? ` (${a.actorRole})` : ''}
            {a.requestId ? ` · ${a.requestId}` : ''}
          </div>
          {/* A comment left with an action, or a standalone internal note.
              Rendered as text, never as a changed field, because nothing on the
              CRM record changed to hold it. */}
          {a.note && <p className="act-note">{a.note}</p>}
          {(() => {
            const changed = realChanges(a);
            if (!changed.length) return null;
            return (
              <ul className="chg">
                {changed.map((f) => {
                  const before = a.before ? a.before[f] : undefined;
                  const after = a.after ? a.after[f] : undefined;
                  if (before === undefined && after === undefined) {
                    return <li key={f}><span className="mono">{f}</span></li>;
                  }
                  return (
                    <li key={f}>
                      <span className="mono">{f}</span>: <span className="was">{fmt(before)}</span>
                      {' → '}<strong>{fmt(after)}</strong>
                    </li>
                  );
                })}
              </ul>
            );
          })()}
        </li>
      ))}
    </ol>
  );
}
