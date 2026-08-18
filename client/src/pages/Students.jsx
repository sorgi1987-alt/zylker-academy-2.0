import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePagedList } from '../useApi.js';
import { api } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import { useT } from '../i18n/I18nContext.jsx';
import {
  Async, Card, Pill, Pagination, SearchBox, FilterSelect, SourceBadge, ConfirmDialog, fmtDate
} from '../components/Ui.jsx';
import { useViews, ViewBar, ViewEditorModal } from '../components/ViewManager.jsx';
import { STUDENT_FIELDS } from '../viewFields.js';

// Live CRM status values — also used as the ?status= filter param and as
// Pill's tone-lookup key, so left untranslated.
const STATUSES = ['Applicant', 'Active', 'Withdrawn', 'Alumni'];

// The columns shown with no custom view selected — matches the table this
// page has always rendered. externalReference is a real, registered field
// (so a saved view can add it) but was never a default column, so it stays
// opt-in rather than appearing for everyone the day this shipped.
const DEFAULT_COLUMNS = ['studentId', 'email', 'status', 'programme', 'enrolmentStatus', 'createdTime'];

export default function Students() {
  const t = useT();
  const can = useCan();
  const list = usePagedList(api.students);
  const views = useViews('zylker.views.students');
  const [editingView, setEditingView] = useState(null); // null = closed, {} = new, {...} = editing
  const [deletingViewId, setDeletingViewId] = useState(null);

  // The active saved view's conditions/sort drive the request; switching back
  // to "All records" (activeView === null) clears them, restoring the plain
  // status-filter behaviour this page always had.
  useEffect(() => {
    const view = views.activeView;
    list.setFilter('conditions', view ? JSON.stringify(view.conditions) : undefined);
    list.setFilter('sortBy', view && view.sort ? view.sort.field : undefined);
    list.setFilter('sortDir', view && view.sort ? view.sort.direction : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views.activeView]);

  const columns = views.activeView ? views.activeView.columns : DEFAULT_COLUMNS;
  const has = (key) => columns.includes(key);

  return (
    <>
      <div className="page-head">
        <h1>{t('students.pageTitle')}</h1>
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
        <ViewBar
          views={views.views}
          activeViewId={views.activeViewId}
          defaultViewId={views.defaultViewId}
          onSelect={views.selectView}
          onNew={() => setEditingView({})}
          onEdit={(v) => setEditingView(v)}
          onDelete={(id) => setDeletingViewId(id)}
          onToggleDefault={views.toggleDefaultView}
        />

        <div className="toolbar">
          <SearchBox
            id="student-search"
            label={t('students.searchLabel')}
            value={list.search}
            onChange={list.setSearch}
            placeholder={t('students.searchPlaceholder')}
          />
          {!views.activeView && (
            <FilterSelect
              id="student-status"
              label={t('students.statusLabel')}
              value={list.filters.status || ''}
              onChange={(v) => list.setFilter('status', v)}
              options={STATUSES}
              allLabel={t('students.allStatuses')}
            />
          )}
        </div>

        <Async
          state={list}
          empty={{
            title: t('students.empty.title'),
            message: list.search || list.filters.status || views.activeView
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
                      {has('studentId') && <th scope="col">{t('students.table.studentId')}</th>}
                      {has('email') && <th scope="col">{t('students.table.email')}</th>}
                      {has('status') && <th scope="col">{t('students.table.status')}</th>}
                      {has('programme') && <th scope="col">{t('students.table.programme')}</th>}
                      {has('enrolmentStatus') && <th scope="col">{t('students.table.enrolment')}</th>}
                      {has('externalReference') && <th scope="col">{t('views.fields.student.externalReference')}</th>}
                      {has('createdTime') && <th scope="col">{t('students.table.added')}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => (
                      <tr key={s.id}>
                        <td><Link to={`/students/${s.id}`}>{s.fullName || t('students.unnamed')}</Link></td>
                        {has('studentId') && <td className="mono">{s.studentId || <span className="muted">—</span>}</td>}
                        {has('email') && <td>{s.email || <span className="muted">—</span>}</td>}
                        {has('status') && <td><Pill value={s.status} /></td>}
                        {has('programme') && <td>{s.programme ? s.programme.name : <span className="muted">—</span>}</td>}
                        {has('enrolmentStatus') && <td>{s.enrolmentStatus ? <Pill value={s.enrolmentStatus} /> : <span className="muted">—</span>}</td>}
                        {has('externalReference') && <td className="mono">{s.externalReference || <span className="muted">—</span>}</td>}
                        {has('createdTime') && <td>{fmtDate(s.createdTime)}</td>}
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

      {editingView && (
        <ViewEditorModal
          fields={STUDENT_FIELDS}
          initial={editingView.id ? editingView : null}
          onClose={() => setEditingView(null)}
          onSave={views.saveView}
        />
      )}

      {deletingViewId && (
        <ConfirmDialog
          title={t('views.deleteConfirmTitle')}
          message={t('views.deleteConfirmMessage')}
          confirmLabel={t('views.deleteView')}
          onConfirm={() => { views.deleteView(deletingViewId); setDeletingViewId(null); }}
          onCancel={() => setDeletingViewId(null)}
        />
      )}
    </>
  );
}
