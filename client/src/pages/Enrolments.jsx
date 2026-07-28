import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePagedList } from '../useApi.js';
import { api } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import {
  Async, Card, Pill, Pagination, SearchBox, FilterSelect, SourceBadge, fmtDate
} from '../components/Ui.jsx';

export default function Enrolments() {
  const can = useCan();
  const [params] = useSearchParams();
  const list = usePagedList(api.enrolments, {
    initialFilters: { status: params.get('status') || undefined }
  });

  const statuses = (list.meta && list.meta.statuses) || [];

  return (
    <>
      <div className="page-head">
        <h1>Enrolments</h1>
        <p>Enrolment records in Zoho CRM, linking a student to a programme and intake.</p>
      </div>

      <Card
        title="All enrolments"
        action={(
          <div className="head-actions">
            <SourceBadge source="crm" />
            {can('enrolment:write') && (
              <Link className="btn primary" to="/enrolments/new">New enrolment</Link>
            )}
          </div>
        )}
      >
        <div className="toolbar">
          <SearchBox
            id="enrolment-search"
            label="Search"
            value={list.search}
            onChange={list.setSearch}
            placeholder="Student name, email or reference"
          />
          <FilterSelect
            id="enrolment-status"
            label="Status"
            value={list.filters.status || ''}
            onChange={(v) => list.setFilter('status', v)}
            options={statuses}
            allLabel="All statuses"
          />
        </div>

        <Async state={list} empty={{ title: 'No enrolments match' }}>
          {(rows, meta) => (
            <>
              <div className="t-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Reference</th>
                      <th scope="col">Student</th>
                      <th scope="col">Programme</th>
                      <th scope="col">Intake</th>
                      <th scope="col">Status</th>
                      <th scope="col">Enrolled</th>
                      <th scope="col">Progress</th>
                      <th scope="col">LMS sync</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e) => (
                      <tr key={e.id}>
                        <td><Link to={`/enrolments/${e.id}`}>{e.reference || e.externalReference || e.id}</Link></td>
                        <td>
                          {e.student
                            ? <Link to={`/students/${e.student.id}`}>{e.studentName || e.student.name}</Link>
                            : <span className="muted">—</span>}
                        </td>
                        <td>{e.programme ? e.programme.name : <span className="muted">—</span>}</td>
                        <td>{e.intake ? e.intake.name : <span className="muted">—</span>}</td>
                        <td><Pill value={e.status} /></td>
                        <td>{fmtDate(e.enrolmentDate)}</td>
                        <td className="mono">
                          {e.lms.progressPercentage === null ? '—' : `${e.lms.progressPercentage}%`}
                        </td>
                        <td><Pill value={e.lms.syncStatus} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="note">
                Progress and sync status are the values the external LMS connector last
                wrote onto each CRM enrolment. Open the Learning Hub to see the current
                position held by the connector, which may be newer.
              </p>

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
