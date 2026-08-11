import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi, useAction } from '../useApi.js';
import { api } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import { useT } from '../i18n/I18nContext.jsx';
import {
  Async, Card, Pill, SourceBadge, RefBadge, ConfirmDialog, Modal,
  useToast, fmtDate, fmtMoney
} from '../components/Ui.jsx';
import { Field, FormActions, FormError, friendlyError, DATE_MIN, DATE_MAX } from '../components/Form.jsx';
import ActivityLog from '../components/ActivityLog.jsx';
import WorkflowPanel from '../components/Workflow.jsx';
import { useBreadcrumbLeaf } from '../components/Shell.jsx';

/* --------------------------------- edit ---------------------------------- */

function EditDialog({ application, onClose, onDone }) {
  const t = useT();
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
    if (r) toast(t('applicationDetail.editDialog.updatedToast'));
  };

  return (
    <Modal title={t('applicationDetail.editDialog.title')} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field id="applicationDate" label={t('applicationDetail.editDialog.applicationDateLabel')}>
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.applicationDate} onChange={set('applicationDate')} />
          </Field>
          <Field id="closingDate" label={t('applicationDetail.editDialog.closingDateLabel')}>
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.closingDate} onChange={set('closingDate')} />
          </Field>
          <Field id="tuitionFee" label={t('applicationDetail.editDialog.tuitionFeeLabel')}>
            <input type="number" min="0" step="1" value={form.tuitionFee} onChange={set('tuitionFee')} />
          </Field>
          <Field id="studyMode" label={t('applicationDetail.editDialog.studyModeLabel')}>
            <input value={form.studyMode} onChange={set('studyMode')} />
          </Field>
          <Field id="documentsStatus" label={t('applicationDetail.editDialog.documentsStatusLabel')}>
            <input value={form.documentsStatus} onChange={set('documentsStatus')} />
          </Field>
        </div>
        <p className="note">
          {t('applicationDetail.editDialog.note')}
        </p>
        <FormError error={action.error ? friendlyError(action.error) : null} />
        <FormActions busy={action.busy} submitLabel={t('applicationDetail.editDialog.submitLabel')} onCancel={onClose} />
      </form>
    </Modal>
  );
}

/* -------------------------------- the page -------------------------------- */

export default function ApplicationDetail() {
  const t = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const can = useCan();
  const toast = useToast();
  const state = useApi((o) => api.application(id, o), [id]);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const action = useAction(async () => { await state.reload(); });

  // Names this record in the breadcrumb trail rather than showing "Details".
  // Read from state at the top level: hooks cannot run inside <Async>'s render
  // callback, which is a plain function and not a component.
  const loaded = state.data && state.data.application;
  useBreadcrumbLeaf(loaded ? (loaded.name || loaded.applicationId || null) : null);

  return (
    <Async state={state} empty={{ title: t('applicationDetail.notFoundTitle') }} emptyWhen={(d) => !d || !d.application}>
      {(d) => {
        const a = d.application;

        const onWithdraw = () => setConfirm({
          title: t('applicationDetail.withdrawConfirm.title'),
          message: t('applicationDetail.withdrawConfirm.message'),
          confirmLabel: t('applicationDetail.withdrawConfirm.confirmLabel'),
          run: async () => {
            const r = await action.run(() => api.archiveApplication(id, { expectedModifiedTime: a.modifiedTime }));
            if (r) { toast(t('applicationDetail.withdrawConfirm.toast')); setConfirm(null); }
          }
        });

        const onDelete = () => setConfirm({
          title: t('applicationDetail.deleteConfirm.title'),
          message: t('applicationDetail.deleteConfirm.message'),
          confirmLabel: t('applicationDetail.deleteConfirm.confirmLabel'),
          run: async () => {
            const r = await action.run(() => api.deleteApplication(id));
            if (r) { toast(t('applicationDetail.deleteConfirm.toast')); navigate('/applications', { replace: true }); }
          }
        });

        return (
          <>
            <div className="page-head">
              <h1>{a.name || a.applicationId || t('applicationDetail.fallbackTitle')}</h1>
              <p>
                <Pill value={a.stage} />{' '}
                <RefBadge reference={a.applicationId || a.externalReference} />
              </p>
              <div className="head-actions">
                {can('application:write') && (
                  <>
                    <button type="button" className="btn" onClick={() => setEditing(true)}>{t('applicationDetail.editButton')}</button>
                    {a.stage !== 'Withdrawn' && (
                      <button type="button" className="btn" onClick={onWithdraw}>{t('applicationDetail.withdrawButton')}</button>
                    )}
                  </>
                )}
                {can('application:delete') && (
                  <button type="button" className="btn danger" onClick={onDelete}>{t('applicationDetail.deleteButton')}</button>
                )}
              </div>
            </div>

            {action.error && (
              <div className="state err" role="alert">
                <h3>{t('applicationDetail.actionErrorTitle')}</h3>
                <p>{friendlyError(action.error)}</p>
              </div>
            )}

            <WorkflowPanel
              application={a}
              workflow={d.workflow}
              enrolment={d.enrolment}
              canTransition={can('application:transition')}
              onDone={async () => { await state.reload(); }}
            />

            <div className="grid g-2">
              <Card title={t('applicationDetail.detailsCard.title')} action={<SourceBadge source="crm" />}>
                <dl className="dl">
                  <dt>{t('applicationDetail.detailsCard.applicationId')}</dt><dd className="mono">{a.applicationId || '—'}</dd>
                  <dt>{t('applicationDetail.detailsCard.pipeline')}</dt><dd>{a.pipeline || '—'}</dd>
                  <dt>{t('applicationDetail.detailsCard.applied')}</dt><dd>{fmtDate(a.applicationDate)}</dd>
                  <dt>{t('applicationDetail.detailsCard.expectedDecision')}</dt><dd>{fmtDate(a.expectedDecisionDate)}</dd>
                  <dt>{t('applicationDetail.detailsCard.decisionRecorded')}</dt><dd>{fmtDate(a.decisionDate)}</dd>
                  <dt>{t('applicationDetail.detailsCard.tuitionFee')}</dt><dd className="mono">{fmtMoney(a.tuitionFee)}</dd>
                  <dt>{t('applicationDetail.detailsCard.studyMode')}</dt><dd>{a.studyMode || '—'}</dd>
                  <dt>{t('applicationDetail.detailsCard.documents')}</dt><dd>{a.documentsStatus || '—'}</dd>
                  <dt>{t('applicationDetail.detailsCard.lastModified')}</dt><dd>{fmtDate(a.modifiedTime)}</dd>
                </dl>
              </Card>

              <Card title={t('applicationDetail.relatedCard.title')} action={<SourceBadge source="crm" />}>
                <dl className="dl">
                  <dt>{t('applicationDetail.relatedCard.student')}</dt>
                  <dd>
                    {d.student
                      ? <Link to={`/students/${d.student.id}`}>{d.student.fullName || d.student.email}</Link>
                      : <span className="muted">{t('applicationDetail.relatedCard.notLinked')}</span>}
                  </dd>
                  <dt>{t('applicationDetail.relatedCard.programme')}</dt>
                  <dd>
                    {d.programme
                      ? <Link to={`/programmes/${d.programme.id}`}>{d.programme.name}</Link>
                      : <span className="muted">{t('applicationDetail.relatedCard.notLinked')}</span>}
                  </dd>
                  <dt>{t('applicationDetail.relatedCard.intake')}</dt>
                  <dd>
                    {d.intake
                      ? <Link to={`/intakes/${d.intake.id}`}>{d.intake.name}</Link>
                      : <span className="muted">{t('applicationDetail.relatedCard.notLinked')}</span>}
                  </dd>
                  <dt>{t('applicationDetail.relatedCard.enrolment')}</dt>
                  <dd>
                    {d.enrolment
                      ? <Link to={`/enrolments/${d.enrolment.id}`}>{d.enrolment.reference || d.enrolment.id}</Link>
                      : <span className="muted">{t('applicationDetail.relatedCard.noneYet')}</span>}
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

            <Card title={t('applicationDetail.activityCard.title')}>
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
