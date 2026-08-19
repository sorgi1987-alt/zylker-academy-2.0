import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePagedList, useDebounced } from '../useApi.js';
import { api } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import { useT } from '../i18n/I18nContext.jsx';
import {
  Async, Card, Pill, Pagination, FilterChips, SourceBadge, ConfirmDialog, ExportCsvButton, fmtDate
} from '../components/Ui.jsx';
import { useViews, useViewDraft, ViewSelect, ViewFilterPanel, liveConditions } from '../components/ViewManager.jsx';
import { ENROLMENT_FIELDS } from '../viewFields.js';
import { toCsv, downloadCsv } from '../csv.js';

// Matches the table this page has always rendered.
const DEFAULT_COLUMNS = ['studentName', 'programme', 'intake', 'status', 'enrolmentDate', 'progress', 'lmsSyncStatus'];

// Export mirrors the table exactly — one entry per optional column, plus the
// primary (enrolment reference) column added separately since it's never
// optional.
const EXPORT_COLUMNS = {
  studentName: { labelKey: 'enrolments.table.student', value: (e) => (e.student ? (e.studentName || e.student.name) : '') },
  programme: { labelKey: 'enrolments.table.programme', value: (e) => (e.programme ? e.programme.name : '') },
  intake: { labelKey: 'enrolments.table.intake', value: (e) => (e.intake ? e.intake.name : '') },
  status: { labelKey: 'enrolments.table.status', value: (e) => e.status || '' },
  enrolmentDate: { labelKey: 'enrolments.table.enrolled', value: (e) => fmtDate(e.enrolmentDate) },
  progress: { labelKey: 'enrolments.table.progress', value: (e) => (e.lms.progressPercentage === null ? '' : `${e.lms.progressPercentage}%`) },
  lmsSyncStatus: { labelKey: 'enrolments.table.lmsSync', value: (e) => e.lms.syncStatus || '' },
  externalReference: { labelKey: 'views.fields.enrolment.externalReference', value: (e) => e.externalReference || '' }
};

export default function Enrolments() {
  const t = useT();
  const can = useCan();
  const [params] = useSearchParams();

  const MAPPED_OPTIONS = [
    { value: 'no', label: t('enrolments.mappedOptions.no') },
    { value: 'yes', label: t('enrolments.mappedOptions.yes') }
  ];

  // Every filter a dashboard card or attention item can arrive with is seeded
  // from the URL, so the destination shows the subset the card promised.
  const list = usePagedList(api.enrolments, {
    initialFilters: {
      status: params.get('status') || undefined,
      lmsMapped: params.get('lmsMapped') || undefined,
      syncStatus: params.get('syncStatus') || undefined
    }
  });

  const statuses = (list.meta && list.meta.statuses) || [];
  const mappedLabel = (v) => (MAPPED_OPTIONS.find((o) => o.value === v) || {}).label || v;

  // The filter builder's "Status" field is an enum whose options come from
  // the API's own status list rather than a second hard-coded copy — same
  // pattern Applications uses for "Stage".
  const enrolmentFields = useMemo(
    () => ENROLMENT_FIELDS.map((f) => (f.key === 'status' ? { ...f, options: statuses } : f)),
    [statuses]
  );

  const views = useViews('zylker.views.enrolments');
  const [draft, setDraft] = useViewDraft(views.activeView, DEFAULT_COLUMNS);
  const [deletingViewId, setDeletingViewId] = useState(null);

  const debouncedConditions = useDebounced(draft.conditions, 350);
  useEffect(() => {
    const c = liveConditions(debouncedConditions);
    list.setFilter('conditions', c.length ? JSON.stringify(c) : undefined);
    list.setFilter('sortBy', draft.sort ? draft.sort.field : undefined);
    list.setFilter('sortDir', draft.sort ? draft.sort.direction : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedConditions, draft.sort]);

  const has = (key) => draft.columns.includes(key);

  const exportEnrolments = async () => {
    const res = await api.enrolments({ ...list.params, page: 1, perPage: 200 });
    const columns = [
      { label: t('enrolments.table.reference'), value: (e) => e.reference || e.externalReference || e.id },
      ...draft.columns
        .filter((k) => EXPORT_COLUMNS[k])
        .map((k) => ({ label: t(EXPORT_COLUMNS[k].labelKey), value: EXPORT_COLUMNS[k].value }))
    ];
    downloadCsv('enrolments.csv', toCsv(res.data || [], columns));
  };

  return (
    <>
      {/* The active nav item already names this page; a repeated visible
          heading was pure redundancy. The h1 stays for screen readers. */}
      <h1 className="sr-only">{t('enrolments.pageTitle')}</h1>

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
              <ExportCsvButton onExport={exportEnrolments} />
              {can('enrolment:write') && (
                <Link className="btn primary" to="/enrolments/new">{t('enrolments.newEnrolment')}</Link>
              )}
            </div>
          </>
        )}
        headerClassName="view-header"
      >
        <FilterChips
          chips={[
            list.filters.status && {
              key: 'status', label: t('enrolments.status'), value: list.filters.status,
              onClear: () => list.setFilter('status', '')
            },
            list.filters.lmsMapped && {
              key: 'lmsMapped', label: t('enrolments.lmsMapping'), value: mappedLabel(list.filters.lmsMapped),
              onClear: () => list.setFilter('lmsMapped', '')
            },
            list.filters.syncStatus && {
              key: 'syncStatus', label: t('enrolments.lastSync'), value: list.filters.syncStatus,
              onClear: () => list.setFilter('syncStatus', '')
            }
          ]}
          onClearAll={list.clearFilters}
        />

        <div className="view-layout">
          <ViewFilterPanel
            fields={enrolmentFields}
            defaultViewId={views.defaultViewId}
            draft={draft}
            onDraftChange={setDraft}
            onSave={views.saveView}
            onDelete={(id) => setDeletingViewId(id)}
            onToggleDefault={views.toggleDefaultView}
          />

          <div className="view-content">
            <Async state={list} empty={{ title: t('enrolments.noMatch') }}>
              {(rows, meta) => (
                <>
                  <div className="t-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">{t('enrolments.table.reference')}</th>
                          {has('studentName') && <th scope="col">{t('enrolments.table.student')}</th>}
                          {has('programme') && <th scope="col">{t('enrolments.table.programme')}</th>}
                          {has('intake') && <th scope="col">{t('enrolments.table.intake')}</th>}
                          {has('status') && <th scope="col">{t('enrolments.table.status')}</th>}
                          {has('enrolmentDate') && <th scope="col">{t('enrolments.table.enrolled')}</th>}
                          {has('progress') && <th scope="col">{t('enrolments.table.progress')}</th>}
                          {has('lmsSyncStatus') && <th scope="col">{t('enrolments.table.lmsSync')}</th>}
                          {has('externalReference') && <th scope="col">{t('views.fields.enrolment.externalReference')}</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((e) => (
                          <tr key={e.id}>
                            <td><Link to={`/enrolments/${e.id}`}>{e.reference || e.externalReference || e.id}</Link></td>
                            {has('studentName') && (
                              <td>
                                {e.student
                                  ? <Link to={`/students/${e.student.id}`}>{e.studentName || e.student.name}</Link>
                                  : <span className="muted">—</span>}
                              </td>
                            )}
                            {has('programme') && <td>{e.programme ? e.programme.name : <span className="muted">—</span>}</td>}
                            {has('intake') && <td>{e.intake ? e.intake.name : <span className="muted">—</span>}</td>}
                            {has('status') && <td><Pill value={e.status} /></td>}
                            {has('enrolmentDate') && <td>{fmtDate(e.enrolmentDate)}</td>}
                            {has('progress') && (
                              <td className="mono">
                                {e.lms.progressPercentage === null ? '—' : `${e.lms.progressPercentage}%`}
                              </td>
                            )}
                            {has('lmsSyncStatus') && <td><Pill value={e.lms.syncStatus} /></td>}
                            {has('externalReference') && <td className="mono">{e.externalReference || <span className="muted">—</span>}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="note">
                    {t('enrolments.syncNote')}
                  </p>
                  {meta.capped && (
                    <p className="note">
                      {t('enrolments.showingRecent', { total: meta.total })}
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
