import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi, useAction } from '../useApi.js';
import { api, newIdempotencyKey } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import {
  Async, Card, Pill, Progress, SourceBadge, DemoDataBadge, Modal, ConfirmDialog,
  useToast, fmtDate
} from '../components/Ui.jsx';
import { Field, FormActions, FormError, friendlyError } from '../components/Form.jsx';
import SyncLogTable from '../components/SyncLogTable.jsx';

/**
 * Chooses the CRM Programme a course maps to, or clears the mapping.
 *
 * The programmes are read from CRM rather than typed as an id, because a
 * mapping that points at nothing looks correct everywhere downstream while
 * being wrong — the server re-reads the programme for the same reason.
 */
function MapDialog({ course, onClose, onDone }) {
  const toast = useToast();
  // 100 is the server's per-page ceiling. Asking for more silently returns 100,
  // which is how a truncated list gets mistaken for a complete one.
  const programmes = useApi((o) => api.programmes({ perPage: 100 }, o), []);
  const [programmeId, setProgrammeId] = useState(course.crmProgrammeId || '');
  const action = useAction(async () => { await onDone(); onClose(); });
  const loaded = programmes.data || [];
  const truncated = Boolean(programmes.meta && programmes.meta.total > loaded.length);

  const submit = async (e) => {
    e.preventDefault();
    const r = await action.run(() => api.mapLmsCourse(course.id, { programmeId: programmeId || null }));
    if (r) toast(programmeId ? 'Course mapped to a CRM programme.' : 'Mapping cleared.');
  };

  return (
    <Modal title="Map to a CRM programme" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field
          id="programmeId"
          label="CRM programme"
          hint="Leave blank to clear the mapping. Remapping sets the sync status back to Pending, because a previous push no longer describes this course."
        >
          <select value={programmeId} onChange={(e) => setProgrammeId(e.target.value)}>
            <option value="">Not mapped</option>
            {loaded.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>
            ))}
          </select>
        </Field>
        {truncated && (
          <p className="note">
            Showing the first {loaded.length} of {programmes.meta.total} programmes. If the
            one you want is not listed, it is beyond this page rather than absent.
          </p>
        )}
        {programmes.status === 'error' && (
          <p className="field-error" role="alert">
            The CRM programme list could not be loaded, so no mapping can be chosen right now.
          </p>
        )}
        <FormError error={action.error ? friendlyError(action.error) : null} />
        <FormActions
          busy={action.busy}
          submitLabel="Save mapping"
          onCancel={onClose}
          disabled={programmes.status === 'loading'}
        />
      </form>
    </Modal>
  );
}

export default function LearningCourseDetail() {
  const { id } = useParams();
  const can = useCan();
  const toast = useToast();
  const state = useApi((o) => api.lmsCourse(id, o), [id]);
  const [mapping, setMapping] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const action = useAction(async () => { await state.reload(); });

  return (
    <Async state={state} empty={{ title: 'Course not found' }} emptyWhen={(d) => !d || !d.course}>
      {(d) => {
        const c = d.course;

        const onSync = () => setConfirm({
          title: 'Push this course to CRM?',
          message: `The CRM Programme's LMS provider, external course id and course URL are overwritten with this course's values. Programme name, fee, status and every other academic field are left untouched.`,
          confirmLabel: 'Sync to CRM',
          danger: false,
          run: async () => {
            const r = await action.run(() => api.syncLmsCourse(c.id, { idempotencyKey: newIdempotencyKey() }));
            if (r) {
              toast(`Synced. Fields written: ${(r.data.crmFieldsWritten || []).join(', ')}.`);
              setConfirm(null);
            }
          }
        });

        const onArchive = () => setConfirm({
          title: 'Archive this course?',
          message: 'It is hidden from the default catalogue view but kept, along with its mapping and history.',
          confirmLabel: 'Archive course',
          run: async () => {
            const r = await action.run(() => api.archiveLmsCourse(c.id));
            if (r) { toast('Course archived.'); setConfirm(null); }
          }
        });

        return (
          <>
            <div className="page-head">
              <h1>{c.name}</h1>
              <p>
                <Pill value={c.publicationStatus} />{' '}
                <span className="muted">{c.provider}</span>{' '}
                <span className="mono muted">{c.externalCourseId}</span>
                {c.archived && <span className="pill mute">Archived</span>}
              </p>
              <div className="head-actions">
                <Link className="btn" to="/learning/courses">All courses</Link>
                {can('lms:map') && (
                  <button type="button" className="btn" onClick={() => setMapping(true)}>
                    {c.crmProgrammeId ? 'Change mapping' : 'Map to programme'}
                  </button>
                )}
                {can('lms:sync') && c.mappingStatus === 'Mapped' && (
                  <button type="button" className="btn" onClick={onSync}>Sync to CRM</button>
                )}
                {can('lms:write') && !c.archived && (
                  <button type="button" className="btn" onClick={onArchive}>Archive</button>
                )}
              </div>
            </div>

            {action.error && (
              <div className="state err" role="alert">
                <h3>That action could not be completed</h3>
                <p>{friendlyError(action.error)}</p>
              </div>
            )}

            <div className="grid g-2">
              <Card
                title="Course"
                action={<div className="head-actions"><SourceBadge source="lms" /><DemoDataBadge /></div>}
              >
                <dl className="dl">
                  <dt>Provider</dt><dd>{c.provider}</dd>
                  <dt>External course id</dt><dd className="mono">{c.externalCourseId}</dd>
                  <dt>Delivery type</dt><dd>{c.deliveryType || <span className="muted">—</span>}</dd>
                  <dt>Instructor</dt><dd>{c.instructor || <span className="muted">—</span>}</dd>
                  <dt>Duration</dt>
                  <dd className="mono">
                    {c.durationHours === null ? <span className="muted">Not recorded</span> : `${c.durationHours} hours`}
                  </dd>
                  <dt>Level</dt><dd>{c.level || <span className="muted">—</span>}</dd>
                  <dt>Category</dt><dd>{c.category || <span className="muted">—</span>}</dd>
                  <dt>Language</dt><dd>{c.language || <span className="muted">—</span>}</dd>
                  <dt>Publication</dt><dd><Pill value={c.publicationStatus} /></dd>
                  <dt>Course URL</dt>
                  <dd>
                    {c.url
                      ? <a href={c.url} target="_blank" rel="noreferrer noopener">{c.url}</a>
                      : <span className="muted">—</span>}
                  </dd>
                </dl>
                {c.description && <p className="muted" style={{ marginBottom: 0 }}>{c.description}</p>}
              </Card>

              <Card
                title="CRM mapping and synchronisation"
                action={<div className="head-actions"><SourceBadge source="crm" /></div>}
              >
                <dl className="dl">
                  <dt>Mapping</dt><dd><Pill value={c.mappingStatus} /></dd>
                  <dt>CRM programme</dt>
                  <dd>
                    {d.crmProgramme
                      ? <Link to={`/programmes/${d.crmProgramme.id}`}>{d.crmProgramme.name}</Link>
                      : <span className="muted">Not mapped</span>}
                  </dd>
                  <dt>Programme reference</dt>
                  <dd className="mono">{c.crmProgrammeReference || <span className="muted">—</span>}</dd>
                  <dt>Sync status</dt><dd><Pill value={c.syncStatus} /></dd>
                  <dt>Last sync</dt>
                  <dd>{c.lastSyncTime ? fmtDate(c.lastSyncTime) : <span className="muted">Never</span>}</dd>
                  <dt>Last message</dt>
                  <dd>{c.lastSyncMessage || <span className="muted">—</span>}</dd>
                </dl>
                <p className="note">
                  A sync writes only {(d.crmFieldsWritten || []).join(', ')} on the CRM
                  Programme. Academic fields are owned by CRM and are never overwritten by
                  the connector.
                </p>
              </Card>
            </div>

            <Card
              title="Learners on this course"
              action={<div className="head-actions"><SourceBadge source="lms" /><DemoDataBadge /></div>}
            >
              {d.enrolments.length ? (
                <div className="t-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">External enrolment</th>
                        <th scope="col">Learner id</th>
                        <th scope="col">CRM student</th>
                        <th scope="col">Status</th>
                        <th scope="col">Progress</th>
                        <th scope="col">Certificate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.enrolments.map((e) => (
                        <tr key={e.id}>
                          <td><Link to={`/learning/enrolments/${e.id}`}>{e.externalEnrolmentId}</Link></td>
                          <td className="mono">{e.externalLearnerId || <span className="muted">—</span>}</td>
                          <td>
                            {e.crmStudentId
                              ? <Link to={`/students/${e.crmStudentId}`}>{e.crmStudentReference || e.crmStudentId}</Link>
                              : <span className="muted">Not mapped</span>}
                          </td>
                          <td><Pill value={e.lmsStatus} /></td>
                          <td><Progress value={e.progressPercentage} /></td>
                          <td><Pill value={e.certificateStatus} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="muted">No learners are recorded against this course.</p>}
            </Card>

            <Card title="Synchronisation history for this course">
              <SyncLogTable rows={d.syncLog} emptyText="This course has not been synchronised yet." />
            </Card>

            {mapping && (
              <MapDialog
                course={c}
                onClose={() => setMapping(false)}
                onDone={async () => { await state.reload(); }}
              />
            )}

            {confirm && (
              <ConfirmDialog
                title={confirm.title}
                message={confirm.message}
                confirmLabel={confirm.confirmLabel}
                danger={confirm.danger}
                busy={action.busy}
                onConfirm={confirm.run}
                onCancel={() => setConfirm(null)}
              />
            )}
          </>
        );
      }}
    </Async>
  );
}
