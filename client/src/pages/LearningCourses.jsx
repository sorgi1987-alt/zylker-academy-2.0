import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePagedList, useAction } from '../useApi.js';
import { api, newIdempotencyKey } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import {
  Async, Card, Pill, Pagination, SearchBox, FilterSelect, SourceBadge, DemoDataBadge,
  ConfirmDialog, useToast, fmtDate
} from '../components/Ui.jsx';
import { friendlyError } from '../components/Form.jsx';
import LearningNav from '../components/LearningNav.jsx';
import { useT } from '../i18n/I18nContext.jsx';

/**
 * The external course catalogue.
 *
 * Rows come from the Catalyst Data Store, not from a provider's API. Each one
 * carries two independent states that are easy to confuse and are therefore
 * shown separately: `mapping` is whether a CRM Programme has been chosen for
 * it, and `sync` is whether that mapping has been pushed into CRM. A course can
 * be mapped and unsynced, and saying so is the point of the screen.
 */
export default function LearningCourses() {
  const t = useT();
  const can = useCan();
  const toast = useToast();
  const [params] = useSearchParams();
  const [confirmBulk, setConfirmBulk] = useState(false);

  const list = usePagedList(api.lmsCourses, {
    initialFilters: {
      provider: params.get('provider') || undefined,
      mappingStatus: params.get('mappingStatus') || undefined,
      syncStatus: params.get('syncStatus') || undefined
    }
  });

  const action = useAction(async () => { await list.reload(); });
  const meta = list.meta || {};

  const onBulkSync = async () => {
    const r = await action.run(() => api.bulkSyncLmsCourses({ idempotencyKey: newIdempotencyKey() }));
    if (r) {
      const s = r.data;
      let msg = t('learningCourses.bulkSyncResult', { succeeded: s.succeeded, attempted: s.attempted });
      if (s.failed) msg += t('learningCourses.bulkSyncFailedSuffix', { failed: s.failed });
      if (s.skipped) msg += t('learningCourses.bulkSyncSkippedSuffix', { skipped: s.skipped });
      msg += '.';
      toast(msg, s.failed ? 'warn' : 'ok');
      setConfirmBulk(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>{t('learningCourses.pageTitle')}</h1>
        <p>{t('learningCourses.pageIntro')}</p>
      </div>

      <LearningNav />

      <Card
        title={t('learningCourses.cardTitle')}
        action={(
          <div className="head-actions">
            <SourceBadge source="lms" />
            <DemoDataBadge />
            {can('lms:bulk-sync') && (
              <button type="button" className="btn" onClick={() => setConfirmBulk(true)}>
                {t('learningCourses.syncAllButton')}
              </button>
            )}
          </div>
        )}
      >
        {action.error && (
          <div className="state err" role="alert">
            <h3>{t('learningCourses.actionErrorTitle')}</h3>
            <p>{friendlyError(action.error)}</p>
          </div>
        )}

        <div className="toolbar">
          <SearchBox
            id="lms-course-search"
            label={t('learningCourses.searchLabel')}
            value={list.search}
            onChange={list.setSearch}
            placeholder={t('learningCourses.searchPlaceholder')}
          />
          <FilterSelect
            id="lms-course-provider"
            label={t('learningCourses.providerLabel')}
            value={list.filters.provider || ''}
            onChange={(v) => list.setFilter('provider', v)}
            options={meta.providers || []}
            allLabel={t('learningCourses.allProviders')}
          />
          <FilterSelect
            id="lms-course-mapping"
            label={t('learningCourses.mappingLabel')}
            value={list.filters.mappingStatus || ''}
            onChange={(v) => list.setFilter('mappingStatus', v)}
            options={meta.mappingStatuses || []}
            allLabel={t('learningCourses.any')}
          />
          <FilterSelect
            id="lms-course-sync"
            label={t('learningCourses.syncLabel')}
            value={list.filters.syncStatus || ''}
            onChange={(v) => list.setFilter('syncStatus', v)}
            options={meta.syncStatuses || []}
            allLabel={t('learningCourses.any')}
          />
        </div>

        <Async state={list} empty={{ title: t('learningCourses.emptyTitle'), message: t('learningCourses.emptyMessage') }}>
          {(rows, m) => (
            <>
              <div className="t-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t('learningCourses.table.course')}</th>
                      <th scope="col">{t('learningCourses.table.provider')}</th>
                      <th scope="col">{t('learningCourses.table.externalId')}</th>
                      <th scope="col">{t('learningCourses.table.delivery')}</th>
                      <th scope="col">{t('learningCourses.table.crmProgramme')}</th>
                      <th scope="col">{t('learningCourses.table.mapping')}</th>
                      <th scope="col">{t('learningCourses.table.sync')}</th>
                      <th scope="col">{t('learningCourses.table.lastSync')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <Link to={`/learning/courses/${c.id}`}>{c.name}</Link>
                          {c.archived && <span className="pill mute">{t('learningCourses.archived')}</span>}
                        </td>
                        <td>{c.provider}</td>
                        <td className="mono">{c.externalCourseId}</td>
                        <td>{c.deliveryType || <span className="muted">—</span>}</td>
                        <td>
                          {c.crmProgramme
                            ? <Link to={`/programmes/${c.crmProgramme.id}`}>{c.crmProgramme.name}</Link>
                            : <span className="muted">{t('learningCourses.notMapped')}</span>}
                        </td>
                        <td><Pill value={c.mappingStatus} /></td>
                        <td><Pill value={c.syncStatus} /></td>
                        <td>{c.lastSyncTime ? fmtDate(c.lastSyncTime) : <span className="muted">{t('learningCourses.never')}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="note">
                {t('learningCourses.provenanceNote')}
              </p>

              <Pagination
                page={m.page}
                totalPages={m.totalPages}
                total={m.total}
                onPage={list.setPage}
                busy={list.status === 'loading'}
              />
            </>
          )}
        </Async>
      </Card>

      {confirmBulk && (
        <ConfirmDialog
          title={t('learningCourses.confirmBulk.title')}
          message={t('learningCourses.confirmBulk.message')}
          confirmLabel={t('learningCourses.confirmBulk.confirmLabel')}
          danger={false}
          busy={action.busy}
          onConfirm={onBulkSync}
          onCancel={() => setConfirmBulk(false)}
        />
      )}
    </>
  );
}
