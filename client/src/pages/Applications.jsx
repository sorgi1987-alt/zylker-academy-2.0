import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePagedList, useApi, useDebounced } from '../useApi.js';
import { api } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import { useT } from '../i18n/I18nContext.jsx';
import {
  Async, Card, Pill, Pagination, SearchBox, FilterChips, SourceBadge, ConfirmDialog, fmtDate, fmtMoney
} from '../components/Ui.jsx';
import ApplicationBoard from '../components/ApplicationBoard.jsx';
import { useViews, useViewDraft, ViewFilterPanel, liveConditions } from '../components/ViewManager.jsx';
import { APPLICATION_FIELDS } from '../viewFields.js';

// Matches the table this page has always rendered — expectedDecisionDate is
// a real, registered field (so a saved view can add it) but was never a
// default column.
const DEFAULT_COLUMNS = ['applicantName', 'applicantEmail', 'stage', 'programme', 'intake', 'applicationDate', 'tuitionFee'];

const VIEW_STORAGE_KEY = 'zylker.applications.view';
// Reading/writing localStorage can throw (private browsing, storage disabled) —
// that's not worth losing the page over, so a stored preference is best-effort.
const readStoredView = () => {
  try { return localStorage.getItem(VIEW_STORAGE_KEY); } catch { return null; }
};
const writeStoredView = (view) => {
  try { localStorage.setItem(VIEW_STORAGE_KEY, view); } catch { /* best-effort */ }
};

export default function Applications() {
  const t = useT();
  const can = useCan();
  const [params, setParams] = useSearchParams();
  // A dashboard card can deep-link into a pre-filtered list. This is
  // independent of the view panel's conditions — a plain query param the
  // dashboard already knows how to build, shown back via FilterChips below.
  const list = usePagedList(api.applications, {
    initialFilters: {
      stage: params.get('stage') || undefined,
      // Set by the dashboard's "Applications awaiting action" card: the three
      // stages where the next move is ours.
      awaitingAction: params.get('awaitingAction') || undefined
    }
  });

  const stages = (list.meta && list.meta.stages) || [];

  // The filter builder's "Stage" field is an enum whose options come from
  // the API's own stage list rather than a second hard-coded copy — the
  // registry ships with an empty options array precisely so this can fill it
  // in once the list has loaded.
  const applicationFields = useMemo(
    () => APPLICATION_FIELDS.map((f) => (f.key === 'stage' ? { ...f, options: stages } : f)),
    [stages]
  );

  const views = useViews('zylker.views.applications');
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

  // The view lives in the URL when a link specifies one — shareable, and a
  // reload doesn't quietly switch what someone was looking at — and falls
  // back to whichever view was last chosen, so returning to this page later
  // (with no view param) reopens where you left off rather than resetting.
  const paramView = params.get('view');
  const view = paramView === 'board' || paramView === 'list' ? paramView : (readStoredView() || 'list');
  const setView = (next) => {
    const p = new URLSearchParams(params);
    if (next === 'list') p.delete('view'); else p.set('view', next);
    setParams(p, { replace: true });
    writeStoredView(next);
  };

  // The board needs every matching application across every column at once,
  // not one server-paginated page of 25 — a separate fetch, sharing list
  // mode's already-debounced search/filters via `list.params`, capped at the
  // same row ceiling (200) every other list in the app is capped at.
  const boardParams = useMemo(() => ({ ...list.params, page: 1, perPage: 200 }), [list.params]);
  const board = useApi(
    (o) => (view === 'board' ? api.applications(boardParams, o) : Promise.resolve({ data: [], meta: {} })),
    [view, boardParams]
  );

  return (
    <>
      <div className="page-head">
        <h1>{t('applications.pageTitle')}</h1>
      </div>

      <Card
        header={(
          <>
            <div className="view-header-left">
              <SearchBox
                id="application-search"
                label={t('common.search')}
                value={list.search}
                onChange={list.setSearch}
                placeholder={t('applications.searchPlaceholder')}
              />
            </div>
            <div className="head-actions">
              <div className="view-toggle" role="group" aria-label={t('applications.board.viewToggleLabel')}>
                <button type="button" className={`view-toggle-opt${view === 'list' ? ' active' : ''}`}
                  aria-pressed={view === 'list'} onClick={() => setView('list')}>
                  {t('applications.board.listView')}
                </button>
                <button type="button" className={`view-toggle-opt${view === 'board' ? ' active' : ''}`}
                  aria-pressed={view === 'board'} onClick={() => setView('board')}>
                  {t('applications.board.boardView')}
                </button>
              </div>
              <SourceBadge source="crm" />
              {can('application:write') && (
                <Link className="btn primary" to="/applications/new">{t('applications.newApplicationLink')}</Link>
              )}
            </div>
          </>
        )}
        headerClassName="view-header"
      >
        {/* A dashboard card or attention item may have applied this, so it is
            stated rather than left to be inferred from the row count. */}
        <FilterChips
          chips={[
            list.filters.stage && {
              key: 'stage', label: t('applications.filters.stage'), value: list.filters.stage,
              onClear: () => list.setFilter('stage', '')
            },
            list.filters.awaitingAction === 'true' && {
              key: 'awaitingAction', label: t('applications.filters.queue'), value: t('applications.filters.awaitingOurAction'),
              onClear: () => list.setFilter('awaitingAction', '')
            },
            list.search && {
              key: 'search', label: t('common.search'), value: list.search,
              onClear: () => list.setSearch('')
            }
          ]}
          onClearAll={list.clearFilters}
        />

        <div className="view-layout">
          <ViewFilterPanel
            fields={applicationFields}
            views={views.views}
            activeViewId={views.activeViewId}
            defaultViewId={views.defaultViewId}
            draft={draft}
            onDraftChange={setDraft}
            onSelectView={views.selectView}
            onSave={views.saveView}
            onDelete={(id) => setDeletingViewId(id)}
            onToggleDefault={views.toggleDefaultView}
          />

          <div className="view-content">
            {view === 'list' ? (
              <Async
                state={list}
                empty={{
                  title: t('applications.empty.title'),
                  message: t('applications.empty.message')
                }}
              >
                {(rows, meta) => (
                  <>
                    <div className="t-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th scope="col">{t('applications.table.application')}</th>
                            {has('applicantName') && <th scope="col">{t('views.fields.application.applicantName')}</th>}
                            {has('applicantEmail') && <th scope="col">{t('views.fields.application.applicantEmail')}</th>}
                            {has('stage') && <th scope="col">{t('applications.table.stage')}</th>}
                            {has('programme') && <th scope="col">{t('applications.table.programme')}</th>}
                            {has('intake') && <th scope="col">{t('applications.table.intake')}</th>}
                            {has('applicationDate') && <th scope="col">{t('applications.table.applied')}</th>}
                            {has('expectedDecisionDate') && <th scope="col">{t('views.fields.application.expectedDecisionDate')}</th>}
                            {has('tuitionFee') && <th scope="col">{t('applications.table.fee')}</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((a) => (
                            <tr key={a.id}>
                              <td><Link to={`/applications/${a.id}`}>{a.name || a.applicationId || a.id}</Link></td>
                              {has('applicantName') && <td>{a.applicantName || <span className="muted">—</span>}</td>}
                              {has('applicantEmail') && <td>{a.applicantEmail || <span className="muted">—</span>}</td>}
                              {has('stage') && <td><Pill value={a.stage} /></td>}
                              {has('programme') && <td>{a.programme ? a.programme.name : <span className="muted">—</span>}</td>}
                              {has('intake') && <td>{a.intake ? a.intake.name : <span className="muted">—</span>}</td>}
                              {has('applicationDate') && <td>{fmtDate(a.applicationDate)}</td>}
                              {has('expectedDecisionDate') && <td>{fmtDate(a.expectedDecisionDate)}</td>}
                              {has('tuitionFee') && <td className="mono">{fmtMoney(a.tuitionFee)}</td>}
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
            ) : (
              <Async
                state={board}
                empty={{ title: t('applications.empty.title'), message: t('applications.empty.message') }}
                emptyWhen={() => false}
              >
                {(rows) => (
                  <ApplicationBoard
                    rows={rows}
                    stages={stages}
                    canDrag={can('application:transition')}
                    onReload={() => { board.reload(); list.reload(); }}
                  />
                )}
              </Async>
            )}
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
