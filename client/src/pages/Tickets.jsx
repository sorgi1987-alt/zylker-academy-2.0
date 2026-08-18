import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi, useDebounced } from '../useApi.js';
import { api } from '../api.js';
import { useT } from '../i18n/I18nContext.jsx';
import {
  Async, Card, Pill, Pagination, SearchBox, FilterSelect, FilterChips, SourceBadge, ReadOnlyBadge,
  fmtDate
} from '../components/Ui.jsx';

/**
 * Support — tickets from Zoho Desk.
 *
 * Paginated by Desk itself, not the browser, because a support portal can hold
 * far more tickets than it would be sensible to fetch at once. Desk does not
 * return a total count or a "more pages" flag, so this shows "Page n" and a
 * Next button that is enabled only when a full page came back — an inferred
 * signal, not a fact Desk states, same honesty rule the Finance page follows
 * for Books.
 *
 * The status filter is `statusType` (Open / Closed / On Hold), Desk's own
 * fixed enum, rather than the org's custom status labels — those can be
 * renamed per organisation, so filtering on them would mean guessing.
 *
 * Read-only throughout: there is no create, reply or close control, and the
 * backend exposes no route that would accept one.
 */
export default function Tickets() {
  const t = useT();
  const [params] = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusType, setStatusType] = useState(params.get('statusType') || '');
  const contactId = params.get('contactId') || '';
  const debouncedSearch = useDebounced(search, 350);

  const query = {
    page, perPage: 25,
    search: debouncedSearch || undefined,
    statusType: statusType || undefined,
    contactId: contactId || undefined
  };

  const state = useApi((o) => api.tickets(query, o), [page, debouncedSearch, statusType, contactId]);

  const changeFilter = (setter) => (v) => { setter(v); setPage(1); };

  const statusTypes = (state.meta && state.meta.statusTypes) || [];

  return (
    <>
      <div className="page-head">
        <h1>{t('tickets.pageTitle')}</h1>
      </div>

      <Card
        title={t('tickets.cardTitle')}
        action={(
          <div className="head-actions">
            <SourceBadge source="desk" />
            <ReadOnlyBadge system="Zoho Desk" />
          </div>
        )}
      >
        {contactId && (
          <p className="note">
            {t('tickets.filteredToContact')} <span className="mono">{contactId}</span>.{' '}
            <Link to="/tickets">{t('tickets.showAllTickets')}</Link>.
          </p>
        )}

        <div className="toolbar">
          <SearchBox
            id="ticket-search"
            label={t('common.search')}
            value={search}
            onChange={changeFilter(setSearch)}
            placeholder={t('tickets.searchPlaceholder')}
          />
          <FilterSelect
            id="ticket-status-type"
            label={t('tickets.status.label')}
            value={statusType}
            onChange={changeFilter(setStatusType)}
            options={statusTypes}
            allLabel={t('tickets.status.all')}
          />
        </div>

        <FilterChips
          chips={[
            statusType && {
              key: 'statusType', label: t('tickets.filters.status'), value: statusType,
              onClear: () => changeFilter(setStatusType)('')
            },
            search && {
              key: 'search', label: t('common.search'), value: search,
              onClear: () => changeFilter(setSearch)('')
            }
          ]}
          onClearAll={() => { setStatusType(''); setSearch(''); setPage(1); }}
        />

        <Async
          state={state}
          empty={{
            title: t('tickets.empty.title'),
            message: t('tickets.empty.message')
          }}
        >
          {(rows, meta) => (
            <>
              <div className="t-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t('tickets.table.ticket')}</th>
                      <th scope="col">{t('tickets.table.subject')}</th>
                      <th scope="col">{t('tickets.table.status')}</th>
                      <th scope="col">{t('tickets.table.priority')}</th>
                      <th scope="col">{t('tickets.table.created')}</th>
                      <th scope="col">{t('tickets.table.due')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((tk) => (
                      <tr key={tk.id}>
                        <td><Link to={`/tickets/${tk.id}`}>{tk.ticketNumber || tk.id}</Link></td>
                        <td>
                          {tk.subject || <span className="muted">—</span>}
                          {tk.email && <div className="muted small">{tk.email}</div>}
                        </td>
                        <td>
                          <Pill value={tk.status} />
                          {tk.overdue && <div className="muted small">{t('tickets.overdue')}</div>}
                        </td>
                        <td>{tk.priority || <span className="muted">—</span>}</td>
                        <td>{fmtDate(tk.createdTime)}</td>
                        <td>{tk.dueDate ? fmtDate(tk.dueDate) : <span className="muted">—</span>}</td>
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
