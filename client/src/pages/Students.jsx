import React from 'react';
import { Link } from 'react-router-dom';
import { usePagedList } from '../useApi.js';
import { api } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import {
  Async, Card, Pill, Pagination, SearchBox, FilterSelect, SourceBadge, fmtDate
} from '../components/Ui.jsx';

const STATUSES = ['Applicant', 'Active', 'Withdrawn', 'Alumni'];

export default function Students() {
  const can = useCan();
  const list = usePagedList(api.students);

  return (
    <>
      <div className="page-head">
        <h1>Students</h1>
        <p>Student records held in Zoho CRM, with their current application and enrolment.</p>
      </div>

      <Card
        title="All students"
        action={(
          <div className="head-actions">
            <SourceBadge source="crm" />
            {can('student:write') && <Link className="btn primary" to="/students/new">Add student</Link>}
          </div>
        )}
      >
        <div className="toolbar">
          <SearchBox
            id="student-search"
            label="Search"
            value={list.search}
            onChange={list.setSearch}
            placeholder="Name, email or student ID"
          />
          <FilterSelect
            id="student-status"
            label="Status"
            value={list.filters.status || ''}
            onChange={(v) => list.setFilter('status', v)}
            options={STATUSES}
            allLabel="All statuses"
          />
        </div>

        <Async
          state={list}
          empty={{
            title: 'No students match',
            message: list.search || list.filters.status
              ? 'Try a different search term or clear the filters.'
              : 'No student records were returned from CRM.'
          }}
        >
          {(rows, meta) => (
            <>
              <div className="t-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Student ID</th>
                      <th scope="col">Email</th>
                      <th scope="col">Status</th>
                      <th scope="col">Programme</th>
                      <th scope="col">Enrolment</th>
                      <th scope="col">Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => (
                      <tr key={s.id}>
                        <td><Link to={`/students/${s.id}`}>{s.fullName || 'Unnamed'}</Link></td>
                        <td className="mono">{s.studentId || <span className="muted">—</span>}</td>
                        <td>{s.email || <span className="muted">—</span>}</td>
                        <td><Pill value={s.status} /></td>
                        <td>{s.programme ? s.programme.name : <span className="muted">—</span>}</td>
                        <td>{s.enrolmentStatus ? <Pill value={s.enrolmentStatus} /> : <span className="muted">—</span>}</td>
                        <td>{fmtDate(s.createdTime)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {meta.capped && (
                <p className="note">
                  Showing the most recent {meta.total} records. Narrow the search to see older ones.
                </p>
              )}

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
