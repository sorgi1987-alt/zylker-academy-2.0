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
import { useT } from '../i18n/I18nContext.jsx';

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
  const t = useT();
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
        ? t('learningEnrolmentDetail.mapStudentDialog.toastError', { message: r.data.lastSyncMessage })
        : t('learningEnrolmentDetail.mapStudentDialog.toastMapped'),
      r.data.mappingStatus === 'Error' ? 'warn' : 'ok');
    }
  };

  return (
    <Modal title={t('learningEnrolmentDetail.mapStudentDialog.title')} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field
          id="crmStudentId"
          label={t('learningEnrolmentDetail.mapStudentDialog.crmStudentLabel')}
          hint={t('learningEnrolmentDetail.mapStudentDialog.crmStudentHint')}
        >
          <select value={crmStudentId} onChange={(e) => setCrmStudentId(e.target.value)}>
            <option value="">{t('learningEnrolmentDetail.mapStudentDialog.matchByIdentifierOption')}</option>
            {loaded.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName || s.email}{s.studentId ? ` · ${s.studentId}` : ''}
              </option>
            ))}
          </select>
        </Field>

        {truncated && (
          <p className="note">
            {t('learningEnrolmentDetail.mapStudentDialog.truncatedNote', { loaded: loaded.length, total: students.meta.total })}
          </p>
        )}

        {!crmStudentId && (
          <Field
            id="studentEmail"
            label={t('learningEnrolmentDetail.mapStudentDialog.studentEmailLabel')}
            hint={record.crmStudentReference
              ? t('learningEnrolmentDetail.mapStudentDialog.studentEmailHintWithRef', { reference: record.crmStudentReference })
              : t('learningEnrolmentDetail.mapStudentDialog.studentEmailHintNoRef')}
          >
            <input type="email" value={studentEmail} onChange={(e) => setStudentEmail(e.target.value)} />
          </Field>
        )}

        <FormError error={action.error ? friendlyError(action.error) : null} />
        <FormActions
          busy={action.busy}
          submitLabel={t('learningEnrolmentDetail.mapStudentDialog.submitButton')}
          onCancel={onClose}
          disabled={!crmStudentId && !studentEmail && !record.crmStudentReference}
        />
      </form>
    </Modal>
  );
}

/** Links the record to an existing CRM Enrolment. */
function LinkEnrolmentDialog({ record, onClose, onDone }) {
  const t = useT();
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
    if (r) toast(crmEnrolmentId
      ? t('learningEnrolmentDetail.linkEnrolmentDialog.toastLinked')
      : t('learningEnrolmentDetail.linkEnrolmentDialog.toastCleared'));
  };

  return (
    <Modal title={t('learningEnrolmentDetail.linkEnrolmentDialog.title')} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field
          id="crmEnrolmentId"
          label={t('learningEnrolmentDetail.linkEnrolmentDialog.crmEnrolmentLabel')}
          hint={t('learningEnrolmentDetail.linkEnrolmentDialog.crmEnrolmentHint')}
        >
          <select value={crmEnrolmentId} onChange={(e) => setCrmEnrolmentId(e.target.value)}>
            <option value="">{t('learningEnrolmentDetail.linkEnrolmentDialog.notLinkedOption')}</option>
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
              ? t('learningEnrolmentDetail.linkEnrolmentDialog.noMatchTruncated', { loaded: loaded.length, total: enrolments.meta.total })
              : t('learningEnrolmentDetail.linkEnrolmentDialog.noEnrolments')}
          </p>
        )}
        <FormError error={action.error ? friendlyError(action.error) : null} />
        <FormActions
          busy={action.busy}
          submitLabel={t('learningEnrolmentDetail.linkEnrolmentDialog.submitButton')}
          onCancel={onClose}
        />
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
  const t = useT();
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
    if (r) toast(r.data.created ? t('learningEnrolmentDetail.createEnrolmentDialog.toastCreated') : r.data.reason);
  };

  return (
    <Modal title={t('learningEnrolmentDetail.createEnrolmentDialog.title')} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <dl className="dl">
          <dt>{t('learningEnrolmentDetail.createEnrolmentDialog.studentLabel')}</dt>
          <dd>{record.crmStudentReference || record.crmStudentId}</dd>
          <dt>{t('learningEnrolmentDetail.createEnrolmentDialog.programmeLabel')}</dt>
          <dd>
            {course && course.crmProgrammeReference
              ? course.crmProgrammeReference
              : <span className="muted">{t('learningEnrolmentDetail.createEnrolmentDialog.programmeFromCourse')}</span>}
          </dd>
        </dl>
        <Field
          id="intakeId"
          label={t('learningEnrolmentDetail.createEnrolmentDialog.intakeLabel')}
          required
          hint={t('learningEnrolmentDetail.createEnrolmentDialog.intakeHint')}
        >
          <select value={intakeId} onChange={(e) => setIntakeId(e.target.value)} required>
            <option value="">{t('learningEnrolmentDetail.createEnrolmentDialog.chooseIntakeOption')}</option>
            {options.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}{i.startDate ? ` · ${t('learningEnrolmentDetail.createEnrolmentDialog.startsPrefix', { date: i.startDate })}` : ''}
              </option>
            ))}
          </select>
        </Field>
        {truncated && (
          <p className="note">
            {t('learningEnrolmentDetail.createEnrolmentDialog.truncatedNote', { loaded: loaded.length, total: intakes.meta.total })}
          </p>
        )}
        <p className="note">
          {t('learningEnrolmentDetail.createEnrolmentDialog.dedupeNote')}
        </p>
        <FormError error={action.error ? friendlyError(action.error) : null} />
        <FormActions
          busy={action.busy}
          submitLabel={t('learningEnrolmentDetail.createEnrolmentDialog.submitButton')}
          onCancel={onClose}
          disabled={!intakeId}
        />
      </form>
    </Modal>
  );
}

export default function LearningEnrolmentDetail() {
  const t = useT();
  const { id } = useParams();
  const can = useCan();
  const toast = useToast();
  const state = useApi((o) => api.lmsEnrolment(id, o), [id]);
  const [dialog, setDialog] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const action = useAction(async () => { await state.reload(); });

  return (
    <Async state={state} empty={{ title: t('learningEnrolmentDetail.notFoundTitle') }} emptyWhen={(d) => !d || !d.enrolment}>
      {(d) => {
        const e = d.enrolment;

        const onSync = () => setConfirm({
          title: t('learningEnrolmentDetail.syncConfirm.title'),
          message: t('learningEnrolmentDetail.syncConfirm.message'),
          confirmLabel: t('learningEnrolmentDetail.syncConfirm.confirmLabel'),
          danger: false,
          run: async () => {
            const r = await action.run(() => api.syncLmsEnrolment(e.id, { idempotencyKey: newIdempotencyKey() }));
            if (r) {
              toast(t('learningEnrolmentDetail.toastSynced', { fields: (r.data.crmFieldsWritten || []).join(', ') }));
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
                <Link className="btn" to="/learning/enrolments">{t('learningEnrolmentDetail.allLearnersLink')}</Link>
                {can('lms:map') && (
                  <>
                    <button type="button" className="btn" onClick={() => setDialog('student')}>
                      {e.crmStudentId ? t('learningEnrolmentDetail.changeStudentButton') : t('learningEnrolmentDetail.mapStudentButton')}
                    </button>
                    <button type="button" className="btn" onClick={() => setDialog('enrolment')}>
                      {e.crmEnrolmentId ? t('learningEnrolmentDetail.changeCrmEnrolmentButton') : t('learningEnrolmentDetail.linkCrmEnrolmentButton')}
                    </button>
                  </>
                )}
                {can('lms:create-crm-enrolment') && e.crmStudentId && !e.crmEnrolmentId && (
                  <button type="button" className="btn" onClick={() => setDialog('create')}>
                    {t('learningEnrolmentDetail.createCrmEnrolmentButton')}
                  </button>
                )}
                {can('lms:sync') && e.crmEnrolmentId && (
                  <button type="button" className="btn" onClick={onSync}>{t('learningEnrolmentDetail.syncToCrmButton')}</button>
                )}
              </div>
            </div>

            {action.error && (
              <div className="state err" role="alert">
                <h3>{t('learningEnrolmentDetail.actionErrorTitle')}</h3>
                <p>{friendlyError(action.error)}</p>
              </div>
            )}

            {e.mappingStatus === 'Error' && (
              <div className="state err" role="alert">
                <h3>{t('learningEnrolmentDetail.mappingErrorTitle')}</h3>
                <p>{e.lastSyncMessage || t('learningEnrolmentDetail.mappingErrorFallback')}</p>
              </div>
            )}

            <div className="grid g-2">
              <Card
                title={t('learningEnrolmentDetail.recordCard.title')}
                action={<div className="head-actions"><SourceBadge source="lms" /><DemoDataBadge /></div>}
              >
                <dl className="dl">
                  <dt>{t('learningEnrolmentDetail.recordCard.provider')}</dt><dd>{e.provider}</dd>
                  <dt>{t('learningEnrolmentDetail.recordCard.externalEnrolmentId')}</dt><dd className="mono">{e.externalEnrolmentId}</dd>
                  <dt>{t('learningEnrolmentDetail.recordCard.externalLearnerId')}</dt>
                  <dd className="mono">{e.externalLearnerId || <span className="muted">—</span>}</dd>
                  <dt>{t('learningEnrolmentDetail.recordCard.course')}</dt>
                  <dd>
                    {d.course
                      ? <Link to={`/learning/courses/${d.course.id}`}>{d.course.name}</Link>
                      : <span className="muted">
                          {t('learningEnrolmentDetail.recordCard.noCourseMatch', {
                            reference: e.externalCourseId || t('learningEnrolmentDetail.recordCard.thisRecordFallback')
                          })}
                        </span>}
                  </dd>
                  <dt>{t('learningEnrolmentDetail.recordCard.status')}</dt><dd><Pill value={e.lmsStatus} /></dd>
                  <dt>{t('learningEnrolmentDetail.recordCard.progress')}</dt><dd><Progress value={e.progressPercentage} /></dd>
                  <dt>{t('learningEnrolmentDetail.recordCard.assessmentScore')}</dt>
                  <dd className="mono">
                    {e.assessmentScore === null ? <span className="muted">{t('common.notRecorded')}</span> : e.assessmentScore}
                  </dd>
                  <dt>{t('learningEnrolmentDetail.recordCard.started')}</dt><dd>{e.startedDate ? fmtDate(e.startedDate) : <span className="muted">—</span>}</dd>
                  <dt>{t('learningEnrolmentDetail.recordCard.lastActivity')}</dt>
                  <dd>{e.lastActivityTime ? fmtDate(e.lastActivityTime) : <span className="muted">—</span>}</dd>
                  <dt>{t('learningEnrolmentDetail.recordCard.completed')}</dt>
                  <dd>{e.completionDate ? fmtDate(e.completionDate) : <span className="muted">—</span>}</dd>
                  <dt>{t('learningEnrolmentDetail.recordCard.certificate')}</dt>
                  <dd>
                    <Pill value={e.certificateStatus} />
                    {e.certificateUrl && (
                      <> <a href={e.certificateUrl} target="_blank" rel="noreferrer noopener">{t('learningEnrolmentDetail.recordCard.viewLink')}</a></>
                    )}
                  </dd>
                </dl>
              </Card>

              <Card title={t('learningEnrolmentDetail.crmCard.title')} action={<SourceBadge source="crm" />}>
                <dl className="dl">
                  <dt>{t('learningEnrolmentDetail.crmCard.mapping')}</dt><dd><Pill value={e.mappingStatus} /></dd>
                  <dt>{t('learningEnrolmentDetail.crmCard.crmStudent')}</dt>
                  <dd>
                    {d.crmStudent
                      ? <Link to={`/students/${d.crmStudent.id}`}>{d.crmStudent.fullName || d.crmStudent.email}</Link>
                      : <span className="muted">{t('learningEnrolmentDetail.crmCard.notMapped')}</span>}
                  </dd>
                  <dt>{t('learningEnrolmentDetail.crmCard.studentReference')}</dt>
                  <dd className="mono">{e.crmStudentReference || <span className="muted">—</span>}</dd>
                  <dt>{t('learningEnrolmentDetail.crmCard.crmEnrolment')}</dt>
                  <dd>
                    {d.crmEnrolment
                      ? <Link to={`/enrolments/${d.crmEnrolment.id}`}>
                          {d.crmEnrolment.reference || d.crmEnrolment.externalReference || d.crmEnrolment.id}
                        </Link>
                      : <span className="muted">{t('learningEnrolmentDetail.crmCard.notLinked')}</span>}
                  </dd>
                  <dt>{t('learningEnrolmentDetail.crmCard.syncStatus')}</dt><dd><Pill value={e.syncStatus} /></dd>
                  <dt>{t('learningEnrolmentDetail.crmCard.lastSync')}</dt>
                  <dd>{e.lastSyncTime ? fmtDate(e.lastSyncTime) : <span className="muted">{t('learningEnrolmentDetail.crmCard.never')}</span>}</dd>
                  <dt>{t('learningEnrolmentDetail.crmCard.lastMessage')}</dt><dd>{e.lastSyncMessage || <span className="muted">—</span>}</dd>
                </dl>
                <p className="note">
                  {t('learningEnrolmentDetail.crmCard.writesNote', { fields: (d.crmFieldsWritten || []).join(', ') })}
                </p>
              </Card>
            </div>

            {d.fieldsHeldInCatalyst && d.fieldsHeldInCatalyst.length > 0 && (
              <Card title={t('learningEnrolmentDetail.catalystCard.title')} action={<SourceBadge source="catalyst" />}>
                <p className="muted">
                  {t('learningEnrolmentDetail.catalystCard.note')}
                </p>
                <div className="t-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{t('learningEnrolmentDetail.catalystCard.table.module')}</th>
                        <th scope="col">{t('learningEnrolmentDetail.catalystCard.table.suggestedField')}</th>
                        <th scope="col">{t('learningEnrolmentDetail.catalystCard.table.type')}</th>
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

            <Card title={t('learningEnrolmentDetail.syncHistoryCard.title')}>
              <SyncLogTable rows={d.syncLog} emptyText={t('learningEnrolmentDetail.syncHistoryCard.empty')} />
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
