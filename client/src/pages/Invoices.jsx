import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi, useDebounced } from '../useApi.js';
import { api } from '../api.js';
import { useT } from '../i18n/I18nContext.jsx';
import {
  Async, Card, Pill, Pagination, SearchBox, FilterSelect, FilterChips, SourceBadge, ReadOnlyBadge,
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
  const t = useT();
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
  // Books returns machine statuses; the chip shows the label the filter offered.
  const statusLabel = (v) => (statuses.find((s) => s.value === v) || {}).label || v;

  return (
    <>
      <div className="page-head">
        <h1>{t('invoices.pageTitle')}</h1>
        <p>{t('invoices.pageIntro')}</p>
      </div>

      <Card
        title={t('invoices.cardTitle')}
        action={(
          <div className="head-actions">
            <SourceBadge source="books" />
            <ReadOnlyBadge system="Zoho Books" />
          </div>
        )}
      >
        {customerId && (
          <p className="note">
            {t('invoices.filteredToCustomer')} <span className="mono">{customerId}</span>.{' '}
            <Link to="/invoices">{t('invoices.showAllInvoices')}</Link>.
          </p>
        )}

        <div className="toolbar">
          <SearchBox
            id="invoice-search"
            label={t('common.search')}
            value={search}
            onChange={changeFilter(setSearch)}
            placeholder={t('invoices.searchPlaceholder')}
          />
          <FilterSelect
            id="invoice-status"
            label={t('invoices.status.label')}
            value={status}
            onChange={changeFilter(setStatus)}
            options={statuses}
            allLabel={t('invoices.status.all')}
          />
          <div className="field">
            <label htmlFor="invoice-from">{t('invoices.invoicedFrom')}</label>
            <input
              id="invoice-from"
              type="date"
              value={dateStart}
              onChange={(e) => changeFilter(setDateStart)(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="invoice-to">{t('invoices.invoicedTo')}</label>
            <input
              id="invoice-to"
              type="date"
              value={dateEnd}
              onChange={(e) => changeFilter(setDateEnd)(e.target.value)}
            />
          </div>
        </div>

        {/* The dashboard's overdue card and the attention item both land here
            with a status applied, so it is named on arrival. */}
        <FilterChips
          chips={[
            status && {
              key: 'status', label: t('invoices.filters.status'), value: statusLabel(status),
              onClear: () => changeFilter(setStatus)('')
            },
            dateStart && {
              key: 'from', label: t('invoices.filters.from'), value: dateStart,
              onClear: () => changeFilter(setDateStart)('')
            },
            dateEnd && {
              key: 'to', label: t('invoices.filters.to'), value: dateEnd,
              onClear: () => changeFilter(setDateEnd)('')
            },
            search && {
              key: 'search', label: t('common.search'), value: search,
              onClear: () => changeFilter(setSearch)('')
            }
          ]}
          onClearAll={() => {
            setStatus(''); setDateStart(''); setDateEnd(''); setSearch(''); setPage(1);
          }}
        />

        <Async
          state={state}
          empty={{
            title: t('invoices.empty.title'),
            message: t('invoices.empty.message')
          }}
        >
          {(rows, meta) => (
            <>
              <div className="t-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t('invoices.table.invoice')}</th>
                      <th scope="col">{t('invoices.table.customer')}</th>
                      <th scope="col">{t('invoices.table.date')}</th>
                      <th scope="col">{t('invoices.table.due')}</th>
                      <th scope="col">{t('invoices.table.status')}</th>
                      <th scope="col">{t('invoices.table.subtotal')}</th>
                      <th scope="col">{t('invoices.table.tax')}</th>
                      <th scope="col">{t('invoices.table.total')}</th>
                      <th scope="col">{t('invoices.table.balance')}</th>
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
