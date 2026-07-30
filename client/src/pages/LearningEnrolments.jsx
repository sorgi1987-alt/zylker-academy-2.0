import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePagedList } from '../useApi.js';
import { api } from '../api.js';
import {
  Async, Card, Pill, Progress, Pagination, SearchBox, FilterSelect, FilterChips,
  SourceBadge, DemoDataBadge, fmtDate
} from '../components/Ui.jsx';
import LearningNav from '../components/LearningNav.jsx';

const ACTIVITY_OPTIONS = [{ value: 'stale', label: 'No activity for 30 days or more' }];
const activityLabel = (v) => (ACTIVITY_OPTIONS.find((o) => o.value === v) || {}).label || v;

/**
 * Learner records held by the connector.
 *
 * The CRM student column is the one that matters operationally: a record with
 * no student is progress nobody can act on, and a record whose mapping errored
 * is worse than one that was never attempted, so the two are never collapsed
 * into a single "unmapped" state.
 */
export default function LearningEnrolments() {
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

  return (
    <>
      <div className="page-head">
        <h1>Learning Hub</h1>
        <p>Learner progress from the external LMS connector, and how each record maps to Zoho CRM.</p>
      </div>

      <LearningNav />

      <Card
        title="Learners"
        action={<div className="head-actions"><SourceBadge source="lms" /><DemoDataBadge /></div>}
      >
        <div className="toolbar">
          <SearchBox
            id="lms-enrolment-search"
            label="Search"
            value={list.search}
            onChange={list.setSearch}
            placeholder="Learner id, student name, course or external id"
          />
          <FilterSelect
            id="lms-enrolment-provider"
            label="Provider"
            value={list.filters.provider || ''}
            onChange={(v) => list.setFilter('provider', v)}
            options={meta.providers || []}
            allLabel="All providers"
          />
          <FilterSelect
            id="lms-enrolment-status"
            label="LMS status"
            value={list.filters.lmsStatus || ''}
            onChange={(v) => list.setFilter('lmsStatus', v)}
            options={meta.lmsStatuses || []}
            allLabel="Any"
          />
          <FilterSelect
            id="lms-enrolment-mapping"
            label="Mapping"
            value={list.filters.mappingStatus || ''}
            onChange={(v) => list.setFilter('mappingStatus', v)}
            options={meta.mappingStatuses || []}
            allLabel="Any"
          />
          <FilterSelect
            id="lms-enrolment-sync"
            label="Sync"
            value={list.filters.syncStatus || ''}
            onChange={(v) => list.setFilter('syncStatus', v)}
            options={meta.syncStatuses || []}
            allLabel="Any"
          />
          <FilterSelect
            id="lms-enrolment-activity"
            label="Activity"
            value={list.filters.activity || ''}
            onChange={(v) => list.setFilter('activity', v)}
            options={ACTIVITY_OPTIONS}
            allLabel="Any"
          />
        </div>

        <FilterChips
          chips={[
            list.filters.provider && {
              key: 'provider', label: 'Provider', value: list.filters.provider,
              onClear: () => list.setFilter('provider', '')
            },
            list.filters.lmsStatus && {
              key: 'lmsStatus', label: 'LMS status', value: list.filters.lmsStatus,
              onClear: () => list.setFilter('lmsStatus', '')
            },
            list.filters.mappingStatus && {
              key: 'mappingStatus', label: 'Mapping', value: list.filters.mappingStatus,
              onClear: () => list.setFilter('mappingStatus', '')
            },
            list.filters.syncStatus && {
              key: 'syncStatus', label: 'Sync', value: list.filters.syncStatus,
              onClear: () => list.setFilter('syncStatus', '')
            },
            list.filters.activity && {
              key: 'activity', label: 'Activity', value: activityLabel(list.filters.activity),
              onClear: () => list.setFilter('activity', '')
            },
            list.search && {
              key: 'search', label: 'Search', value: list.search,
              onClear: () => list.setSearch('')
            }
          ]}
          onClearAll={list.clearFilters}
        />

        <Async state={list} empty={{ title: 'No learner records match', message: 'Try clearing a filter.' }}>
          {(rows, m) => (
            <>
              <div className="t-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">External enrolment</th>
                      <th scope="col">Provider</th>
                      <th scope="col">Course</th>
                      <th scope="col">CRM student</th>
                      <th scope="col">Status</th>
                      <th scope="col">Progress</th>
                      <th scope="col">Certificate</th>
                      <th scope="col">Mapping</th>
                      <th scope="col">Sync</th>
                      <th scope="col">Last activity</th>
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
                            : <span className="muted">Unknown course</span>}
                        </td>
                        <td>
                          {e.crmStudent
                            ? <Link to={`/students/${e.crmStudent.id}`}>{e.crmStudent.fullName || e.crmStudent.email}</Link>
                            : <span className="muted">
                                {e.mappingStatus === 'Error' ? 'Mapping error' : 'Not mapped'}
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
                Progress, scores and certificates are a demonstration dataset in the
                Catalyst Data Store. Mapping a record to a CRM Student, and pushing its
                progress onto a CRM Enrolment, are real writes to your live CRM.
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
