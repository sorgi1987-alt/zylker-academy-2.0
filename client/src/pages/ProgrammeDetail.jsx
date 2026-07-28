import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi, useAction } from '../useApi.js';
import { api } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import {
  Async, Card, Pill, SourceBadge, DemoDataBadge, ConfirmDialog, Modal, useToast, fmtDate, fmtMoney
} from '../components/Ui.jsx';
import { Field, FormActions, FormError, friendlyError } from '../components/Form.jsx';

const LEVELS = ['Foundation', 'Certificate', 'Diploma', 'Undergraduate', 'Postgraduate', 'Professional', 'Other'];
const STATUSES = ['Draft', 'Open for Applications', 'Running', 'Suspended', 'Archived'];

function EditDialog({ programme, onClose, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: programme.name || '',
    status: programme.status || '',
    academicLevel: programme.academicLevel || '',
    department: programme.department || '',
    award: programme.award || '',
    durationValue: programme.durationValue ?? '',
    durationUnit: programme.durationUnit || '',
    tuitionFee: programme.tuitionFee ?? '',
    lmsCourseId: programme.lms.courseId || '',
    lmsCourseUrl: programme.lms.courseUrl || ''
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const action = useAction(async () => { await onDone(); onClose(); });

  const submit = async (e) => {
    e.preventDefault();
    const r = await action.run(() => api.updateProgramme(programme.id, {
      ...form,
      durationValue: form.durationValue === '' ? undefined : Number(form.durationValue),
      tuitionFee: form.tuitionFee === '' ? undefined : Number(form.tuitionFee),
      expectedModifiedTime: programme.modifiedTime
    }));
    if (r) toast('Programme updated.');
  };

  return (
    <Modal title="Edit programme" onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field id="name" label="Programme name" required>
            <input value={form.name} onChange={set('name')} />
          </Field>
          <Field id="status" label="Status">
            <select value={form.status} onChange={set('status')}>
              <option value="">Not set</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field id="academicLevel" label="Academic level">
            <select value={form.academicLevel} onChange={set('academicLevel')}>
              <option value="">Not set</option>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>
          <Field id="department" label="Department">
            <input value={form.department} onChange={set('department')} />
          </Field>
          <Field id="award" label="Award or certificate">
            <input value={form.award} onChange={set('award')} />
          </Field>
          <Field id="durationValue" label="Duration">
            <input type="number" min="0" value={form.durationValue} onChange={set('durationValue')} />
          </Field>
          <Field id="durationUnit" label="Duration unit">
            <input value={form.durationUnit} onChange={set('durationUnit')} />
          </Field>
          <Field id="tuitionFee" label="Tuition fee">
            <input type="number" min="0" value={form.tuitionFee} onChange={set('tuitionFee')} />
          </Field>
          <Field id="lmsCourseId" label="LMS course id">
            <input value={form.lmsCourseId} onChange={set('lmsCourseId')} />
          </Field>
          <Field id="lmsCourseUrl" label="LMS course URL">
            <input value={form.lmsCourseUrl} onChange={set('lmsCourseUrl')} />
          </Field>
        </div>
        <FormError error={action.error ? friendlyError(action.error) : null} />
        <FormActions busy={action.busy} submitLabel="Save changes" onCancel={onClose} />
      </form>
    </Modal>
  );
}

export default function ProgrammeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const can = useCan();
  const toast = useToast();
  const state = useApi((o) => api.programme(id, o), [id]);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const action = useAction(async () => { await state.reload(); });

  return (
    <Async state={state} empty={{ title: 'Programme not found' }} emptyWhen={(d) => !d || !d.programme}>
      {(d) => {
        const p = d.programme;

        const onToggleActive = () => setConfirm({
          title: p.active ? 'Deactivate this programme?' : 'Activate this programme?',
          message: p.active
            ? 'The programme stops being offered. Its intakes, applications and enrolments are kept and stay linked.'
            : 'The programme becomes available again for new intakes and applications.',
          confirmLabel: p.active ? 'Deactivate' : 'Activate',
          danger: p.active,
          run: async () => {
            const r = await action.run(() => api.setProgrammeActive(id, {
              active: !p.active, expectedModifiedTime: p.modifiedTime
            }));
            if (r) { toast(p.active ? 'Programme deactivated.' : 'Programme activated.'); setConfirm(null); }
          }
        });

        const onDelete = () => setConfirm({
          title: 'Delete this programme permanently?',
          message: 'This cannot be undone. Deletion is refused while any intake, application or enrolment still points at it — deactivate it instead.',
          confirmLabel: 'Delete permanently',
          danger: true,
          run: async () => {
            const r = await action.run(() => api.deleteProgramme(id));
            if (r) { toast('Programme deleted.'); navigate('/programmes', { replace: true }); }
          }
        });

        return (
          <>
            <div className="page-head">
              <h1>{p.name}</h1>
              <p>
                <Pill value={p.status} />{' '}
                {!p.active && <span className="pill mute">Inactive</span>}{' '}
                <span className="pill mute mono">{p.code}</span>
              </p>
              <div className="head-actions">
                {can('programme:write') && (
                  <>
                    <button type="button" className="btn" onClick={() => setEditing(true)}>Edit</button>
                    <button type="button" className="btn" onClick={onToggleActive}>
                      {p.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </>
                )}
                {can('programme:delete') && (
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
              <Card title="Programme details" action={<SourceBadge source="crm" />}>
                <dl className="dl">
                  <dt>Code</dt><dd className="mono">{p.code || '—'}</dd>
                  <dt>Academic level</dt><dd>{p.academicLevel || '—'}</dd>
                  <dt>Department</dt><dd>{p.department || '—'}</dd>
                  <dt>Award</dt><dd>{p.award || '—'}</dd>
                  <dt>Duration</dt>
                  <dd>{p.durationValue ? `${p.durationValue} ${p.durationUnit || ''}`.trim() : '—'}</dd>
                  <dt>Delivery mode</dt>
                  <dd>{p.deliveryMode.length ? p.deliveryMode.join(', ') : '—'}</dd>
                  <dt>Tuition fee</dt><dd className="mono">{fmtMoney(p.tuitionFee)}</dd>
                  <dt>Last modified</dt><dd>{fmtDate(p.modifiedTime)}</dd>
                </dl>
              </Card>

              <Card
                title="LMS course"
                action={<div className="head-actions"><SourceBadge source="lms" /><DemoDataBadge /></div>}
              >
                {d.lmsCourse ? (
                  <>
                    <dl className="dl">
                      <dt>Course</dt>
                      <dd><Link to={`/learning/courses/${d.lmsCourse.id}`}>{d.lmsCourse.name}</Link></dd>
                      <dt>Provider</dt><dd>{d.lmsCourse.provider}</dd>
                      <dt>External course id</dt><dd className="mono">{d.lmsCourse.externalCourseId}</dd>
                      <dt>Delivery type</dt>
                      <dd>{d.lmsCourse.deliveryType || <span className="muted">—</span>}</dd>
                      <dt>Publication</dt><dd><Pill value={d.lmsCourse.publicationStatus} /></dd>
                      <dt>Sync status</dt><dd><Pill value={d.lmsCourse.syncStatus} /></dd>
                    </dl>
                    {d.lmsCourse.description && <p className="muted">{d.lmsCourse.description}</p>}
                  </>
                ) : (
                  <p className="muted">
                    No LMS course is mapped to this programme. Map one from the{' '}
                    <Link to="/learning/courses">Learning Hub</Link> — the mapping is made
                    against this programme&rsquo;s CRM id, so it cannot attach to the wrong
                    record.
                  </p>
                )}
              </Card>
            </div>

            <Card title="Intakes" action={<SourceBadge source="crm" />}>
              {d.intakes.length ? (
                <div className="t-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Intake</th>
                        <th scope="col">Status</th>
                        <th scope="col">Starts</th>
                        <th scope="col">Ends</th>
                        <th scope="col">Capacity</th>
                        <th scope="col">Enrolled</th>
                        <th scope="col">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.intakes.map((i) => (
                        <tr key={i.id}>
                          <td><Link to={`/intakes/${i.id}`}>{i.name}</Link></td>
                          <td><Pill value={i.status} /></td>
                          <td>{fmtDate(i.startDate)}</td>
                          <td>{fmtDate(i.endDate)}</td>
                          <td className="mono">{i.capacity ?? <span className="muted">Not limited</span>}</td>
                          <td className="mono">{i.enrolledStudents}</td>
                          <td>{i.location || <span className="muted">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="muted">No intakes are configured for this programme.</p>}
            </Card>

            <div className="grid g-2">
              <Card title={`Applications (${d.applications.length})`} action={<SourceBadge source="crm" />}>
                {d.applications.length ? (
                  <ul className="plain-list">
                    {d.applications.slice(0, 10).map((a) => (
                      <li key={a.id}>
                        <Link to={`/applications/${a.id}`}>{a.name || a.applicationId}</Link>
                        {' '}<Pill value={a.stage} />
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted">No applications for this programme.</p>}
              </Card>

              <Card title={`Enrolments (${d.enrolments.length})`} action={<SourceBadge source="crm" />}>
                {d.enrolments.length ? (
                  <ul className="plain-list">
                    {d.enrolments.slice(0, 10).map((e) => (
                      <li key={e.id}>
                        <Link to={`/enrolments/${e.id}`}>{e.reference || e.externalReference || e.id}</Link>
                        {' '}<Pill value={e.status} />
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted">No enrolments for this programme.</p>}
              </Card>
            </div>

            {editing && (
              <EditDialog
                programme={p}
                onClose={() => setEditing(false)}
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
