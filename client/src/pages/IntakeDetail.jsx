import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi, useAction } from '../useApi.js';
import { api } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import {
  Async, Card, Pill, SourceBadge, ConfirmDialog, Modal, useToast, fmtDate
} from '../components/Ui.jsx';
import { Field, FormActions, FormError, friendlyError, DATE_MIN, DATE_MAX } from '../components/Form.jsx';

const STATUSES = ['Planning', 'Open', 'Full', 'In Progress', 'Completed', 'Cancelled'];
const DELIVERY = ['On Campus', 'Online', 'Hybrid'];

function EditDialog({ intake, onClose, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: intake.name || '',
    academicYear: intake.academicYear || '',
    startDate: intake.startDate || '',
    endDate: intake.endDate || '',
    applicationOpenDate: intake.applicationOpenDate || '',
    applicationDeadline: intake.applicationDeadline || '',
    capacity: intake.capacity ?? '',
    deliveryMode: intake.deliveryMode || '',
    location: intake.location || ''
  });
  const [touched, setTouched] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const action = useAction(async () => { await onDone(); onClose(); });

  const errors = {
    name: !form.name.trim() ? 'An intake name is required.' : null,
    endDate: form.startDate && form.endDate && form.endDate < form.startDate
      ? 'The end date cannot be before the start date.' : null,
    applicationDeadline: form.applicationOpenDate && form.applicationDeadline
      && form.applicationDeadline < form.applicationOpenDate
      ? 'The deadline cannot be before the opening date.' : null
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (hasErrors) return;
    const r = await action.run(() => api.updateIntake(intake.id, {
      ...form,
      name: form.name.trim(),
      capacity: form.capacity === '' ? undefined : Number(form.capacity),
      expectedModifiedTime: intake.modifiedTime
    }));
    if (r) toast('Intake updated.');
  };

  return (
    <Modal title="Edit intake" onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field id="name" label="Intake name" required error={touched ? errors.name : null}>
            <input value={form.name} onChange={set('name')} />
          </Field>
          <Field id="academicYear" label="Academic year">
            <input value={form.academicYear} onChange={set('academicYear')} />
          </Field>
          <Field id="startDate" label="Start date">
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.startDate} onChange={set('startDate')} />
          </Field>
          <Field id="endDate" label="End date" error={touched ? errors.endDate : null}>
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.endDate} onChange={set('endDate')} />
          </Field>
          <Field id="applicationOpenDate" label="Applications open">
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.applicationOpenDate} onChange={set('applicationOpenDate')} />
          </Field>
          <Field id="applicationDeadline" label="Application deadline" error={touched ? errors.applicationDeadline : null}>
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.applicationDeadline} onChange={set('applicationDeadline')} />
          </Field>
          <Field id="capacity" label="Capacity" hint="Leave blank for no limit.">
            <input type="number" min="0" value={form.capacity} onChange={set('capacity')} />
          </Field>
          <Field id="deliveryMode" label="Delivery method">
            <select value={form.deliveryMode} onChange={set('deliveryMode')}>
              <option value="">Not set</option>
              {DELIVERY.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field id="location" label="Campus or location">
            <input value={form.location} onChange={set('location')} />
          </Field>
        </div>
        <FormError error={action.error ? friendlyError(action.error) : null} />
        <FormActions busy={action.busy} submitLabel="Save changes" onCancel={onClose} />
      </form>
    </Modal>
  );
}

export default function IntakeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const can = useCan();
  const toast = useToast();
  const state = useApi((o) => api.intake(id, o), [id]);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [status, setStatus] = useState('');
  const action = useAction(async () => { await state.reload(); });

  return (
    <Async state={state} empty={{ title: 'Intake not found' }} emptyWhen={(d) => !d || !d.intake}>
      {(d) => {
        const i = d.intake;

        const onStatus = async (e) => {
          e.preventDefault();
          if (!status) return;
          const r = await action.run(() => api.setIntakeStatus(id, {
            status, expectedModifiedTime: i.modifiedTime
          }));
          if (r) { toast(`Intake set to ${status}.`); setStatus(''); }
        };

        const onDelete = () => setConfirm({
          title: 'Delete this intake permanently?',
          message: 'This cannot be undone. Deletion is refused while any application or enrolment still points at it — set the status to Cancelled instead.',
          run: async () => {
            const r = await action.run(() => api.deleteIntake(id));
            if (r) { toast('Intake deleted.'); navigate('/intakes', { replace: true }); }
          }
        });

        return (
          <>
            <div className="page-head">
              <h1>{i.name}</h1>
              <p>
                <Pill value={i.status} />{' '}
                {i.full && <span className="pill stop">Full</span>}{' '}
                {d.programme && <>for <Link to={`/programmes/${d.programme.id}`}>{d.programme.name}</Link></>}
              </p>
              <div className="head-actions">
                {can('intake:write') && (
                  <button type="button" className="btn" onClick={() => setEditing(true)}>Edit</button>
                )}
                {can('intake:delete') && (
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

            <div className="grid g-2">
              <Card title="Intake details" action={<SourceBadge source="crm" />}>
                <dl className="dl">
                  <dt>Intake ID</dt><dd className="mono">{i.intakeId || '—'}</dd>
                  <dt>Academic year</dt><dd>{i.academicYear || '—'}</dd>
                  <dt>Teaching starts</dt><dd>{fmtDate(i.startDate)}</dd>
                  <dt>Teaching ends</dt><dd>{fmtDate(i.endDate)}</dd>
                  <dt>Applications open</dt><dd>{fmtDate(i.applicationOpenDate)}</dd>
                  <dt>Application deadline</dt><dd>{fmtDate(i.applicationDeadline)}</dd>
                  <dt>Delivery method</dt><dd>{i.deliveryMode || '—'}</dd>
                  <dt>Location</dt><dd>{i.location || '—'}</dd>
                  <dt>Last modified</dt><dd>{fmtDate(i.modifiedTime)}</dd>
                </dl>
              </Card>

              <Card title="Capacity" action={<SourceBadge source="crm" />}>
                <dl className="dl">
                  <dt>Capacity</dt>
                  <dd className="mono">
                    {i.capacity === null ? <span className="muted">Not limited</span> : i.capacity}
                  </dd>
                  <dt>Active enrolments</dt><dd className="mono">{d.activeEnrolments}</dd>
                  <dt>Places remaining</dt>
                  <dd className="mono">
                    {i.placesRemaining === null ? <span className="muted">Not limited</span> : i.placesRemaining}
                  </dd>
                  <dt>Applications</dt><dd className="mono">{d.applications.length}</dd>
                </dl>
                {i.full && (
                  <p className="note">
                    This intake is at capacity. New enrolments are refused unless an
                    administrator explicitly confirms an override.
                  </p>
                )}

                {can('intake:write') && (
                  <form onSubmit={onStatus} className="inline-form">
                    <Field id="intake-status" label="Change status">
                      <select value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="">Choose a status…</option>
                        {STATUSES.filter((s) => s !== i.status).map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </Field>
                    <button type="submit" className="btn" disabled={!status || action.busy}>
                      {action.busy ? 'Working…' : 'Apply'}
                    </button>
                  </form>
                )}
              </Card>
            </div>

            <Card title={`Applications (${d.applications.length})`} action={<SourceBadge source="crm" />}>
              {d.applications.length ? (
                <ul className="plain-list">
                  {d.applications.map((a) => (
                    <li key={a.id}>
                      <Link to={`/applications/${a.id}`}>{a.name || a.applicationId}</Link>{' '}
                      <Pill value={a.stage} />
                    </li>
                  ))}
                </ul>
              ) : <p className="muted">No applications for this intake.</p>}
            </Card>

            <Card title={`Enrolments (${d.enrolments.length})`} action={<SourceBadge source="crm" />}>
              {d.enrolments.length ? (
                <ul className="plain-list">
                  {d.enrolments.map((e) => (
                    <li key={e.id}>
                      <Link to={`/enrolments/${e.id}`}>{e.reference || e.externalReference || e.id}</Link>{' '}
                      <Pill value={e.status} />
                    </li>
                  ))}
                </ul>
              ) : <p className="muted">No enrolments for this intake.</p>}
            </Card>

            {editing && (
              <EditDialog intake={i} onClose={() => setEditing(false)} onDone={async () => { await state.reload(); }} />
            )}

            {confirm && (
              <ConfirmDialog
                title={confirm.title}
                message={confirm.message}
                confirmLabel="Delete permanently"
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
