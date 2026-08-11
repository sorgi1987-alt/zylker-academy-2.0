import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { api } from '../api.js';
import { useT } from '../i18n/I18nContext.jsx';
import {
  Async, Card, Pill, SourceBadge, ReadOnlyBadge, fmtDate
} from '../components/Ui.jsx';

/**
 * Ticket detail. Read-only: there is no action on this page that changes a
 * support record, and the backend has no route that would accept one.
 */
export default function TicketDetail() {
  const t = useT();
  const { id } = useParams();
  const state = useApi((o) => api.ticket(id, o), [id]);

  return (
    <Async state={state} empty={{ title: t('ticketDetail.notFound') }} emptyWhen={(d) => !d}>
      {(tk) => (
        <>
          <div className="page-head">
            <h1>{tk.subject || t('ticketDetail.fallbackHeading', { number: tk.ticketNumber || tk.id })}</h1>
            <p>
              <Pill value={tk.status} />{' '}
              {tk.overdue && <span className="pill stop">{t('ticketDetail.overdue')}</span>}{' '}
              <span className="muted">{tk.priority}</span>
            </p>
            <div className="head-actions">
              <Link className="btn" to="/tickets">{t('ticketDetail.backToSupport')}</Link>
              {tk.webUrl && (
                <a className="btn" href={tk.webUrl} target="_blank" rel="noreferrer noopener">
                  {t('ticketDetail.openInDesk')}
                </a>
              )}
            </div>
          </div>

          <div className="grid g-2">
            <Card
              title={t('ticketDetail.cardTicket')}
              action={<div className="head-actions"><SourceBadge source="desk" /><ReadOnlyBadge system="Zoho Desk" /></div>}
            >
              <dl className="dl">
                <dt>{t('ticketDetail.field.ticketNumber')}</dt><dd className="mono">{tk.ticketNumber || '—'}</dd>
                <dt>{t('ticketDetail.field.status')}</dt><dd><Pill value={tk.status} /></dd>
                <dt>{t('ticketDetail.field.priority')}</dt><dd>{tk.priority || '—'}</dd>
                <dt>{t('ticketDetail.field.category')}</dt><dd>{tk.category || '—'}</dd>
                <dt>{t('ticketDetail.field.contactEmail')}</dt><dd>{tk.email || '—'}</dd>
              </dl>
            </Card>

            <Card title={t('ticketDetail.cardDates')} action={<SourceBadge source="desk" />}>
              <dl className="dl">
                <dt>{t('ticketDetail.field.created')}</dt><dd>{fmtDate(tk.createdTime)}</dd>
                <dt>{t('ticketDetail.field.lastModified')}</dt><dd>{fmtDate(tk.modifiedTime)}</dd>
                <dt>{t('ticketDetail.field.due')}</dt><dd>{tk.dueDate ? fmtDate(tk.dueDate) : '—'}</dd>
                <dt>{t('ticketDetail.field.closed')}</dt><dd>{tk.closedTime ? fmtDate(tk.closedTime) : '—'}</dd>
                <dt>{t('ticketDetail.field.threadMessages')}</dt><dd className="mono">{tk.threadCount ?? '—'}</dd>
              </dl>
            </Card>
          </div>

          {tk.description && (
            <Card title={t('ticketDetail.cardDescription')} action={<SourceBadge source="desk" />}>
              <p className="muted">{tk.description}</p>
            </Card>
          )}
        </>
      )}
    </Async>
  );
}
