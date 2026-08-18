import React from 'react';
import { useT } from '../i18n/I18nContext.jsx';
import { Pill, fmtDate } from './Ui.jsx';

/**
 * `Direction` labels shown as plain text, not a `Pill`: this is a factual
 * descriptor of what the row actually did, not a status to colour. It is the
 * answer to "did this touch Zoho CRM at all" that `crmRecord` alone cannot
 * give — a Map operation populates crmRecord from a CRM *read*, which looks
 * identical to a genuine write unless Direction says otherwise.
 */
const DIRECTION_KEY = {
  Internal: 'internal',
  'CRM to LMS': 'crmToLms',
  'LMS to CRM': 'lmsToCrm'
};

/**
 * The connector's synchronisation history.
 *
 * Every row names who triggered it. That attribution is the reason the log is
 * worth keeping: "the integration changed it" is not an answer six months later
 * when someone asks why a CRM field holds what it holds — and it is the record
 * that matters most here, because Zoho CRM's own history shows every write
 * this connector makes under the one shared connection identity, not the
 * staff member who actually triggered it.
 */
export default function SyncLogTable({ rows, emptyText }) {
  const t = useT();
  if (!rows || !rows.length) return <p className="muted">{emptyText || t('common.syncLog.empty')}</p>;
  return (
    <div className="t-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">{t('common.syncLog.when')}</th>
            <th scope="col">{t('common.syncLog.entity')}</th>
            <th scope="col">{t('common.syncLog.operation')}</th>
            <th scope="col">{t('common.syncLog.direction')}</th>
            <th scope="col">{t('common.syncLog.result')}</th>
            <th scope="col">{t('common.syncLog.crmRecord')}</th>
            <th scope="col">{t('common.syncLog.fields')}</th>
            <th scope="col">{t('common.syncLog.message')}</th>
            <th scope="col">{t('common.syncLog.triggeredBy')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id}>
              <td>{fmtDate(l.occurredAt)}</td>
              <td>{l.entityType || <span className="muted">—</span>}</td>
              <td>{l.operation || <span className="muted">—</span>}</td>
              <td className="muted">
                {(DIRECTION_KEY[l.direction] && t(`common.syncLog.directionValue.${DIRECTION_KEY[l.direction]}`)) || l.direction || '—'}
              </td>
              {/* 'Synced'/'Error' are the Pill tone-lookup keys, not display
                  prose — left in English like every other Pill value. */}
              <td><Pill value={l.result === 'success' ? 'Synced' : 'Error'} /></td>
              <td className="mono">
                {l.crmRecordId
                  ? `${l.crmModule || 'CRM'} ${l.crmRecordId}`
                  : <span className="muted">—</span>}
              </td>
              <td className="muted">
                {l.changedFields && l.changedFields.length ? l.changedFields.join(', ') : '—'}
              </td>
              <td>{l.message || <span className="muted">—</span>}</td>
              <td>{l.triggeredBy || <span className="muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
