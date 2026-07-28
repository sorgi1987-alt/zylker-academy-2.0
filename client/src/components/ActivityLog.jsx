import React from 'react';

const ACTION_LABEL = {
  'application:create': 'Application created',
  'application:update': 'Application updated',
  'application:transition': 'Stage changed',
  'application:archive': 'Application withdrawn',
  'application:delete': 'Application deleted',
  'student:create': 'Student created',
  'student:update': 'Student updated',
  'student:archive': 'Student archived',
  'student:delete': 'Student deleted',
  'enrolment:create': 'Enrolment created',
  'enrolment:update': 'Enrolment updated',
  'enrolment:archive': 'Enrolment cancelled',
  'enrolment:complete': 'Enrolment completed',
  'enrolment:delete': 'Enrolment deleted',
  'programme:create': 'Programme created',
  'programme:update': 'Programme updated',
  'programme:activate': 'Programme activated',
  'programme:deactivate': 'Programme deactivated',
  'programme:delete': 'Programme deleted',
  'intake:create': 'Intake created',
  'intake:update': 'Intake updated',
  'intake:status': 'Intake status changed',
  'intake:delete': 'Intake deleted'
};

const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

/**
 * Renders an audit trail.
 *
 * Presentational only: the rows come from whichever detail endpoint already
 * loaded them, so opening a record does not cost a second round trip. Each
 * entry names WHO acted — the audit table stores the authenticated user, which
 * the previous unauthenticated build could not do.
 */
export default function ActivityLog({ rows, unavailable }) {
  if (unavailable) {
    return <p className="muted small">Activity logging is not available on this deployment.</p>;
  }
  if (!rows || !rows.length) {
    return <p className="muted small">No changes have been recorded for this record.</p>;
  }

  return (
    <ol className="timeline">
      {rows.map((a) => (
        <li key={a.id}>
          <div>
            <strong>{ACTION_LABEL[a.action] || a.action}</strong>{' '}
            {a.result !== 'success' && <span className="pill stop">{a.result}</span>}
            {a.recordRef && <span className="mono muted small"> · {a.recordRef}</span>}
          </div>
          <div className="muted small">
            {a.occurredAt ? new Date(a.occurredAt).toLocaleString('en-GB') : '—'}
            {a.actor ? ` · ${a.actor}` : ''}
            {a.actorRole ? ` (${a.actorRole})` : ''}
            {a.requestId ? ` · ${a.requestId}` : ''}
          </div>
          {a.changedFields && a.changedFields.length > 0 && (
            <ul className="chg">
              {a.changedFields.map((f) => {
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
          )}
        </li>
      ))}
    </ol>
  );
}
