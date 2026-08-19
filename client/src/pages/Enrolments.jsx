import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePagedList } from '../useApi.js';
import { api } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import { useT } from '../i18n/I18nContext.jsx';
import {
  Async, Card, Pill, Pagination, SearchBox, FilterSelect, FilterChips, SourceBadge, fmtDate
} from '../components/Ui.jsx';

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

  return (
    <>
      <div className="page-head">
        <h1>{t('enrolments.pageTitle')}</h1>
      </div>

      <Card
        title={t('enrolments.allEnrolments')}
        action={(
          <div className="head-actions">
            <SourceBadge source="crm" />
            {can('enrolment:write') && (
              <Link className="btn primary" to="/enrolments/new">{t('enrolments.newEnrolment')}</Link>
            )}
          </div>
        )}
      >
        <div className="toolbar">
          <SearchBox
            id="enrolment-search"
            label={t('common.search')}
            value={list.search}
            onChange={list.setSearch}
            placeholder={t('enrolments.searchPlaceholder')}
          />
          <FilterSelect
            id="enrolment-status"
            label={t('enrolments.status')}
            value={list.filters.status || ''}
            onChange={(v) => list.setFilter('status', v)}
            options={statuses}
            allLabel={t('enrolments.allStatuses')}
          />
          <FilterSelect
            id="enrolment-lms-mapped"
            label={t('enrolments.lmsMapping')}
            value={list.filters.lmsMapped || ''}
            onChange={(v) => list.setFilter('lmsMapped', v)}
            options={MAPPED_OPTIONS}
            allLabel={t('enrolments.any')}
          />
        </div>

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
            },
            list.search && {
              key: 'search', label: t('common.search'), value: list.search,
              onClear: () => list.setSearch('')
            }
          ]}
          onClearAll={list.clearFilters}
        />

        <Async state={list} empty={{ title: t('enrolments.noMatch') }}>
          {(rows, meta) => (
            <>
              <div className="t-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t('enrolments.table.reference')}</th>
                      <th scope="col">{t('enrolments.table.student')}</th>
                      <th scope="col">{t('enrolments.table.programme')}</th>
                      <th scope="col">{t('enrolments.table.intake')}</th>
                      <th scope="col">{t('enrolments.table.status')}</th>
                      <th scope="col">{t('enrolments.table.enrolled')}</th>
                      <th scope="col">{t('enrolments.table.progress')}</th>
                      <th scope="col">{t('enrolments.table.lmsSync')}</th>
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
      </Card>
    </>
  );
}
