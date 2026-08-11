import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { api } from '../api.js';
import {
  Async, Card, Pill, SourceBadge, ReadOnlyBadge, fmtDate
} from '../components/Ui.jsx';

/**
 * Ticket detail. Read-only: there is no action on this page that changes a
 * support record, and the backend has no route that would accept one.
 */
export default function TicketDetail() {
  const { id } = useParams();
  const state = useApi((o) => api.ticket(id, o), [id]);

  return (
    <Async state={state} empty={{ title: 'Ticket not found' }} emptyWhen={(d) => !d}>
      {(t) => (
        <>
          <div className="page-head">
            <h1>{t.subject || `Ticket ${t.ticketNumber || t.id}`}</h1>
            <p>
              <Pill value={t.status} />{' '}
              {t.overdue && <span className="pill stop">Overdue</span>}{' '}
              <span className="muted">{t.priority}</span>
            </p>
            <div className="head-actions">
              <Link className="btn" to="/tickets">Back to Support</Link>
              {t.webUrl && (
                <a className="btn" href={t.webUrl} target="_blank" rel="noreferrer noopener">
                  Open in Zoho Desk
                </a>
              )}
            </div>
          </div>

          <div className="grid g-2">
            <Card
              title="Ticket"
              action={<div className="head-actions"><SourceBadge source="desk" /><ReadOnlyBadge system="Zoho Desk" /></div>}
            >
              <dl className="dl">
                <dt>Ticket number</dt><dd className="mono">{t.ticketNumber || '—'}</dd>
                <dt>Status</dt><dd><Pill value={t.status} /></dd>
                <dt>Priority</dt><dd>{t.priority || '—'}</dd>
                <dt>Category</dt><dd>{t.category || '—'}</dd>
                <dt>Contact email</dt><dd>{t.email || '—'}</dd>
              </dl>
            </Card>

            <Card title="Dates" action={<SourceBadge source="desk" />}>
              <dl className="dl">
                <dt>Created</dt><dd>{fmtDate(t.createdTime)}</dd>
                <dt>Last modified</dt><dd>{fmtDate(t.modifiedTime)}</dd>
                <dt>Due</dt><dd>{t.dueDate ? fmtDate(t.dueDate) : '—'}</dd>
                <dt>Closed</dt><dd>{t.closedTime ? fmtDate(t.closedTime) : '—'}</dd>
                <dt>Thread messages</dt><dd className="mono">{t.threadCount ?? '—'}</dd>
              </dl>
            </Card>
          </div>

          {t.description && (
            <Card title="Description" action={<SourceBadge source="desk" />}>
              <p className="muted">{t.description}</p>
            </Card>
          )}
        </>
      )}
    </Async>
  );
}
