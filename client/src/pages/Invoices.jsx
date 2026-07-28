import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi, useDebounced } from '../useApi.js';
import { api } from '../api.js';
import {
  Async, Card, Pill, Pagination, SearchBox, FilterSelect, SourceBadge, ReadOnlyBadge,
  fmtDate, fmtMoney
} from '../components/Ui.jsx';

/**
 * Finance — invoices from Zoho Books.
 *
 * Paginated by Books itself rather than in the browser, because a Books org can
 * hold far more invoices than it would be sensible to fetch. Books does not
 * return a total count, so this shows "Page n" and a Next button that is enabled
 * only when Books reports another page — an invented total would be a guess
 * presented as a fact.
 *
 * Read-only throughout: there is no create, edit, payment or delete control,
 * and the backend exposes no route that would accept one.
 */
export default function Invoices() {
  const [params] = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(params.get('status') || '');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const customerId = params.get('customerId') || '';
  const debouncedSearch = useDebounced(search, 350);

  const query = {
    page, perPage: 25,
    search: debouncedSearch || undefined,
    status: status || undefined,
    customerId: customerId || undefined,
    dateStart: dateStart || undefined,
    dateEnd: dateEnd || undefined
  };

  const state = useApi((o) => api.invoices(query, o), [
    page, debouncedSearch, status, customerId, dateStart, dateEnd
  ]);

  // Any filter change invalidates the current page number.
  const changeFilter = (setter) => (v) => { setter(v); setPage(1); };

  const statuses = (state.meta && state.meta.statuses) || [];

  return (
    <>
      <div className="page-head">
        <h1>Finance</h1>
        <p>
          Invoices from Zoho Books. This application reads invoices only —
          creating, editing, paying and deleting are done in Zoho Books.
        </p>
      </div>

      <Card
        title="Invoices"
        action={(
          <div className="head-actions">
            <SourceBadge source="books" />
            <ReadOnlyBadge system="Zoho Books" />
          </div>
        )}
      >
        {customerId && (
          <p className="note">
            Filtered to Zoho Books customer <span className="mono">{customerId}</span>.{' '}
            <Link to="/invoices">Show all invoices</Link>.
          </p>
        )}

        <div className="toolbar">
          <SearchBox
            id="invoice-search"
            label="Search"
            value={search}
            onChange={changeFilter(setSearch)}
            placeholder="Invoice number or customer"
          />
          <FilterSelect
            id="invoice-status"
            label="Status"
            value={status}
            onChange={changeFilter(setStatus)}
            options={statuses}
            allLabel="All statuses"
          />
          <div className="field">
            <label htmlFor="invoice-from">Invoiced from</label>
            <input
              id="invoice-from"
              type="date"
              value={dateStart}
              onChange={(e) => changeFilter(setDateStart)(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="invoice-to">Invoiced to</label>
            <input
              id="invoice-to"
              type="date"
              value={dateEnd}
              onChange={(e) => changeFilter(setDateEnd)(e.target.value)}
            />
          </div>
        </div>

        <Async
          state={state}
          empty={{
            title: 'No invoices match',
            message: 'Try a different search term, status or date range.'
          }}
        >
          {(rows, meta) => (
            <>
              <div className="t-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Invoice</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Date</th>
                      <th scope="col">Due</th>
                      <th scope="col">Status</th>
                      <th scope="col">Subtotal</th>
                      <th scope="col">Tax</th>
                      <th scope="col">Total</th>
                      <th scope="col">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((inv) => (
                      <tr key={inv.id}>
                        <td><Link to={`/invoices/${inv.id}`}>{inv.invoiceNumber || inv.id}</Link></td>
                        <td>
                          {inv.customerName || <span className="muted">—</span>}
                          {inv.email && <div className="muted small">{inv.email}</div>}
                        </td>
                        <td>{fmtDate(inv.invoiceDate)}</td>
                        <td>{fmtDate(inv.dueDate)}</td>
                        <td>
                          <Pill value={inv.statusLabel} />
                          {inv.paymentStatus !== inv.statusLabel && (
                            <div className="muted small">{inv.paymentStatus}</div>
                          )}
                        </td>
                        <td className="mono">{fmtMoney(inv.subTotal, inv.currency, { cents: true })}</td>
                        <td className="mono">{fmtMoney(inv.tax, inv.currency, { cents: true })}</td>
                        <td className="mono">{fmtMoney(inv.total, inv.currency, { cents: true })}</td>
                        <td className="mono">{fmtMoney(inv.balance, inv.currency, { cents: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={meta.page}
                hasMore={meta.hasMore}
                onPage={setPage}
                busy={state.status === 'loading'}
              />
            </>
          )}
        </Async>
      </Card>
    </>
  );
}
