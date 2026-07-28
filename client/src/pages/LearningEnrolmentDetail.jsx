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
 * Links an LMS record to a CRM Student.
 *
 * The server tries the identifiers in a fixed order — CRM id, then external
 * student reference, then exact email — and never matches on a person's name.
 * Two students called the same thing is ordinary; attaching one person's
 * learning record to the other is not recoverable by looking at the screen.
 * An email that matches more than one student is recorded as a mapping Error
 * rather than resolved by picking one.
 */
function MapStudentDialog({ record, onClose, onDone }) {
  const toast = useToast();
  // 100 is the server's per-page ceiling; asking for more just returns 100.
  const students = useApi((o) => api.students({ perPage: 100 }, o), []);
  const [crmStudentId, setCrmStudentId] = useState(record.crmStudentId || '');
  const [studentEmail, setStudentEmail] = useState('');
  const action = useAction(async () => { await onDone(); onClose(); });
  const loaded = students.data || [];
  const truncated = Boolean(students.meta && students.meta.total > loaded.length);

  const submit = async (e) => {
    e.preventDefault();
    const payload = crmStudentId
      ? { crmStudentId }
      : { crmStudentReference: record.crmStudentReference || undefined, studentEmail: studentEmail || undefined };
    const r = await action.run(() => api.mapLmsEnrolment(record.id, payload));
    if (r) {
      toast(r.data.mappingStatus === 'Error'
        ? `Mapping could not be completed: ${r.data.lastSyncMessage}`
        : 'Learner mapped to a CRM student.',
      r.data.mappingStatus === 'Error' ? 'warn' : 'ok');
    }
  };

  return (
    <Modal title="Map this learner to a CRM student" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field id="crmStudentId" label="CRM student" hint="Choosing one here is exact and is tried first.">
          <select value={crmStudentId} onChange={(e) => setCrmStudentId(e.target.value)}>
            <option value="">Match by identifier instead</option>
            {loaded.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName || s.email}{s.studentId ? ` · ${s.studentId}` : ''}
              </option>
            ))}
          </select>
        </Field>

        {truncated && (
          <p className="note">
            Showing the first {loaded.length} of {students.meta.total} students. A student
            beyond this page can still be matched by email below.
          </p>
        )}

        {!crmStudentId && (
          <Field
            id="studentEmail"
            label="Student email"
            hint={record.crmStudentReference
              ? `The stored reference ${record.crmStudentReference} is tried first; this email is the fallback.`
              : 'Matched on an exact address. If two students share it, the record is marked as a mapping error rather than guessed at.'}
          >
            <input type="email" value={studentEmail} onChange={(e) => setStudentEmail(e.target.value)} />
          </Field>
        )}

        <FormError error={action.error ? friendlyError(action.error) : null} />
        <FormActions
          busy={action.busy}
          submitLabel="Map student"
          onCancel={onClose}
          disabled={!crmStudentId && !studentEmail && !record.crmStudentReference}
        />
      </form>
    </Modal>
  );
}

/** Links the record to an existing CRM Enrolment. */
function LinkEnrolmentDialog({ record, onClose, onDone }) {
  const toast = useToast();
  const enrolments = useApi((o) => api.enrolments({ perPage: 100 }, o), []);
  const [crmEnrolmentId, setCrmEnrolmentId] = useState(record.crmEnrolmentId || '');
  const action = useAction(async () => { await onDone(); onClose(); });

  // Only this student's enrolments are offered. The server refuses a mismatch
  // anyway; not listing them keeps the mistake from being made.
  const loaded = enrolments.data || [];
  const truncated = Boolean(enrolments.meta && enrolments.meta.total > loaded.length);
  const options = loaded.filter((e) =>
    !record.crmStudentId || (e.student && String(e.student.id) === String(record.crmStudentId)));

  const submit = async (e) => {
    e.preventDefault();
    const r = await action.run(() => api.mapLmsEnrolment(record.id, { crmEnrolmentId: crmEnrolmentId || null }));
    if (r) toast(crmEnrolmentId ? 'Linked to a CRM enrolment.' : 'CRM enrolment link cleared.');
  };

  return (
    <Modal title="Link to a CRM enrolment" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field
          id="crmEnrolmentId"
          label="CRM enrolment"
          hint="Leave blank to clear the link. Only enrolments belonging to the mapped student are listed."
        >
          <select value={crmEnrolmentId} onChange={(e) => setCrmEnrolmentId(e.target.value)}>
            <option value="">Not linked</option>
            {options.map((e) => (
              <option key={e.id} value={e.id}>
                {e.reference || e.externalReference || e.id}
                {e.programme ? ` · ${e.programme.name}` : ''}
                {e.intake ? ` · ${e.intake.name}` : ''}
              </option>
            ))}
          </select>
        </Field>
        {/*
          * "None found" and "none exist" are different claims. The list is capped at
          * 100 records server-side, so an empty result is only evidence of absence
          * when nothing was truncated — otherwise it says so instead.
          */}
        {!options.length && enrolments.status === 'ready' && (
          <p className="note">
            {truncated
              ? `No match in the first ${loaded.length} of ${enrolments.meta.total} enrolments. This student may have one beyond that page, so it is not safe to assume there is none.`
              : 'This student has no CRM enrolments. Create one from this record instead, if your role allows it.'}
          </p>
        )}
        <FormError error={action.error ? friendlyError(action.error) : null} />
        <FormActions busy={action.busy} submitLabel="Save link" onCancel={onClose} />
      </form>
    </Modal>
  );
}

/**
 * Creates the missing CRM Enrolment for this record.
 *
 * The programme is taken from the mapped course, never from the person doing
 * this — the whole point is that CRM ends up agreeing with the LMS. The intake
 * has to be chosen, and the server rejects one belonging to another programme.
 */
function CreateCrmEnrolmentDialog({ record, course, onClose, onDone }) {
  const toast = useToast();
  const intakes = useApi((o) => api.intakes({ perPage: 100 }, o), []);
  const [intakeId, setIntakeId] = useState('');
  const action = useAction(async () => { await onDone(); onClose(); });

  const programmeId = course && course.crmProgrammeId;
  const loaded = intakes.data || [];
  const truncated = Boolean(intakes.meta && intakes.meta.total > loaded.length);
  const options = loaded.filter((i) =>
    !programmeId || !i.programme || String(i.programme.id) === String(programmeId));

  const submit = async (e) => {
    e.preventDefault();
    const r = await action.run(() =>
      api.createCrmEnrolmentForLms(record.id, { intakeId }, { idempotencyKey: newIdempotencyKey() }));
    if (r) toast(r.data.created ? 'CRM enrolment created and linked.' : r.data.reason);
  };

  return (
    <Modal title="Create the CRM enrolment" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <dl className="dl">
          <dt>Student</dt>
          <dd>{record.crmStudentReference || record.crmStudentId}</dd>
          <dt>Programme</dt>
          <dd>
            {course && course.crmProgrammeReference
              ? course.crmProgrammeReference
              : <span className="muted">Taken from the mapped course</span>}
          </dd>
        </dl>
        <Field
          id="intakeId"
          label="Intake"
          required
          hint="Only intakes on the mapped course's programme are listed. An intake from another programme is refused by the server."
        >
          <select value={intakeId} onChange={(e) => setIntakeId(e.target.value)} required>
            <option value="">Choose an intake</option>
            {options.map((i) => (
              <option key={i.id} value={i.id}>{i.name}{i.startDate ? ` · starts ${i.startDate}` : ''}</option>
            ))}
          </select>
        </Field>
        {truncated && (
          <p className="note">
            Showing intakes from the first {loaded.length} of {intakes.meta.total} records.
            An intake beyond that page will not appear here.
          </p>
        )}
        <p className="note">
          If a CRM enrolment already exists for this student, programme and intake, it is
          linked rather than duplicated — so repeating this action cannot create a second
          enrolment.
        </p>
        <FormError error={action.error ? friendlyError(action.error) : null} />
        <FormActions busy={action.busy} submitLabel="Create enrolment" onCancel={onClose} disabled={!intakeId} />
      </form>
    </Modal>
  );
}

export default function LearningEnrolmentDetail() {
  const { id } = useParams();
  const can = useCan();
  const toast = useToast();
  const state = useApi((o) => api.lmsEnrolment(id, o), [id]);
  const [dialog, setDialog] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const action = useAction(async () => { await state.reload(); });

  return (
    <Async state={state} empty={{ title: 'Learner record not found' }} emptyWhen={(d) => !d || !d.enrolment}>
      {(d) => {
        const e = d.enrolment;

        const onSync = () => setConfirm({
          title: 'Push this progress to CRM?',
          message: 'The linked CRM Enrolment has its LMS provider, LMS enrolment id, progress percentage, last sync date and sync status overwritten with the values held here.',
          confirmLabel: 'Sync to CRM',
          danger: false,
          run: async () => {
            const r = await action.run(() => api.syncLmsEnrolment(e.id, { idempotencyKey: newIdempotencyKey() }));
            if (r) {
              toast(`Synced. Fields written: ${(r.data.crmFieldsWritten || []).join(', ')}.`);
              setConfirm(null);
            }
          }
        });

        return (
          <>
            <div className="page-head">
              <h1>{e.externalEnrolmentId}</h1>
              <p>
                <Pill value={e.lmsStatus} />{' '}
                <span className="muted">{e.provider}</span>
                {d.course && <> · <Link to={`/learning/courses/${d.course.id}`}>{d.course.name}</Link></>}
              </p>
              <div className="head-actions">
                <Link className="btn" to="/learning/enrolments">All learners</Link>
                {can('lms:map') && (
                  <>
                    <button type="button" className="btn" onClick={() => setDialog('student')}>
                      {e.crmStudentId ? 'Change student' : 'Map student'}
                    </button>
                    <button type="button" className="btn" onClick={() => setDialog('enrolment')}>
                      {e.crmEnrolmentId ? 'Change CRM enrolment' : 'Link CRM enrolment'}
                    </button>
                  </>
                )}
                {can('lms:create-crm-enrolment') && e.crmStudentId && !e.crmEnrolmentId && (
                  <button type="button" className="btn" onClick={() => setDialog('create')}>
                    Create CRM enrolment
                  </button>
                )}
                {can('lms:sync') && e.crmEnrolmentId && (
                  <button type="button" className="btn" onClick={onSync}>Sync to CRM</button>
                )}
              </div>
            </div>

            {action.error && (
              <div className="state err" role="alert">
                <h3>That action could not be completed</h3>
                <p>{friendlyError(action.error)}</p>
              </div>
            )}

            {e.mappingStatus === 'Error' && (
              <div className="state err" role="alert">
                <h3>This record could not be mapped</h3>
                <p>{e.lastSyncMessage || 'The mapping was attempted and did not resolve to a single CRM student.'}</p>
              </div>
            )}

            <div className="grid g-2">
              <Card
                title="Learning record"
                action={<div className="head-actions"><SourceBadge source="lms" /><DemoDataBadge /></div>}
              >
                <dl className="dl">
                  <dt>Provider</dt><dd>{e.provider}</dd>
                  <dt>External enrolment id</dt><dd className="mono">{e.externalEnrolmentId}</dd>
                  <dt>External learner id</dt>
                  <dd className="mono">{e.externalLearnerId || <span className="muted">—</span>}</dd>
                  <dt>Course</dt>
                  <dd>
                    {d.course
                      ? <Link to={`/learning/courses/${d.course.id}`}>{d.course.name}</Link>
                      : <span className="muted">No course matches {e.externalCourseId || 'this record'}</span>}
                  </dd>
                  <dt>Status</dt><dd><Pill value={e.lmsStatus} /></dd>
                  <dt>Progress</dt><dd><Progress value={e.progressPercentage} /></dd>
                  <dt>Assessment score</dt>
                  <dd className="mono">
                    {e.assessmentScore === null ? <span className="muted">Not recorded</span> : e.assessmentScore}
                  </dd>
                  <dt>Started</dt><dd>{e.startedDate ? fmtDate(e.startedDate) : <span className="muted">—</span>}</dd>
                  <dt>Last activity</dt>
                  <dd>{e.lastActivityTime ? fmtDate(e.lastActivityTime) : <span className="muted">—</span>}</dd>
                  <dt>Completed</dt>
                  <dd>{e.completionDate ? fmtDate(e.completionDate) : <span className="muted">—</span>}</dd>
                  <dt>Certificate</dt>
                  <dd>
                    <Pill value={e.certificateStatus} />
                    {e.certificateUrl && (
                      <> <a href={e.certificateUrl} target="_blank" rel="noreferrer noopener">View</a></>
                    )}
                  </dd>
                </dl>
              </Card>

              <Card title="CRM mapping and synchronisation" action={<SourceBadge source="crm" />}>
                <dl className="dl">
                  <dt>Mapping</dt><dd><Pill value={e.mappingStatus} /></dd>
                  <dt>CRM student</dt>
                  <dd>
                    {d.crmStudent
                      ? <Link to={`/students/${d.crmStudent.id}`}>{d.crmStudent.fullName || d.crmStudent.email}</Link>
                      : <span className="muted">Not mapped</span>}
                  </dd>
                  <dt>Student reference</dt>
                  <dd className="mono">{e.crmStudentReference || <span className="muted">—</span>}</dd>
                  <dt>CRM enrolment</dt>
                  <dd>
                    {d.crmEnrolment
                      ? <Link to={`/enrolments/${d.crmEnrolment.id}`}>
                          {d.crmEnrolment.reference || d.crmEnrolment.externalReference || d.crmEnrolment.id}
                        </Link>
                      : <span className="muted">Not linked</span>}
                  </dd>
                  <dt>Sync status</dt><dd><Pill value={e.syncStatus} /></dd>
                  <dt>Last sync</dt>
                  <dd>{e.lastSyncTime ? fmtDate(e.lastSyncTime) : <span className="muted">Never</span>}</dd>
                  <dt>Last message</dt><dd>{e.lastSyncMessage || <span className="muted">—</span>}</dd>
                </dl>
                <p className="note">
                  A sync writes {(d.crmFieldsWritten || []).join(', ')} on the CRM Enrolment.
                </p>
              </Card>
            </div>

            {d.fieldsHeldInCatalyst && d.fieldsHeldInCatalyst.length > 0 && (
              <Card title="Values held in Catalyst rather than CRM" action={<SourceBadge source="catalyst" />}>
                <p className="muted">
                  These fields do not exist on the CRM Enrolments module, so a sync cannot
                  write them. They are stored in the Catalyst Data Store and shown from
                  there. Adding them to CRM is a metadata change, deliberately not made
                  automatically by this application.
                </p>
                <div className="t-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Module</th>
                        <th scope="col">Suggested field</th>
                        <th scope="col">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.fieldsHeldInCatalyst.map((f) => (
                        <tr key={f.apiName}>
                          <td>{f.module}</td>
                          <td className="mono">{f.apiName}</td>
                          <td className="muted">{f.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            <Card title="Synchronisation history for this record">
              <SyncLogTable rows={d.syncLog} emptyText="This record has not been synchronised yet." />
            </Card>

            {dialog === 'student' && (
              <MapStudentDialog
                record={e}
                onClose={() => setDialog(null)}
                onDone={async () => { await state.reload(); }}
              />
            )}
            {dialog === 'enrolment' && (
              <LinkEnrolmentDialog
                record={e}
                onClose={() => setDialog(null)}
                onDone={async () => { await state.reload(); }}
              />
            )}
            {dialog === 'create' && (
              <CreateCrmEnrolmentDialog
                record={e}
                course={d.course}
                onClose={() => setDialog(null)}
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
