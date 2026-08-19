import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi, useAction } from '../useApi.js';
import { api } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import { useT } from '../i18n/I18nContext.jsx';
import {
  Async, Card, Pill, SourceBadge, ConfirmDialog, Modal, useToast, fmtDate
} from '../components/Ui.jsx';
import { Field, FormActions, FormError, friendlyError, DATE_MIN, DATE_MAX } from '../components/Form.jsx';

const STATUSES = ['Planning', 'Open', 'Full', 'In Progress', 'Completed', 'Cancelled'];
const DELIVERY = ['On Campus', 'Online', 'Hybrid'];

function EditDialog({ intake, onClose, onDone }) {
  const t = useT();
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
    name: !form.name.trim() ? t('intakeDetail.editDialog.nameRequired') : null,
    endDate: form.startDate && form.endDate && form.endDate < form.startDate
      ? t('intakeDetail.editDialog.endDateError') : null,
    applicationDeadline: form.applicationOpenDate && form.applicationDeadline
      && form.applicationDeadline < form.applicationOpenDate
      ? t('intakeDetail.editDialog.applicationDeadlineError') : null
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
    if (r) toast(t('intakeDetail.editDialog.updated'));
  };

  return (
    <Modal title={t('intakeDetail.editDialog.title')} onClose={onClose} wide busy={action.busy}>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field id="name" label={t('intakeDetail.editDialog.nameLabel')} required error={touched ? errors.name : null}>
            <input value={form.name} onChange={set('name')} />
          </Field>
          <Field id="academicYear" label={t('intakeDetail.editDialog.academicYearLabel')}>
            <input value={form.academicYear} onChange={set('academicYear')} />
          </Field>
          <Field id="startDate" label={t('intakeDetail.editDialog.startDateLabel')}>
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.startDate} onChange={set('startDate')} />
          </Field>
          <Field id="endDate" label={t('intakeDetail.editDialog.endDateLabel')} error={touched ? errors.endDate : null}>
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.endDate} onChange={set('endDate')} />
          </Field>
          <Field id="applicationOpenDate" label={t('intakeDetail.editDialog.applicationOpenLabel')}>
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.applicationOpenDate} onChange={set('applicationOpenDate')} />
          </Field>
          <Field id="applicationDeadline" label={t('intakeDetail.editDialog.applicationDeadlineLabel')} error={touched ? errors.applicationDeadline : null}>
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.applicationDeadline} onChange={set('applicationDeadline')} />
          </Field>
          <Field id="capacity" label={t('intakeDetail.editDialog.capacityLabel')} hint={t('intakeDetail.editDialog.capacityHint')}>
            <input type="number" min="0" value={form.capacity} onChange={set('capacity')} />
          </Field>
          <Field id="deliveryMode" label={t('intakeDetail.editDialog.deliveryLabel')}>
            <select value={form.deliveryMode} onChange={set('deliveryMode')}>
              <option value="">{t('intakeDetail.editDialog.notSet')}</option>
              {DELIVERY.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field id="location" label={t('intakeDetail.editDialog.locationLabel')}>
            <input value={form.location} onChange={set('location')} />
          </Field>
        </div>
        <FormError error={action.error ? friendlyError(action.error) : null} />
        <FormActions busy={action.busy} submitLabel={t('intakeDetail.editDialog.submit')} onCancel={onClose} />
      </form>
    </Modal>
  );
}

export default function IntakeDetail() {
  const t = useT();
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
    <Async state={state} empty={{ title: t('intakeDetail.notFound') }} emptyWhen={(d) => !d || !d.intake}>
      {(d) => {
        const i = d.intake;

        const onStatus = async (e) => {
          e.preventDefault();
          if (!status) return;
          const r = await action.run(() => api.setIntakeStatus(id, {
            status, expectedModifiedTime: i.modifiedTime
          }));
          if (r) { toast(t('intakeDetail.statusUpdated', { status })); setStatus(''); }
        };

        const onDelete = () => setConfirm({
          title: t('intakeDetail.deleteTitle'),
          message: t('intakeDetail.deleteMessage'),
          run: async () => {
            const r = await action.run(() => api.deleteIntake(id));
            if (r) { toast(t('intakeDetail.deleted')); navigate('/intakes', { replace: true }); }
          }
        });

        return (
          <>
            <div className="page-head">
              <h1>{i.name}</h1>
              <p>
                <Pill value={i.status} />{' '}
                {i.full && <span className="pill stop">{t('intakeDetail.fullBadge')}</span>}{' '}
                {d.programme && <>{t('intakeDetail.forProgramme')} <Link to={`/programmes/${d.programme.id}`}>{d.programme.name}</Link></>}
              </p>
              <div className="head-actions">
                {can('intake:write') && (
                  <button type="button" className="btn" onClick={() => setEditing(true)}>{t('intakeDetail.edit')}</button>
                )}
                {can('intake:delete') && (
                  <button type="button" className="btn danger" onClick={onDelete}>{t('intakeDetail.delete')}</button>
                )}
              </div>
            </div>

            {action.error && (
              <div className="state err" role="alert">
                <h3>{t('intakeDetail.actionFailedTitle')}</h3>
                <p>{friendlyError(action.error)}</p>
              </div>
            )}

            <div className="grid g-2">
              <Card title={t('intakeDetail.detailsCard')} action={<SourceBadge source="crm" />}>
                <dl className="dl">
                  <dt>{t('intakeDetail.fields.intakeId')}</dt><dd className="mono">{i.intakeId || '—'}</dd>
                  <dt>{t('intakeDetail.fields.academicYear')}</dt><dd>{i.academicYear || '—'}</dd>
                  <dt>{t('intakeDetail.fields.teachingStarts')}</dt><dd>{fmtDate(i.startDate)}</dd>
                  <dt>{t('intakeDetail.fields.teachingEnds')}</dt><dd>{fmtDate(i.endDate)}</dd>
                  <dt>{t('intakeDetail.fields.applicationsOpen')}</dt><dd>{fmtDate(i.applicationOpenDate)}</dd>
                  <dt>{t('intakeDetail.fields.applicationDeadline')}</dt><dd>{fmtDate(i.applicationDeadline)}</dd>
                  <dt>{t('intakeDetail.fields.deliveryMethod')}</dt><dd>{i.deliveryMode || '—'}</dd>
                  <dt>{t('intakeDetail.fields.location')}</dt><dd>{i.location || '—'}</dd>
                  <dt>{t('intakeDetail.fields.lastModified')}</dt><dd>{fmtDate(i.modifiedTime)}</dd>
                </dl>
              </Card>

              <Card title={t('intakeDetail.capacityCard')} action={<SourceBadge source="crm" />}>
                <dl className="dl">
                  <dt>{t('intakeDetail.capacityFields.capacity')}</dt>
                  <dd className="mono">
                    {i.capacity === null ? <span className="muted">{t('intakeDetail.capacityFields.notLimited')}</span> : i.capacity}
                  </dd>
                  <dt>{t('intakeDetail.capacityFields.activeEnrolments')}</dt><dd className="mono">{d.activeEnrolments}</dd>
                  <dt>{t('intakeDetail.capacityFields.placesRemaining')}</dt>
                  <dd className="mono">
                    {i.placesRemaining === null ? <span className="muted">{t('intakeDetail.capacityFields.notLimited')}</span> : i.placesRemaining}
                  </dd>
                  <dt>{t('intakeDetail.capacityFields.applications')}</dt><dd className="mono">{d.applications.length}</dd>
                </dl>
                {i.full && (
                  <p className="note">
                    {t('intakeDetail.fullNote')}
                  </p>
                )}

                {can('intake:write') && (
                  <form onSubmit={onStatus} className="inline-form">
                    <Field id="intake-status" label={t('intakeDetail.changeStatusLabel')}>
                      <select value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="">{t('intakeDetail.chooseStatusPlaceholder')}</option>
                        {STATUSES.filter((s) => s !== i.status).map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </Field>
                    <button type="submit" className="btn" disabled={!status || action.busy}>
                      {action.busy ? t('common.working') : t('intakeDetail.apply')}
                    </button>
                  </form>
                )}
              </Card>
            </div>

            <Card title={t('intakeDetail.applicationsCard', { count: d.applications.length })} action={<SourceBadge source="crm" />}>
              {d.applications.length ? (
                <ul className="plain-list">
                  {d.applications.map((a) => (
                    <li key={a.id}>
                      <Link to={`/applications/${a.id}`}>{a.name || a.applicationId}</Link>{' '}
                      <Pill value={a.stage} />
                    </li>
                  ))}
                </ul>
              ) : <p className="muted">{t('intakeDetail.noApplications')}</p>}
            </Card>

            <Card title={t('intakeDetail.enrolmentsCard', { count: d.enrolments.length })} action={<SourceBadge source="crm" />}>
              {d.enrolments.length ? (
                <ul className="plain-list">
                  {d.enrolments.map((e) => (
                    <li key={e.id}>
                      <Link to={`/enrolments/${e.id}`}>{e.reference || e.externalReference || e.id}</Link>{' '}
                      <Pill value={e.status} />
                    </li>
                  ))}
                </ul>
              ) : <p className="muted">{t('intakeDetail.noEnrolments')}</p>}
            </Card>

            {editing && (
              <EditDialog intake={i} onClose={() => setEditing(false)} onDone={async () => { await state.reload(); }} />
            )}

            {confirm && (
              <ConfirmDialog
                title={confirm.title}
                message={confirm.message}
                confirmLabel={t('intakeDetail.deleteConfirmLabel')}
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
