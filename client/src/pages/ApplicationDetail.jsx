import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi, useAction } from '../useApi.js';
import { api, newIdempotencyKey } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import {
  Async, Card, Pill, SourceBadge, RefBadge, ConfirmDialog, Modal,
  useToast, fmtDate, fmtMoney
} from '../components/Ui.jsx';
import { Field, FormActions, FormError, friendlyError, DATE_MIN, DATE_MAX } from '../components/Form.jsx';
import ActivityLog from '../components/ActivityLog.jsx';

/**
 * Stage transition control.
 *
 * Only the transitions the SERVER will accept are offered — the detail endpoint
 * returns `allowedTransitions` computed from the same table the write handler
 * validates against. Rendering every stage and letting the API reject most of
 * them would teach people that this application guesses.
 */
function StageActions({ application, allowed, onDone }) {
  const [target, setTarget] = useState(null);
  const [idempotencyKey, setKey] = useState(newIdempotencyKey);
  const toast = useToast();
  const action = useAction(onDone);

  if (!allowed.length) {
    return <p className="muted small">This application is at a final stage and cannot be moved further.</p>;
  }

  const commit = async () => {
    const r = await action.run(() => api.transitionApplication(
      application.id,
      { toStage: target, expectedModifiedTime: application.modifiedTime },
      { idempotencyKey }
    ));
    if (r) {
      toast(
        r.data.enrolmentCreated
          ? 'Stage changed and an enrolment was created.'
          : r.data.enrolment
            ? 'Stage changed. The existing enrolment was reused.'
            : 'Stage changed.'
      );
      setTarget(null);
      // A fresh key for the next action, so a later transition is not treated
      // as a replay of this one.
      setKey(newIdempotencyKey());
    }
  };

  return (
    <>
      <div className="head-actions">
        {allowed.map((s) => (
          <button key={s} type="button" className="btn" onClick={() => setTarget(s)}>
            Move to {s}
          </button>
        ))}
      </div>

      {action.error && <p className="field-error" role="alert">{friendlyError(action.error)}</p>}

      {target && (
        <ConfirmDialog
          title={`Move to ${target}?`}
          message={target === 'Enrolled'
            ? 'This updates the application in Zoho CRM and creates an enrolment if one does not already exist. Repeating the action will not create a second enrolment.'
            : `The application stage will be changed to ${target} in Zoho CRM.`}
          confirmLabel={`Move to ${target}`}
          danger={false}
          busy={action.busy}
          onConfirm={commit}
          onCancel={() => setTarget(null)}
        />
      )}
    </>
  );
}

/* --------------------------------- edit ---------------------------------- */

function EditDialog({ application, onClose, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({
    applicationDate: application.applicationDate || '',
    closingDate: application.expectedDecisionDate || '',
    tuitionFee: application.tuitionFee ?? '',
    studyMode: application.studyMode || '',
    documentsStatus: application.documentsStatus || ''
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const action = useAction(async () => { await onDone(); onClose(); });

  const submit = async (e) => {
    e.preventDefault();
    const r = await action.run(() => api.updateApplication(application.id, {
      ...form,
      tuitionFee: form.tuitionFee === '' ? undefined : Number(form.tuitionFee),
      expectedModifiedTime: application.modifiedTime
    }));
    if (r) toast('Application updated.');
  };

  return (
    <Modal title="Edit application" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field id="applicationDate" label="Application date">
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.applicationDate} onChange={set('applicationDate')} />
          </Field>
          <Field id="closingDate" label="Expected decision date">
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.closingDate} onChange={set('closingDate')} />
          </Field>
          <Field id="tuitionFee" label="Tuition fee">
            <input type="number" min="0" step="1" value={form.tuitionFee} onChange={set('tuitionFee')} />
          </Field>
          <Field id="studyMode" label="Preferred study mode">
            <input value={form.studyMode} onChange={set('studyMode')} />
          </Field>
          <Field id="documentsStatus" label="Documents status">
            <input value={form.documentsStatus} onChange={set('documentsStatus')} />
          </Field>
        </div>
        <p className="note">
          The stage is changed with the stage buttons, not here, so a transition always
          goes through the rules the server validates.
        </p>
        <FormError error={action.error ? friendlyError(action.error) : null} />
        <FormActions busy={action.busy} submitLabel="Save changes" onCancel={onClose} />
      </form>
    </Modal>
  );
}

/* -------------------------------- the page -------------------------------- */

export default function ApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const can = useCan();
  const toast = useToast();
  const state = useApi((o) => api.application(id, o), [id]);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const action = useAction(async () => { await state.reload(); });

  return (
    <Async state={state} empty={{ title: 'Application not found' }} emptyWhen={(d) => !d || !d.application}>
      {(d) => {
        const a = d.application;

        const onWithdraw = () => setConfirm({
          title: 'Withdraw this application?',
          message: 'The stage will be set to Withdrawn in Zoho CRM. The record is kept.',
          confirmLabel: 'Withdraw application',
          run: async () => {
            const r = await action.run(() => api.archiveApplication(id, { expectedModifiedTime: a.modifiedTime }));
            if (r) { toast('Application withdrawn.'); setConfirm(null); }
          }
        });

        const onDelete = () => setConfirm({
          title: 'Delete this application permanently?',
          message: 'This cannot be undone. Deletion is refused while a related enrolment exists.',
          confirmLabel: 'Delete permanently',
          run: async () => {
            const r = await action.run(() => api.deleteApplication(id));
            if (r) { toast('Application deleted.'); navigate('/applications', { replace: true }); }
          }
        });

        return (
          <>
            <div className="page-head">
              <h1>{a.name || a.applicationId || 'Application'}</h1>
              <p>
                <Pill value={a.stage} />{' '}
                <RefBadge reference={a.applicationId || a.externalReference} />
              </p>
              <div className="head-actions">
                {can('application:write') && (
                  <>
                    <button type="button" className="btn" onClick={() => setEditing(true)}>Edit</button>
                    {a.stage !== 'Withdrawn' && (
                      <button type="button" className="btn" onClick={onWithdraw}>Withdraw</button>
                    )}
                  </>
                )}
                {can('application:delete') && (
                  <button type="button" className="btn danger" onClick={onDelete}>Delete</button>
                )}
              </div>
            </div>

            {action.error && (
              <div className="state err" role="alert">
                <h3>That action could not be completed</h3>
                <p>{friendlyError(action.error)}</p>
              </div>
            )}

            {can('application:transition') && (
              <Card title="Admissions stage" action={<SourceBadge source="crm" />}>
                <p>
                  Current stage: <Pill value={a.stage} />
                </p>
                <StageActions
                  application={a}
                  allowed={d.allowedTransitions}
                  onDone={async () => { await state.reload(); }}
                />
              </Card>
            )}

            <div className="grid g-2">
              <Card title="Application details" action={<SourceBadge source="crm" />}>
                <dl className="dl">
                  <dt>Application ID</dt><dd className="mono">{a.applicationId || '—'}</dd>
                  <dt>Pipeline</dt><dd>{a.pipeline || '—'}</dd>
                  <dt>Applied</dt><dd>{fmtDate(a.applicationDate)}</dd>
                  <dt>Expected decision</dt><dd>{fmtDate(a.expectedDecisionDate)}</dd>
                  <dt>Decision recorded</dt><dd>{fmtDate(a.decisionDate)}</dd>
                  <dt>Tuition fee</dt><dd className="mono">{fmtMoney(a.tuitionFee)}</dd>
                  <dt>Study mode</dt><dd>{a.studyMode || '—'}</dd>
                  <dt>Documents</dt><dd>{a.documentsStatus || '—'}</dd>
                  <dt>Last modified</dt><dd>{fmtDate(a.modifiedTime)}</dd>
                </dl>
              </Card>

              <Card title="Related records" action={<SourceBadge source="crm" />}>
                <dl className="dl">
                  <dt>Student</dt>
                  <dd>
                    {d.student
                      ? <Link to={`/students/${d.student.id}`}>{d.student.fullName || d.student.email}</Link>
                      : <span className="muted">Not linked</span>}
                  </dd>
                  <dt>Programme</dt>
                  <dd>
                    {d.programme
                      ? <Link to={`/programmes/${d.programme.id}`}>{d.programme.name}</Link>
                      : <span className="muted">Not linked</span>}
                  </dd>
                  <dt>Intake</dt>
                  <dd>
                    {d.intake
                      ? <Link to={`/intakes/${d.intake.id}`}>{d.intake.name}</Link>
                      : <span className="muted">Not linked</span>}
                  </dd>
                  <dt>Enrolment</dt>
                  <dd>
                    {d.enrolment
                      ? <Link to={`/enrolments/${d.enrolment.id}`}>{d.enrolment.reference || d.enrolment.id}</Link>
                      : <span className="muted">None yet</span>}
                  </dd>
                </dl>
              </Card>
            </div>

            {/*
              * An application has no learning record of its own: learning starts at
              * enrolment. The course a programme maps to is shown on the programme, and
              * a learner's progress on the enrolment — putting a course card here would
              * imply this applicant is on it.
              */}

            <Card title="Activity">
              <ActivityLog rows={d.activity} />
            </Card>

            {editing && (
              <EditDialog
                application={a}
                onClose={() => setEditing(false)}
                onDone={async () => { await state.reload(); }}
              />
            )}

            {confirm && (
              <ConfirmDialog
                title={confirm.title}
                message={confirm.message}
                confirmLabel={confirm.confirmLabel}
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
