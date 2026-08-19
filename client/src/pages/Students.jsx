import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePagedList, useDebounced } from '../useApi.js';
import { api } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import { useT } from '../i18n/I18nContext.jsx';
import {
  Async, Card, Pill, Pagination, SourceBadge, ConfirmDialog, ExportCsvButton, fmtDate
} from '../components/Ui.jsx';
import { useViews, useViewDraft, ViewSelect, ViewFilterPanel, liveConditions } from '../components/ViewManager.jsx';
import { STUDENT_FIELDS } from '../viewFields.js';
import { toCsv, downloadCsv } from '../csv.js';

// The columns shown with no custom view selected — matches the table this
// page has always rendered. externalReference is a real, registered field
// (so a saved view can add it) but was never a default column, so it stays
// opt-in rather than appearing for everyone the day this shipped.
const DEFAULT_COLUMNS = ['studentId', 'email', 'status', 'programme', 'enrolmentStatus', 'createdTime'];

// Export mirrors exactly what the table itself can show — one entry per
// optional column, keyed the same as DEFAULT_COLUMNS/draft.columns, plus
// the primary (name) column added separately since it's never optional.
const EXPORT_COLUMNS = {
  studentId: { labelKey: 'students.table.studentId', value: (s) => s.studentId || '' },
  email: { labelKey: 'students.table.email', value: (s) => s.email || '' },
  status: { labelKey: 'students.table.status', value: (s) => s.status || '' },
  programme: { labelKey: 'students.table.programme', value: (s) => (s.programme ? s.programme.name : '') },
  enrolmentStatus: { labelKey: 'students.table.enrolment', value: (s) => s.enrolmentStatus || '' },
  externalReference: { labelKey: 'views.fields.student.externalReference', value: (s) => s.externalReference || '' },
  createdTime: { labelKey: 'students.table.added', value: (s) => fmtDate(s.createdTime) }
};

export default function Students() {
  const t = useT();
  const can = useCan();
  const list = usePagedList(api.students);
  const views = useViews('zylker.views.students');
  const [draft, setDraft] = useViewDraft(views.activeView, DEFAULT_COLUMNS);
  const [deletingViewId, setDeletingViewId] = useState(null);

  // The panel's draft drives the request live, the same way the search box
  // already does — debounced so picking through fields/operators (or typing
  // a value) doesn't fire a request per keystroke.
  const debouncedConditions = useDebounced(draft.conditions, 350);
  useEffect(() => {
    const c = liveConditions(debouncedConditions);
    list.setFilter('conditions', c.length ? JSON.stringify(c) : undefined);
    list.setFilter('sortBy', draft.sort ? draft.sort.field : undefined);
    list.setFilter('sortDir', draft.sort ? draft.sort.direction : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedConditions, draft.sort]);

  const has = (key) => draft.columns.includes(key);

  // The row cap matches every other place in this app that reads "all
  // matching records" at once (e.g. the Applications board) — an export
  // beyond that ceiling is the same known limit meta.capped already warns
  // about on the table itself, not a new one introduced here.
  const exportStudents = async () => {
    const res = await api.students({ ...list.params, page: 1, perPage: 200 });
    const columns = [
      { label: t('students.table.name'), value: (s) => s.fullName || t('students.unnamed') },
      ...draft.columns
        .filter((k) => EXPORT_COLUMNS[k])
        .map((k) => ({ label: t(EXPORT_COLUMNS[k].labelKey), value: EXPORT_COLUMNS[k].value }))
    ];
    downloadCsv('students.csv', toCsv(res.data || [], columns));
  };

  return (
    <>
      {/* The active nav item already names this page; a repeated visible
          heading was pure redundancy. The h1 stays for screen readers. */}
      <h1 className="sr-only">{t('students.pageTitle')}</h1>

      <Card
        header={(
          <>
            <div className="view-header-left">
              <ViewSelect
                views={views.views}
                activeViewId={views.activeViewId}
                defaultViewId={views.defaultViewId}
                onSelect={views.selectView}
              />
            </div>
            <div className="head-actions">
              <SourceBadge source="crm" />
              <ExportCsvButton onExport={exportStudents} />
              {can('student:write') && <Link className="btn primary" to="/students/new">{t('students.addStudent')}</Link>}
            </div>
          </>
        )}
        headerClassName="view-header"
      >
        <div className="view-layout">
          <ViewFilterPanel
            fields={STUDENT_FIELDS}
            defaultViewId={views.defaultViewId}
            draft={draft}
            onDraftChange={setDraft}
            onSave={views.saveView}
            onDelete={(id) => setDeletingViewId(id)}
            onToggleDefault={views.toggleDefaultView}
          />

          <div className="view-content">
            <Async
              state={list}
              empty={{
                title: t('students.empty.title'),
                message: draft.conditions.length
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
          </div>
        </div>
      </Card>

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
