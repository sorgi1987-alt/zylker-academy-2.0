import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { api } from '../api.js';
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
  const { id } = useParams();
  const state = useApi((o) => api.invoice(id, o), [id]);

  return (
    <Async state={state} empty={{ title: 'Invoice not found' }} emptyWhen={(d) => !d}>
      {(inv) => (
        <>
          <div className="page-head">
            <h1>Invoice {inv.invoiceNumber || inv.id}</h1>
            <p>
              <Pill value={inv.statusLabel} />{' '}
              <span className="muted">{inv.paymentStatus}</span>
            </p>
            <div className="head-actions">
              <Link className="btn" to="/invoices">Back to Finance</Link>
              {inv.booksUrl && (
                <a className="btn" href={inv.booksUrl} target="_blank" rel="noreferrer noopener">
                  Open in Zoho Books
                </a>
              )}
            </div>
          </div>

          <div className="grid g-2">
            <Card
              title="Invoice"
              action={<div className="head-actions"><SourceBadge source="books" /><ReadOnlyBadge system="Zoho Books" /></div>}
            >
              <dl className="dl">
                <dt>Invoice number</dt><dd className="mono">{inv.invoiceNumber || '—'}</dd>
                <dt>Reference</dt><dd className="mono">{inv.referenceNumber || '—'}</dd>
                <dt>Customer</dt><dd>{inv.customerName || '—'}</dd>
                <dt>Email</dt><dd>{inv.email || '—'}</dd>
                <dt>Invoice date</dt><dd>{fmtDate(inv.invoiceDate)}</dd>
                <dt>Due date</dt><dd>{fmtDate(inv.dueDate)}</dd>
                <dt>Status</dt><dd><Pill value={inv.statusLabel} /></dd>
                <dt>Payment status</dt><dd>{inv.paymentStatus}</dd>
                <dt>Currency</dt><dd className="mono">{inv.currency || '—'}</dd>
              </dl>
            </Card>

            <Card title="Amounts" action={<SourceBadge source="books" />}>
              <dl className="dl">
                <dt>Subtotal</dt><dd className="mono">{fmtMoney(inv.subTotal, inv.currency, { cents: true })}</dd>
                <dt>Tax</dt><dd className="mono">{fmtMoney(inv.tax, inv.currency, { cents: true })}</dd>
                <dt>Total</dt><dd className="mono"><strong>{fmtMoney(inv.total, inv.currency, { cents: true })}</strong></dd>
                <dt>Paid</dt><dd className="mono">{fmtMoney(inv.paymentsMade, inv.currency, { cents: true })}</dd>
                <dt>Credits applied</dt><dd className="mono">{fmtMoney(inv.creditsApplied, inv.currency, { cents: true })}</dd>
                <dt>Balance due</dt><dd className="mono"><strong>{fmtMoney(inv.balance, inv.currency, { cents: true })}</strong></dd>
              </dl>
            </Card>
          </div>

          <Card title="Line items" action={<SourceBadge source="books" />}>
            {inv.lineItems.length ? (
              <div className="t-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col">Quantity</th>
                      <th scope="col">Rate</th>
                      <th scope="col">Tax</th>
                      <th scope="col">Total</th>
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
            ) : <p className="muted">This invoice has no line items.</p>}
          </Card>

          <Card title="Payments" action={<SourceBadge source="books" />}>
            {inv.payments.length ? (
              <div className="t-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Amount</th>
                      <th scope="col">Method</th>
                      <th scope="col">Reference</th>
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
                No payment records were returned for this invoice. If payments exist in
                Zoho Books, the connection may not carry the scope needed to read them.
              </p>
            )}
          </Card>

          {(inv.notes || inv.terms) && (
            <Card title="Notes and terms" action={<SourceBadge source="books" />}>
              {inv.notes && <><h3>Notes</h3><p className="muted">{inv.notes}</p></>}
              {inv.terms && <><h3>Terms</h3><p className="muted">{inv.terms}</p></>}
            </Card>
          )}
        </>
      )}
    </Async>
  );
}
