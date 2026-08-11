import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi, useAction } from '../useApi.js';
import { api } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import { useT } from '../i18n/I18nContext.jsx';
import {
  Async, Card, Pill, SourceBadge, DemoDataBadge, ConfirmDialog, Modal, useToast, fmtDate, fmtMoney
} from '../components/Ui.jsx';
import { Field, FormActions, FormError, friendlyError } from '../components/Form.jsx';

const LEVELS = ['Foundation', 'Certificate', 'Diploma', 'Undergraduate', 'Postgraduate', 'Professional', 'Other'];
const STATUSES = ['Draft', 'Open for Applications', 'Running', 'Suspended', 'Archived'];

function EditDialog({ programme, onClose, onDone }) {
  const t = useT();
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
    if (r) toast(t('programmeDetail.editDialog.updated'));
  };

  return (
    <Modal title={t('programmeDetail.editDialog.title')} onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field id="name" label={t('programmeDetail.editDialog.nameLabel')} required>
            <input value={form.name} onChange={set('name')} />
          </Field>
          <Field id="status" label={t('programmeDetail.editDialog.statusLabel')}>
            <select value={form.status} onChange={set('status')}>
              <option value="">{t('programmeDetail.editDialog.notSet')}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field id="academicLevel" label={t('programmeDetail.editDialog.academicLevelLabel')}>
            <select value={form.academicLevel} onChange={set('academicLevel')}>
              <option value="">{t('programmeDetail.editDialog.notSet')}</option>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>
          <Field id="department" label={t('programmeDetail.editDialog.departmentLabel')}>
            <input value={form.department} onChange={set('department')} />
          </Field>
          <Field id="award" label={t('programmeDetail.editDialog.awardLabel')}>
            <input value={form.award} onChange={set('award')} />
          </Field>
          <Field id="durationValue" label={t('programmeDetail.editDialog.durationLabel')}>
            <input type="number" min="0" value={form.durationValue} onChange={set('durationValue')} />
          </Field>
          <Field id="durationUnit" label={t('programmeDetail.editDialog.durationUnitLabel')}>
            <input value={form.durationUnit} onChange={set('durationUnit')} />
          </Field>
          <Field id="tuitionFee" label={t('programmeDetail.editDialog.tuitionFeeLabel')}>
            <input type="number" min="0" value={form.tuitionFee} onChange={set('tuitionFee')} />
          </Field>
          <Field id="lmsCourseId" label={t('programmeDetail.editDialog.lmsCourseIdLabel')}>
            <input value={form.lmsCourseId} onChange={set('lmsCourseId')} />
          </Field>
          <Field id="lmsCourseUrl" label={t('programmeDetail.editDialog.lmsCourseUrlLabel')}>
            <input value={form.lmsCourseUrl} onChange={set('lmsCourseUrl')} />
          </Field>
        </div>
        <FormError error={action.error ? friendlyError(action.error) : null} />
        <FormActions busy={action.busy} submitLabel={t('programmeDetail.editDialog.submit')} onCancel={onClose} />
      </form>
    </Modal>
  );
}

export default function ProgrammeDetail() {
  const t = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const can = useCan();
  const toast = useToast();
  const state = useApi((o) => api.programme(id, o), [id]);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const action = useAction(async () => { await state.reload(); });

  return (
    <Async state={state} empty={{ title: t('programmeDetail.notFound') }} emptyWhen={(d) => !d || !d.programme}>
      {(d) => {
        const p = d.programme;

        const onToggleActive = () => setConfirm({
          title: p.active ? t('programmeDetail.deactivateTitle') : t('programmeDetail.activateTitle'),
          message: p.active ? t('programmeDetail.deactivateMessage') : t('programmeDetail.activateMessage'),
          confirmLabel: p.active ? t('programmeDetail.deactivateAction') : t('programmeDetail.activateAction'),
          danger: p.active,
          run: async () => {
            const r = await action.run(() => api.setProgrammeActive(id, {
              active: !p.active, expectedModifiedTime: p.modifiedTime
            }));
            if (r) {
              toast(p.active ? t('programmeDetail.deactivated') : t('programmeDetail.activated'));
              setConfirm(null);
            }
          }
        });

        const onDelete = () => setConfirm({
          title: t('programmeDetail.deleteTitle'),
          message: t('programmeDetail.deleteMessage'),
          confirmLabel: t('programmeDetail.deleteConfirmLabel'),
          danger: true,
          run: async () => {
            const r = await action.run(() => api.deleteProgramme(id));
            if (r) { toast(t('programmeDetail.deleted')); navigate('/programmes', { replace: true }); }
          }
        });

        return (
          <>
            <div className="page-head">
              <h1>{p.name}</h1>
              <p>
                <Pill value={p.status} />{' '}
                {!p.active && <span className="pill mute">{t('programmeDetail.inactiveBadge')}</span>}{' '}
                <span className="pill mute mono">{p.code}</span>
              </p>
              <div className="head-actions">
                {can('programme:write') && (
                  <>
                    <button type="button" className="btn" onClick={() => setEditing(true)}>{t('programmeDetail.edit')}</button>
                    <button type="button" className="btn" onClick={onToggleActive}>
                      {p.active ? t('programmeDetail.deactivateAction') : t('programmeDetail.activateAction')}
                    </button>
                  </>
                )}
                {can('programme:delete') && (
                  <button type="button" className="btn danger" onClick={onDelete}>{t('programmeDetail.delete')}</button>
                )}
              </div>
            </div>

            {action.error && (
              <div className="state err" role="alert">
                <h3>{t('programmeDetail.actionFailedTitle')}</h3>
                <p>{friendlyError(action.error)}</p>
              </div>
            )}

            <div className="grid g-2">
              <Card title={t('programmeDetail.detailsCard')} action={<SourceBadge source="crm" />}>
                <dl className="dl">
                  <dt>{t('programmeDetail.fields.code')}</dt><dd className="mono">{p.code || '—'}</dd>
                  <dt>{t('programmeDetail.fields.academicLevel')}</dt><dd>{p.academicLevel || '—'}</dd>
                  <dt>{t('programmeDetail.fields.department')}</dt><dd>{p.department || '—'}</dd>
                  <dt>{t('programmeDetail.fields.award')}</dt><dd>{p.award || '—'}</dd>
                  <dt>{t('programmeDetail.fields.duration')}</dt>
                  <dd>{p.durationValue ? `${p.durationValue} ${p.durationUnit || ''}`.trim() : '—'}</dd>
                  <dt>{t('programmeDetail.fields.deliveryMode')}</dt>
                  <dd>{p.deliveryMode.length ? p.deliveryMode.join(', ') : '—'}</dd>
                  <dt>{t('programmeDetail.fields.tuitionFee')}</dt><dd className="mono">{fmtMoney(p.tuitionFee)}</dd>
                  <dt>{t('programmeDetail.fields.lastModified')}</dt><dd>{fmtDate(p.modifiedTime)}</dd>
                </dl>
              </Card>

              <Card
                title={t('programmeDetail.lmsCourseCard')}
                action={<div className="head-actions"><SourceBadge source="lms" /><DemoDataBadge /></div>}
              >
                {d.lmsCourse ? (
                  <>
                    <dl className="dl">
                      <dt>{t('programmeDetail.lmsFields.course')}</dt>
                      <dd><Link to={`/learning/courses/${d.lmsCourse.id}`}>{d.lmsCourse.name}</Link></dd>
                      <dt>{t('programmeDetail.lmsFields.provider')}</dt><dd>{d.lmsCourse.provider}</dd>
                      <dt>{t('programmeDetail.lmsFields.externalCourseId')}</dt><dd className="mono">{d.lmsCourse.externalCourseId}</dd>
                      <dt>{t('programmeDetail.lmsFields.deliveryType')}</dt>
                      <dd>{d.lmsCourse.deliveryType || <span className="muted">—</span>}</dd>
                      <dt>{t('programmeDetail.lmsFields.publication')}</dt><dd><Pill value={d.lmsCourse.publicationStatus} /></dd>
                      <dt>{t('programmeDetail.lmsFields.syncStatus')}</dt><dd><Pill value={d.lmsCourse.syncStatus} /></dd>
                    </dl>
                    {d.lmsCourse.description && <p className="muted">{d.lmsCourse.description}</p>}
                  </>
                ) : (
                  <p className="muted">
                    {t('programmeDetail.noLmsCourseBefore')}{' '}
                    <Link to="/learning/courses">{t('programmeDetail.learningHub')}</Link>
                    {t('programmeDetail.noLmsCourseAfter')}
                  </p>
                )}
              </Card>
            </div>

            <Card title={t('programmeDetail.intakesCard')} action={<SourceBadge source="crm" />}>
              {d.intakes.length ? (
                <div className="t-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{t('programmeDetail.intakesTable.intake')}</th>
                        <th scope="col">{t('programmeDetail.intakesTable.status')}</th>
                        <th scope="col">{t('programmeDetail.intakesTable.starts')}</th>
                        <th scope="col">{t('programmeDetail.intakesTable.ends')}</th>
                        <th scope="col">{t('programmeDetail.intakesTable.capacity')}</th>
                        <th scope="col">{t('programmeDetail.intakesTable.enrolled')}</th>
                        <th scope="col">{t('programmeDetail.intakesTable.location')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.intakes.map((i) => (
                        <tr key={i.id}>
                          <td><Link to={`/intakes/${i.id}`}>{i.name}</Link></td>
                          <td><Pill value={i.status} /></td>
                          <td>{fmtDate(i.startDate)}</td>
                          <td>{fmtDate(i.endDate)}</td>
                          <td className="mono">{i.capacity ?? <span className="muted">{t('programmeDetail.notLimited')}</span>}</td>
                          <td className="mono">{i.enrolledStudents}</td>
                          <td>{i.location || <span className="muted">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="muted">{t('programmeDetail.noIntakes')}</p>}
            </Card>

            <div className="grid g-2">
              <Card title={t('programmeDetail.applicationsCard', { count: d.applications.length })} action={<SourceBadge source="crm" />}>
                {d.applications.length ? (
                  <ul className="plain-list">
                    {d.applications.slice(0, 10).map((a) => (
                      <li key={a.id}>
                        <Link to={`/applications/${a.id}`}>{a.name || a.applicationId}</Link>
                        {' '}<Pill value={a.stage} />
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted">{t('programmeDetail.noApplications')}</p>}
              </Card>

              <Card title={t('programmeDetail.enrolmentsCard', { count: d.enrolments.length })} action={<SourceBadge source="crm" />}>
                {d.enrolments.length ? (
                  <ul className="plain-list">
                    {d.enrolments.slice(0, 10).map((e) => (
                      <li key={e.id}>
                        <Link to={`/enrolments/${e.id}`}>{e.reference || e.externalReference || e.id}</Link>
                        {' '}<Pill value={e.status} />
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted">{t('programmeDetail.noEnrolments')}</p>}
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
