import React from 'react';
import { Pill, fmtDate } from './Ui.jsx';

/**
 * The connector's synchronisation history.
 *
 * Every row names who triggered it. That attribution is the reason the log is
 * worth keeping: "the integration changed it" is not an answer six months later
 * when someone asks why a CRM field holds what it holds.
 */
export default function SyncLogTable({ rows, emptyText = 'Nothing has been synchronised yet.' }) {
  if (!rows || !rows.length) return <p className="muted">{emptyText}</p>;
  return (
    <div className="t-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Entity</th>
            <th scope="col">Operation</th>
            <th scope="col">Result</th>
            <th scope="col">CRM record</th>
            <th scope="col">Fields</th>
            <th scope="col">Message</th>
            <th scope="col">Triggered by</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id}>
              <td>{fmtDate(l.occurredAt)}</td>
              <td>{l.entityType || <span className="muted">—</span>}</td>
              <td>{l.operation || <span className="muted">—</span>}</td>
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
