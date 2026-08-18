import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePagedList } from '../useApi.js';
import { api } from '../api.js';
import {
  Async, Card, Pill, Progress, Pagination, SearchBox, FilterSelect, FilterChips,
  SourceBadge, DemoDataBadge, fmtDate
} from '../components/Ui.jsx';
import LearningNav from '../components/LearningNav.jsx';
import { useT } from '../i18n/I18nContext.jsx';

/**
 * Learner records held by the connector.
 *
 * The CRM student column is the one that matters operationally: a record with
 * no student is progress nobody can act on, and a record whose mapping errored
 * is worse than one that was never attempted, so the two are never collapsed
 * into a single "unmapped" state.
 */
export default function LearningEnrolments() {
  const t = useT();
  const [params] = useSearchParams();
  const list = usePagedList(api.lmsEnrolments, {
    initialFilters: {
      provider: params.get('provider') || undefined,
      lmsStatus: params.get('lmsStatus') || undefined,
      mappingStatus: params.get('mappingStatus') || undefined,
      syncStatus: params.get('syncStatus') || undefined,
      // Destination for the dashboard's inactive-learner card.
      activity: params.get('activity') || undefined
    }
  });

  const meta = list.meta || {};
  const activityOptions = [{ value: 'stale', label: t('learningEnrolments.activityStale') }];
  const activityLabel = (v) => (activityOptions.find((o) => o.value === v) || {}).label || v;

  return (
    <>
      <div className="page-head">
        <h1>{t('learningEnrolments.pageTitle')}</h1>
      </div>

      <LearningNav />

      <Card
        title={t('learningEnrolments.cardTitle')}
        action={<div className="head-actions"><SourceBadge source="lms" /><DemoDataBadge /></div>}
      >
        <div className="toolbar">
          <SearchBox
            id="lms-enrolment-search"
            label={t('learningEnrolments.searchLabel')}
            value={list.search}
            onChange={list.setSearch}
            placeholder={t('learningEnrolments.searchPlaceholder')}
          />
          <FilterSelect
            id="lms-enrolment-provider"
            label={t('learningEnrolments.providerLabel')}
            value={list.filters.provider || ''}
            onChange={(v) => list.setFilter('provider', v)}
            options={meta.providers || []}
            allLabel={t('learningEnrolments.allProviders')}
          />
          <FilterSelect
            id="lms-enrolment-status"
            label={t('learningEnrolments.lmsStatusLabel')}
            value={list.filters.lmsStatus || ''}
            onChange={(v) => list.setFilter('lmsStatus', v)}
            options={meta.lmsStatuses || []}
            allLabel={t('learningEnrolments.any')}
          />
          <FilterSelect
            id="lms-enrolment-mapping"
            label={t('learningEnrolments.mappingLabel')}
            value={list.filters.mappingStatus || ''}
            onChange={(v) => list.setFilter('mappingStatus', v)}
            options={meta.mappingStatuses || []}
            allLabel={t('learningEnrolments.any')}
          />
          <FilterSelect
            id="lms-enrolment-sync"
            label={t('learningEnrolments.syncLabel')}
            value={list.filters.syncStatus || ''}
            onChange={(v) => list.setFilter('syncStatus', v)}
            options={meta.syncStatuses || []}
            allLabel={t('learningEnrolments.any')}
          />
          <FilterSelect
            id="lms-enrolment-activity"
            label={t('learningEnrolments.activityLabel')}
            value={list.filters.activity || ''}
            onChange={(v) => list.setFilter('activity', v)}
            options={activityOptions}
            allLabel={t('learningEnrolments.any')}
          />
        </div>

        <FilterChips
          chips={[
            list.filters.provider && {
              key: 'provider', label: t('learningEnrolments.chips.provider'), value: list.filters.provider,
              onClear: () => list.setFilter('provider', '')
            },
            list.filters.lmsStatus && {
              key: 'lmsStatus', label: t('learningEnrolments.chips.lmsStatus'), value: list.filters.lmsStatus,
              onClear: () => list.setFilter('lmsStatus', '')
            },
            list.filters.mappingStatus && {
              key: 'mappingStatus', label: t('learningEnrolments.chips.mapping'), value: list.filters.mappingStatus,
              onClear: () => list.setFilter('mappingStatus', '')
            },
            list.filters.syncStatus && {
              key: 'syncStatus', label: t('learningEnrolments.chips.sync'), value: list.filters.syncStatus,
              onClear: () => list.setFilter('syncStatus', '')
            },
            list.filters.activity && {
              key: 'activity', label: t('learningEnrolments.chips.activity'), value: activityLabel(list.filters.activity),
              onClear: () => list.setFilter('activity', '')
            },
            list.search && {
              key: 'search', label: t('learningEnrolments.chips.search'), value: list.search,
              onClear: () => list.setSearch('')
            }
          ]}
          onClearAll={list.clearFilters}
        />

        <Async state={list} empty={{ title: t('learningEnrolments.emptyTitle'), message: t('learningEnrolments.emptyMessage') }}>
          {(rows, m) => (
            <>
              <div className="t-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t('learningEnrolments.table.externalEnrolment')}</th>
                      <th scope="col">{t('learningEnrolments.table.provider')}</th>
                      <th scope="col">{t('learningEnrolments.table.course')}</th>
                      <th scope="col">{t('learningEnrolments.table.crmStudent')}</th>
                      <th scope="col">{t('learningEnrolments.table.status')}</th>
                      <th scope="col">{t('learningEnrolments.table.progress')}</th>
                      <th scope="col">{t('learningEnrolments.table.certificate')}</th>
                      <th scope="col">{t('learningEnrolments.table.mapping')}</th>
                      <th scope="col">{t('learningEnrolments.table.sync')}</th>
                      <th scope="col">{t('learningEnrolments.table.lastActivity')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e) => (
                      <tr key={e.id}>
                        <td><Link to={`/learning/enrolments/${e.id}`}>{e.externalEnrolmentId}</Link></td>
                        <td>{e.provider}</td>
                        <td>
                          {e.course
                            ? <Link to={`/learning/courses/${e.course.id}`}>{e.course.name}</Link>
                            : <span className="muted">{t('learningEnrolments.unknownCourse')}</span>}
                        </td>
                        <td>
                          {e.crmStudent
                            ? <Link to={`/students/${e.crmStudent.id}`}>{e.crmStudent.fullName || e.crmStudent.email}</Link>
                            : <span className="muted">
                                {e.mappingStatus === 'Error' ? t('learningEnrolments.mappingError') : t('learningEnrolments.notMapped')}
                              </span>}
                        </td>
                        <td><Pill value={e.lmsStatus} /></td>
                        <td><Progress value={e.progressPercentage} /></td>
                        <td><Pill value={e.certificateStatus} /></td>
                        <td><Pill value={e.mappingStatus} /></td>
                        <td><Pill value={e.syncStatus} /></td>
                        <td>{e.lastActivityTime ? fmtDate(e.lastActivityTime) : <span className="muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="note">
                {t('learningEnrolments.provenanceNote')}
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
    </>
  );
}
