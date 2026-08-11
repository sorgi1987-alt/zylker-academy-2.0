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
 * Chooses the CRM Programme a course maps to, or clears the mapping.
 *
 * The programmes are read from CRM rather than typed as an id, because a
 * mapping that points at nothing looks correct everywhere downstream while
 * being wrong — the server re-reads the programme for the same reason.
 */
function MapDialog({ course, onClose, onDone }) {
  const t = useT();
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
    if (r) toast(programmeId ? t('learningCourseDetail.mapDialog.toastMapped') : t('learningCourseDetail.mapDialog.toastCleared'));
  };

  return (
    <Modal title={t('learningCourseDetail.mapDialog.title')} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field
          id="programmeId"
          label={t('learningCourseDetail.mapDialog.programmeLabel')}
          hint={t('learningCourseDetail.mapDialog.programmeHint')}
        >
          <select value={programmeId} onChange={(e) => setProgrammeId(e.target.value)}>
            <option value="">{t('learningCourseDetail.mapDialog.notMappedOption')}</option>
            {loaded.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>
            ))}
          </select>
        </Field>
        {truncated && (
          <p className="note">
            {t('learningCourseDetail.mapDialog.truncatedNote', { loaded: loaded.length, total: programmes.meta.total })}
          </p>
        )}
        {programmes.status === 'error' && (
          <p className="field-error" role="alert">
            {t('learningCourseDetail.mapDialog.listError')}
          </p>
        )}
        <FormError error={action.error ? friendlyError(action.error) : null} />
        <FormActions
          busy={action.busy}
          submitLabel={t('learningCourseDetail.mapDialog.saveButton')}
          onCancel={onClose}
          disabled={programmes.status === 'loading'}
        />
      </form>
    </Modal>
  );
}

export default function LearningCourseDetail() {
  const t = useT();
  const { id } = useParams();
  const can = useCan();
  const toast = useToast();
  const state = useApi((o) => api.lmsCourse(id, o), [id]);
  const [mapping, setMapping] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const action = useAction(async () => { await state.reload(); });

  return (
    <Async state={state} empty={{ title: t('learningCourseDetail.notFoundTitle') }} emptyWhen={(d) => !d || !d.course}>
      {(d) => {
        const c = d.course;

        const onSync = () => setConfirm({
          title: t('learningCourseDetail.syncConfirm.title'),
          message: t('learningCourseDetail.syncConfirm.message'),
          confirmLabel: t('learningCourseDetail.syncConfirm.confirmLabel'),
          danger: false,
          run: async () => {
            const r = await action.run(() => api.syncLmsCourse(c.id, { idempotencyKey: newIdempotencyKey() }));
            if (r) {
              toast(t('learningCourseDetail.toastSynced', { fields: (r.data.crmFieldsWritten || []).join(', ') }));
              setConfirm(null);
            }
          }
        });

        const onArchive = () => setConfirm({
          title: t('learningCourseDetail.archiveConfirm.title'),
          message: t('learningCourseDetail.archiveConfirm.message'),
          confirmLabel: t('learningCourseDetail.archiveConfirm.confirmLabel'),
          run: async () => {
            const r = await action.run(() => api.archiveLmsCourse(c.id));
            if (r) { toast(t('learningCourseDetail.toastArchived')); setConfirm(null); }
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
                {c.archived && <span className="pill mute">{t('learningCourseDetail.archived')}</span>}
              </p>
              <div className="head-actions">
                <Link className="btn" to="/learning/courses">{t('learningCourseDetail.allCoursesLink')}</Link>
                {can('lms:map') && (
                  <button type="button" className="btn" onClick={() => setMapping(true)}>
                    {c.crmProgrammeId ? t('learningCourseDetail.changeMappingButton') : t('learningCourseDetail.mapToProgrammeButton')}
                  </button>
                )}
                {can('lms:sync') && c.mappingStatus === 'Mapped' && (
                  <button type="button" className="btn" onClick={onSync}>{t('learningCourseDetail.syncToCrmButton')}</button>
                )}
                {can('lms:write') && !c.archived && (
                  <button type="button" className="btn" onClick={onArchive}>{t('learningCourseDetail.archiveButton')}</button>
                )}
              </div>
            </div>

            {action.error && (
              <div className="state err" role="alert">
                <h3>{t('learningCourseDetail.actionErrorTitle')}</h3>
                <p>{friendlyError(action.error)}</p>
              </div>
            )}

            <div className="grid g-2">
              <Card
                title={t('learningCourseDetail.courseCard.title')}
                action={<div className="head-actions"><SourceBadge source="lms" /><DemoDataBadge /></div>}
              >
                <dl className="dl">
                  <dt>{t('learningCourseDetail.courseCard.provider')}</dt><dd>{c.provider}</dd>
                  <dt>{t('learningCourseDetail.courseCard.externalCourseId')}</dt><dd className="mono">{c.externalCourseId}</dd>
                  <dt>{t('learningCourseDetail.courseCard.deliveryType')}</dt><dd>{c.deliveryType || <span className="muted">—</span>}</dd>
                  <dt>{t('learningCourseDetail.courseCard.instructor')}</dt><dd>{c.instructor || <span className="muted">—</span>}</dd>
                  <dt>{t('learningCourseDetail.courseCard.duration')}</dt>
                  <dd className="mono">
                    {c.durationHours === null
                      ? <span className="muted">{t('common.notRecorded')}</span>
                      : t('learningCourseDetail.courseCard.durationHours', { hours: c.durationHours })}
                  </dd>
                  <dt>{t('learningCourseDetail.courseCard.level')}</dt><dd>{c.level || <span className="muted">—</span>}</dd>
                  <dt>{t('learningCourseDetail.courseCard.category')}</dt><dd>{c.category || <span className="muted">—</span>}</dd>
                  <dt>{t('learningCourseDetail.courseCard.language')}</dt><dd>{c.language || <span className="muted">—</span>}</dd>
                  <dt>{t('learningCourseDetail.courseCard.publication')}</dt><dd><Pill value={c.publicationStatus} /></dd>
                  <dt>{t('learningCourseDetail.courseCard.courseUrl')}</dt>
                  <dd>
                    {c.url
                      ? <a href={c.url} target="_blank" rel="noreferrer noopener">{c.url}</a>
                      : <span className="muted">—</span>}
                  </dd>
                </dl>
                {c.description && <p className="muted" style={{ marginBottom: 0 }}>{c.description}</p>}
              </Card>

              <Card
                title={t('learningCourseDetail.crmCard.title')}
                action={<div className="head-actions"><SourceBadge source="crm" /></div>}
              >
                <dl className="dl">
                  <dt>{t('learningCourseDetail.crmCard.mapping')}</dt><dd><Pill value={c.mappingStatus} /></dd>
                  <dt>{t('learningCourseDetail.crmCard.crmProgramme')}</dt>
                  <dd>
                    {d.crmProgramme
                      ? <Link to={`/programmes/${d.crmProgramme.id}`}>{d.crmProgramme.name}</Link>
                      : <span className="muted">{t('learningCourseDetail.crmCard.notMapped')}</span>}
                  </dd>
                  <dt>{t('learningCourseDetail.crmCard.programmeReference')}</dt>
                  <dd className="mono">{c.crmProgrammeReference || <span className="muted">—</span>}</dd>
                  <dt>{t('learningCourseDetail.crmCard.syncStatus')}</dt><dd><Pill value={c.syncStatus} /></dd>
                  <dt>{t('learningCourseDetail.crmCard.lastSync')}</dt>
                  <dd>{c.lastSyncTime ? fmtDate(c.lastSyncTime) : <span className="muted">{t('learningCourseDetail.crmCard.never')}</span>}</dd>
                  <dt>{t('learningCourseDetail.crmCard.lastMessage')}</dt>
                  <dd>{c.lastSyncMessage || <span className="muted">—</span>}</dd>
                </dl>
                <p className="note">
                  {t('learningCourseDetail.crmCard.writesNote', { fields: (d.crmFieldsWritten || []).join(', ') })}
                </p>
              </Card>
            </div>

            <Card
              title={t('learningCourseDetail.learnersCard.title')}
              action={<div className="head-actions"><SourceBadge source="lms" /><DemoDataBadge /></div>}
            >
              {d.enrolments.length ? (
                <div className="t-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{t('learningCourseDetail.learnersCard.table.externalEnrolment')}</th>
                        <th scope="col">{t('learningCourseDetail.learnersCard.table.learnerId')}</th>
                        <th scope="col">{t('learningCourseDetail.learnersCard.table.crmStudent')}</th>
                        <th scope="col">{t('learningCourseDetail.learnersCard.table.status')}</th>
                        <th scope="col">{t('learningCourseDetail.learnersCard.table.progress')}</th>
                        <th scope="col">{t('learningCourseDetail.learnersCard.table.certificate')}</th>
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
                              : <span className="muted">{t('learningCourseDetail.learnersCard.notMapped')}</span>}
                          </td>
                          <td><Pill value={e.lmsStatus} /></td>
                          <td><Progress value={e.progressPercentage} /></td>
                          <td><Pill value={e.certificateStatus} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="muted">{t('learningCourseDetail.learnersCard.empty')}</p>}
            </Card>

            <Card title={t('learningCourseDetail.syncHistoryCard.title')}>
              <SyncLogTable rows={d.syncLog} emptyText={t('learningCourseDetail.syncHistoryCard.empty')} />
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
