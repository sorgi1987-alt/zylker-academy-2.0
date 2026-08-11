import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi, useDebounced } from '../useApi.js';
import { api } from '../api.js';
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
        <h1>Support</h1>
        <p>
          Tickets from Zoho Desk. This application reads tickets only — creating,
          replying to and closing them are done in Zoho Desk.
        </p>
      </div>

      <Card
        title="Tickets"
        action={(
          <div className="head-actions">
            <SourceBadge source="desk" />
            <ReadOnlyBadge system="Zoho Desk" />
          </div>
        )}
      >
        {contactId && (
          <p className="note">
            Filtered to Zoho Desk contact <span className="mono">{contactId}</span>.{' '}
            <Link to="/tickets">Show all tickets</Link>.
          </p>
        )}

        <div className="toolbar">
          <SearchBox
            id="ticket-search"
            label="Search"
            value={search}
            onChange={changeFilter(setSearch)}
            placeholder="Subject"
          />
          <FilterSelect
            id="ticket-status-type"
            label="Status"
            value={statusType}
            onChange={changeFilter(setStatusType)}
            options={statusTypes}
            allLabel="All statuses"
          />
        </div>

        <FilterChips
          chips={[
            statusType && {
              key: 'statusType', label: 'Status', value: statusType,
              onClear: () => changeFilter(setStatusType)('')
            },
            search && {
              key: 'search', label: 'Search', value: search,
              onClear: () => changeFilter(setSearch)('')
            }
          ]}
          onClearAll={() => { setStatusType(''); setSearch(''); setPage(1); }}
        />

        <Async
          state={state}
          empty={{
            title: 'No tickets match',
            message: 'Try a different search term or status.'
          }}
        >
          {(rows, meta) => (
            <>
              <div className="t-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Ticket</th>
                      <th scope="col">Subject</th>
                      <th scope="col">Status</th>
                      <th scope="col">Priority</th>
                      <th scope="col">Created</th>
                      <th scope="col">Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => (
                      <tr key={t.id}>
                        <td><Link to={`/tickets/${t.id}`}>{t.ticketNumber || t.id}</Link></td>
                        <td>
                          {t.subject || <span className="muted">—</span>}
                          {t.email && <div className="muted small">{t.email}</div>}
                        </td>
                        <td>
                          <Pill value={t.status} />
                          {t.overdue && <div className="muted small">Overdue</div>}
                        </td>
                        <td>{t.priority || <span className="muted">—</span>}</td>
                        <td>{fmtDate(t.createdTime)}</td>
                        <td>{t.dueDate ? fmtDate(t.dueDate) : <span className="muted">—</span>}</td>
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
