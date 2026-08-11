import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePagedList } from '../useApi.js';
import { api } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import { useT } from '../i18n/I18nContext.jsx';
import {
  Async, Card, Pill, Pagination, SearchBox, FilterSelect, FilterChips, SourceBadge, fmtDate, fmtMoney
} from '../components/Ui.jsx';

export default function Applications() {
  const t = useT();
  const can = useCan();
  const [params] = useSearchParams();
  // A dashboard card can deep-link into a pre-filtered list.
  const list = usePagedList(api.applications, {
    initialFilters: {
      stage: params.get('stage') || undefined,
      // Set by the dashboard's "Applications awaiting action" card: the three
      // stages where the next move is ours.
      awaitingAction: params.get('awaitingAction') || undefined
    }
  });

  const stages = (list.meta && list.meta.stages) || [];

  return (
    <>
      <div className="page-head">
        <h1>{t('applications.pageTitle')}</h1>
        <p>{t('applications.pageIntro')}</p>
      </div>

      <Card
        title={t('applications.cardTitle')}
        action={(
          <div className="head-actions">
            <SourceBadge source="crm" />
            {can('application:write') && (
              <Link className="btn primary" to="/applications/new">{t('applications.newApplicationLink')}</Link>
            )}
          </div>
        )}
      >
        <div className="toolbar">
          <SearchBox
            id="application-search"
            label={t('common.search')}
            value={list.search}
            onChange={list.setSearch}
            placeholder={t('applications.searchPlaceholder')}
          />
          <FilterSelect
            id="application-stage"
            label={t('applications.stageLabel')}
            value={list.filters.stage || ''}
            onChange={(v) => list.setFilter('stage', v)}
            options={stages}
            allLabel={t('applications.allStages')}
          />
        </div>

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
                      <th scope="col">{t('applications.table.applicant')}</th>
                      <th scope="col">{t('applications.table.stage')}</th>
                      <th scope="col">{t('applications.table.programme')}</th>
                      <th scope="col">{t('applications.table.intake')}</th>
                      <th scope="col">{t('applications.table.applied')}</th>
                      <th scope="col">{t('applications.table.fee')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id}>
                        <td><Link to={`/applications/${a.id}`}>{a.name || a.applicationId || a.id}</Link></td>
                        <td>
                          {a.applicantName || <span className="muted">—</span>}
                          {a.applicantEmail && <div className="muted small">{a.applicantEmail}</div>}
                        </td>
                        <td><Pill value={a.stage} /></td>
                        <td>{a.programme ? a.programme.name : <span className="muted">—</span>}</td>
                        <td>{a.intake ? a.intake.name : <span className="muted">—</span>}</td>
                        <td>{fmtDate(a.applicationDate)}</td>
                        <td className="mono">{fmtMoney(a.tuitionFee)}</td>
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
      </Card>
    </>
  );
}
