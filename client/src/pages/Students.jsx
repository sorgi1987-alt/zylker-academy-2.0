import React from 'react';
import { Link } from 'react-router-dom';
import { usePagedList } from '../useApi.js';
import { api } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import { useT } from '../i18n/I18nContext.jsx';
import {
  Async, Card, Pill, Pagination, SearchBox, FilterSelect, SourceBadge, fmtDate
} from '../components/Ui.jsx';

// Live CRM status values — also used as the ?status= filter param and as
// Pill's tone-lookup key, so left untranslated.
const STATUSES = ['Applicant', 'Active', 'Withdrawn', 'Alumni'];

export default function Students() {
  const t = useT();
  const can = useCan();
  const list = usePagedList(api.students);

  return (
    <>
      <div className="page-head">
        <h1>{t('students.pageTitle')}</h1>
        <p>{t('students.pageIntro')}</p>
      </div>

      <Card
        title={t('students.allStudents')}
        action={(
          <div className="head-actions">
            <SourceBadge source="crm" />
            {can('student:write') && <Link className="btn primary" to="/students/new">{t('students.addStudent')}</Link>}
          </div>
        )}
      >
        <div className="toolbar">
          <SearchBox
            id="student-search"
            label={t('students.searchLabel')}
            value={list.search}
            onChange={list.setSearch}
            placeholder={t('students.searchPlaceholder')}
          />
          <FilterSelect
            id="student-status"
            label={t('students.statusLabel')}
            value={list.filters.status || ''}
            onChange={(v) => list.setFilter('status', v)}
            options={STATUSES}
            allLabel={t('students.allStatuses')}
          />
        </div>

        <Async
          state={list}
          empty={{
            title: t('students.empty.title'),
            message: list.search || list.filters.status
              ? t('students.empty.filtered')
              : t('students.empty.default')
          }}
        >
          {(rows, meta) => (
            <>
              <div className="t-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t('students.table.name')}</th>
                      <th scope="col">{t('students.table.studentId')}</th>
                      <th scope="col">{t('students.table.email')}</th>
                      <th scope="col">{t('students.table.status')}</th>
                      <th scope="col">{t('students.table.programme')}</th>
                      <th scope="col">{t('students.table.enrolment')}</th>
                      <th scope="col">{t('students.table.added')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => (
                      <tr key={s.id}>
                        <td><Link to={`/students/${s.id}`}>{s.fullName || t('students.unnamed')}</Link></td>
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
                  {t('students.showingRecent', { total: meta.total })}
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
