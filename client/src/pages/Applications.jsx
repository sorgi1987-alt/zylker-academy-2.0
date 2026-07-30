import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePagedList } from '../useApi.js';
import { api } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import {
  Async, Card, Pill, Pagination, SearchBox, FilterSelect, FilterChips, SourceBadge, fmtDate, fmtMoney
} from '../components/Ui.jsx';

export default function Applications() {
  const can = useCan();
  const [params] = useSearchParams();
  // A dashboard card can deep-link into a pre-filtered list.
  const list = usePagedList(api.applications, {
    initialFilters: {
      stage: params.get('stage') || undefined,
      // Set by the dashboard's "Applications awaiting action" card: the three
      // stages where the next move is ours.
      awaitingAction: params.get('awaitingAction') || undefined
    }
  });

  const stages = (list.meta && list.meta.stages) || [];

  return (
    <>
      <div className="page-head">
        <h1>Applications</h1>
        <p>Admissions applications held in Zoho CRM, with their current stage.</p>
      </div>

      <Card
        title="All applications"
        action={(
          <div className="head-actions">
            <SourceBadge source="crm" />
            {can('application:write') && (
              <Link className="btn primary" to="/applications/new">New application</Link>
            )}
          </div>
        )}
      >
        <div className="toolbar">
          <SearchBox
            id="application-search"
            label="Search"
            value={list.search}
            onChange={list.setSearch}
            placeholder="Applicant, email or application ID"
          />
          <FilterSelect
            id="application-stage"
            label="Stage"
            value={list.filters.stage || ''}
            onChange={(v) => list.setFilter('stage', v)}
            options={stages}
            allLabel="All stages"
          />
        </div>

        {/* A dashboard card or attention item may have applied this, so it is
            stated rather than left to be inferred from the row count. */}
        <FilterChips
          chips={[
            list.filters.stage && {
              key: 'stage', label: 'Stage', value: list.filters.stage,
              onClear: () => list.setFilter('stage', '')
            },
            list.filters.awaitingAction === 'true' && {
              key: 'awaitingAction', label: 'Queue', value: 'Awaiting our action',
              onClear: () => list.setFilter('awaitingAction', '')
            },
            list.search && {
              key: 'search', label: 'Search', value: list.search,
              onClear: () => list.setSearch('')
            }
          ]}
          onClearAll={list.clearFilters}
        />

        <Async
          state={list}
          empty={{
            title: 'No applications match',
            message: 'Try a different search term or clear the stage filter.'
          }}
        >
          {(rows, meta) => (
            <>
              <div className="t-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Application</th>
                      <th scope="col">Applicant</th>
                      <th scope="col">Stage</th>
                      <th scope="col">Programme</th>
                      <th scope="col">Intake</th>
                      <th scope="col">Applied</th>
                      <th scope="col">Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id}>
                        <td><Link to={`/applications/${a.id}`}>{a.name || a.applicationId || a.id}</Link></td>
                        <td>
                          {a.applicantName || <span className="muted">—</span>}
                          {a.applicantEmail && <div className="muted small">{a.applicantEmail}</div>}
                        </td>
                        <td><Pill value={a.stage} /></td>
                        <td>{a.programme ? a.programme.name : <span className="muted">—</span>}</td>
                        <td>{a.intake ? a.intake.name : <span className="muted">—</span>}</td>
                        <td>{fmtDate(a.applicationDate)}</td>
                        <td className="mono">{fmtMoney(a.tuitionFee)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={meta.page}
                totalPages={meta.totalPages}
                total={meta.total}
                onPage={list.setPage}
                busy={list.status === 'loading'}
              />
            </>
          )}
        </Async>
      </Card>
    </>
  );
}
