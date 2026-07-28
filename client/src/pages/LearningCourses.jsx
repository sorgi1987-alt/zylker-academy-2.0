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
      toast(
        `Bulk sync finished: ${s.succeeded} of ${s.attempted} synced` +
        `${s.failed ? `, ${s.failed} failed` : ''}` +
        `${s.skipped ? `, ${s.skipped} skipped as unmapped` : ''}.`,
        s.failed ? 'warn' : 'ok'
      );
      setConfirmBulk(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>Learning Hub</h1>
        <p>
          Courses held by the external LMS connector, and the CRM Programme each one
          is mapped to.
        </p>
      </div>

      <LearningNav />

      <Card
        title="External courses"
        action={(
          <div className="head-actions">
            <SourceBadge source="lms" />
            <DemoDataBadge />
            {can('lms:bulk-sync') && (
              <button type="button" className="btn" onClick={() => setConfirmBulk(true)}>
                Sync all mapped courses
              </button>
            )}
          </div>
        )}
      >
        {action.error && (
          <div className="state err" role="alert">
            <h3>That action could not be completed</h3>
            <p>{friendlyError(action.error)}</p>
          </div>
        )}

        <div className="toolbar">
          <SearchBox
            id="lms-course-search"
            label="Search"
            value={list.search}
            onChange={list.setSearch}
            placeholder="Course name, external id, instructor or category"
          />
          <FilterSelect
            id="lms-course-provider"
            label="Provider"
            value={list.filters.provider || ''}
            onChange={(v) => list.setFilter('provider', v)}
            options={meta.providers || []}
            allLabel="All providers"
          />
          <FilterSelect
            id="lms-course-mapping"
            label="Mapping"
            value={list.filters.mappingStatus || ''}
            onChange={(v) => list.setFilter('mappingStatus', v)}
            options={meta.mappingStatuses || []}
            allLabel="Any"
          />
          <FilterSelect
            id="lms-course-sync"
            label="Sync"
            value={list.filters.syncStatus || ''}
            onChange={(v) => list.setFilter('syncStatus', v)}
            options={meta.syncStatuses || []}
            allLabel="Any"
          />
        </div>

        <Async state={list} empty={{ title: 'No courses match', message: 'Try clearing a filter.' }}>
          {(rows, m) => (
            <>
              <div className="t-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Course</th>
                      <th scope="col">Provider</th>
                      <th scope="col">External id</th>
                      <th scope="col">Delivery</th>
                      <th scope="col">CRM programme</th>
                      <th scope="col">Mapping</th>
                      <th scope="col">Sync</th>
                      <th scope="col">Last sync</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <Link to={`/learning/courses/${c.id}`}>{c.name}</Link>
                          {c.archived && <span className="pill mute">Archived</span>}
                        </td>
                        <td>{c.provider}</td>
                        <td className="mono">{c.externalCourseId}</td>
                        <td>{c.deliveryType || <span className="muted">—</span>}</td>
                        <td>
                          {c.crmProgramme
                            ? <Link to={`/programmes/${c.crmProgramme.id}`}>{c.crmProgramme.name}</Link>
                            : <span className="muted">Not mapped</span>}
                        </td>
                        <td><Pill value={c.mappingStatus} /></td>
                        <td><Pill value={c.syncStatus} /></td>
                        <td>{c.lastSyncTime ? fmtDate(c.lastSyncTime) : <span className="muted">Never</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="note">
                Provider names are source labels on rows in the Catalyst Data Store. No
                request is made to Moodle, Canvas, TrainerCentral or any SCORM host. The
                mapping to CRM and the push into it are real authenticated writes.
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
          title="Synchronise every mapped course?"
          message="Each mapped course pushes its provider, external course id and course URL onto its CRM Programme. Courses that are not mapped are skipped. Every course is attempted independently, so one failure does not stop the rest."
          confirmLabel="Sync all mapped"
          danger={false}
          busy={action.busy}
          onConfirm={onBulkSync}
          onCancel={() => setConfirmBulk(false)}
        />
      )}
    </>
  );
}
