import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { api } from '../api.js';
import { useT } from '../i18n/I18nContext.jsx';
import {
  Async, Card, Pill, SourceBadge, ReadOnlyBadge, fmtDate, fmtMoney
} from '../components/Ui.jsx';

/**
 * Invoice detail. Read-only: there is no action on this page that changes an
 * accounting record, and the backend has no route that would accept one.
 * Payment information is shown when the connection's scopes return it, and its
 * absence is stated rather than rendered as "no payments".
 */
export default function InvoiceDetail() {
  const t = useT();
  const { id } = useParams();
  const state = useApi((o) => api.invoice(id, o), [id]);

  return (
    <Async state={state} empty={{ title: t('invoiceDetail.notFound') }} emptyWhen={(d) => !d}>
      {(inv) => (
        <>
          <div className="page-head">
            <h1>{t('invoiceDetail.heading', { number: inv.invoiceNumber || inv.id })}</h1>
            <p>
              <Pill value={inv.statusLabel} />{' '}
              <span className="muted">{inv.paymentStatus}</span>
            </p>
            <div className="head-actions">
              <Link className="btn" to="/invoices">{t('invoiceDetail.backToFinance')}</Link>
              {inv.booksUrl && (
                <a className="btn" href={inv.booksUrl} target="_blank" rel="noreferrer noopener">
                  {t('invoiceDetail.openInBooks')}
                </a>
              )}
            </div>
          </div>

          <div className="grid g-2">
            <Card
              title={t('invoiceDetail.cardInvoice')}
              action={<div className="head-actions"><SourceBadge source="books" /><ReadOnlyBadge system="Zoho Books" /></div>}
            >
              <dl className="dl">
                <dt>{t('invoiceDetail.field.invoiceNumber')}</dt><dd className="mono">{inv.invoiceNumber || '—'}</dd>
                <dt>{t('invoiceDetail.field.reference')}</dt><dd className="mono">{inv.referenceNumber || '—'}</dd>
                <dt>{t('invoiceDetail.field.customer')}</dt><dd>{inv.customerName || '—'}</dd>
                <dt>{t('invoiceDetail.field.email')}</dt><dd>{inv.email || '—'}</dd>
                <dt>{t('invoiceDetail.field.invoiceDate')}</dt><dd>{fmtDate(inv.invoiceDate)}</dd>
                <dt>{t('invoiceDetail.field.dueDate')}</dt><dd>{fmtDate(inv.dueDate)}</dd>
                <dt>{t('invoiceDetail.field.status')}</dt><dd><Pill value={inv.statusLabel} /></dd>
                <dt>{t('invoiceDetail.field.paymentStatus')}</dt><dd>{inv.paymentStatus}</dd>
                <dt>{t('invoiceDetail.field.currency')}</dt><dd className="mono">{inv.currency || '—'}</dd>
              </dl>
            </Card>

            <Card title={t('invoiceDetail.cardAmounts')} action={<SourceBadge source="books" />}>
              <dl className="dl">
                <dt>{t('invoiceDetail.field.subtotal')}</dt><dd className="mono">{fmtMoney(inv.subTotal, inv.currency, { cents: true })}</dd>
                <dt>{t('invoiceDetail.field.tax')}</dt><dd className="mono">{fmtMoney(inv.tax, inv.currency, { cents: true })}</dd>
                <dt>{t('invoiceDetail.field.total')}</dt><dd className="mono"><strong>{fmtMoney(inv.total, inv.currency, { cents: true })}</strong></dd>
                <dt>{t('invoiceDetail.field.paid')}</dt><dd className="mono">{fmtMoney(inv.paymentsMade, inv.currency, { cents: true })}</dd>
                <dt>{t('invoiceDetail.field.creditsApplied')}</dt><dd className="mono">{fmtMoney(inv.creditsApplied, inv.currency, { cents: true })}</dd>
                <dt>{t('invoiceDetail.field.balanceDue')}</dt><dd className="mono"><strong>{fmtMoney(inv.balance, inv.currency, { cents: true })}</strong></dd>
              </dl>
            </Card>
          </div>

          <Card title={t('invoiceDetail.cardLineItems')} action={<SourceBadge source="books" />}>
            {inv.lineItems.length ? (
              <div className="t-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t('invoiceDetail.lineItemsTable.item')}</th>
                      <th scope="col">{t('invoiceDetail.lineItemsTable.quantity')}</th>
                      <th scope="col">{t('invoiceDetail.lineItemsTable.rate')}</th>
                      <th scope="col">{t('invoiceDetail.lineItemsTable.tax')}</th>
                      <th scope="col">{t('invoiceDetail.lineItemsTable.total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inv.lineItems.map((li) => (
                      <tr key={li.id}>
                        <td>
                          {li.name}
                          {li.description && <div className="muted small">{li.description}</div>}
                        </td>
                        <td className="mono">{li.quantity ?? '—'}{li.unit ? ` ${li.unit}` : ''}</td>
                        <td className="mono">{fmtMoney(li.rate, inv.currency, { cents: true })}</td>
                        <td className="mono">
                          {li.taxPercentage === null || li.taxPercentage === undefined
                            ? '—'
                            : `${li.taxPercentage}%`}
                        </td>
                        <td className="mono">{fmtMoney(li.total, inv.currency, { cents: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="muted">{t('invoiceDetail.noLineItems')}</p>}
          </Card>

          <Card title={t('invoiceDetail.cardPayments')} action={<SourceBadge source="books" />}>
            {inv.payments.length ? (
              <div className="t-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t('invoiceDetail.paymentsTable.date')}</th>
                      <th scope="col">{t('invoiceDetail.paymentsTable.amount')}</th>
                      <th scope="col">{t('invoiceDetail.paymentsTable.method')}</th>
                      <th scope="col">{t('invoiceDetail.paymentsTable.reference')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inv.payments.map((p) => (
                      <tr key={p.id}>
                        <td>{fmtDate(p.date)}</td>
                        <td className="mono">{fmtMoney(p.amount, inv.currency, { cents: true })}</td>
                        <td>{p.mode || '—'}</td>
                        <td className="mono">{p.reference || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">
                {t('invoiceDetail.noPayments')}
              </p>
            )}
          </Card>

          {(inv.notes || inv.terms) && (
            <Card title={t('invoiceDetail.cardNotesAndTerms')} action={<SourceBadge source="books" />}>
              {inv.notes && <><h3>{t('invoiceDetail.notes')}</h3><p className="muted">{inv.notes}</p></>}
              {inv.terms && <><h3>{t('invoiceDetail.terms')}</h3><p className="muted">{inv.terms}</p></>}
            </Card>
          )}
        </>
      )}
    </Async>
  );
}
