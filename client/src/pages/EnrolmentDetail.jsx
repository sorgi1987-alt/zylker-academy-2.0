import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi, useAction } from '../useApi.js';
import { api } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import { useT } from '../i18n/I18nContext.jsx';
import {
  Async, Card, Pill, Progress, SourceBadge, ReadOnlyBadge, DemoDataBadge, ConfirmDialog,
  Modal, useToast, fmtDate, fmtMoney
} from '../components/Ui.jsx';
import { Field, FormActions, FormError, friendlyError, DATE_MIN, DATE_MAX } from '../components/Form.jsx';
import ActivityLog from '../components/ActivityLog.jsx';
import { Warnings, NoteDialog } from '../components/Record.jsx';
import { useBreadcrumbLeaf } from '../components/Shell.jsx';

function EditDialog({ enrolment, onClose, onDone }) {
  const t = useT();
  const toast = useToast();
  const [form, setForm] = useState({
    financeStatus: enrolment.financeStatus || '',
    startDate: enrolment.startDate || '',
    completionDate: enrolment.completionDate || '',
    certificateIssued: enrolment.certificateIssued
  });
  const set = (k) => (e) => setForm((f) => ({
    ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value
  }));
  const action = useAction(async () => { await onDone(); onClose(); });

  const submit = async (e) => {
    e.preventDefault();
    const r = await action.run(() => api.updateEnrolment(enrolment.id, {
      ...form, expectedModifiedTime: enrolment.modifiedTime
    }));
    if (r) toast(t('enrolmentDetail.editDialog.updated'));
  };

  return (
    <Modal title={t('enrolmentDetail.editDialog.title')} onClose={onClose} busy={action.busy}>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field id="financeStatus" label={t('enrolmentDetail.editDialog.financeStatus')}>
            <input value={form.financeStatus} onChange={set('financeStatus')} />
          </Field>
          <Field id="startDate" label={t('enrolmentDetail.editDialog.startDate')}>
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.startDate} onChange={set('startDate')} />
          </Field>
          <Field id="completionDate" label={t('enrolmentDetail.editDialog.completionDate')}>
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.completionDate} onChange={set('completionDate')} />
          </Field>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={form.certificateIssued} onChange={set('certificateIssued')} />
          {t('enrolmentDetail.editDialog.certificateIssued')}
        </label>
        <p className="note">
          {t('enrolmentDetail.editDialog.note')}
        </p>
        <FormError error={action.error ? friendlyError(action.error) : null} />
        <FormActions busy={action.busy} submitLabel={t('enrolmentDetail.editDialog.saveChanges')} onCancel={onClose} />
      </form>
    </Modal>
  );
}

/**
 * Live finance position for the enrolled student, from Zoho Books.
 *
 * This sits next to the enrolment's `Finance status`, which is a CRM picklist
 * somebody sets by hand and which nothing syncs. The two drift, and the honest
 * thing is to show both and say when they disagree rather than pick one and
 * hope. Invoices belong to a Books CUSTOMER, not to an enrolment, so this is
 * everything owed by the student — it is labelled as such rather than implying
 * a per-enrolment total that Books does not model.
 */
function InvoiceCard({ invoices, financeStatus }) {
  const t = useT();
  if (!invoices) return null;   // caller lacks invoice:read, or Books is off

  const header = (
    <div className="head-actions">
      <SourceBadge source="books" />
      <ReadOnlyBadge system="Zoho Books" />
    </div>
  );

  const financeTitle = t('enrolmentDetail.finance.cardTitle');

  if (invoices.status === 'not_configured' || invoices.status === 'unavailable') {
    return (
      <Card title={financeTitle} action={header}>
        <p className="muted">{invoices.detail || t('enrolmentDetail.finance.booksUnreachable')}</p>
      </Card>
    );
  }

  if (invoices.status === 'ambiguous') {
    return (
      <Card title={financeTitle} action={header}>
        <p className="muted">{invoices.detail}</p>
        <p className="note">
          {t('enrolmentDetail.finance.ambiguousNote')}
        </p>
      </Card>
    );
  }

  if (invoices.status === 'unmatched') {
    return (
      <Card title={financeTitle} action={header}>
        <p className="muted">{invoices.detail || t('enrolmentDetail.finance.noCustomerLinked')}</p>
      </Card>
    );
  }

  const paid = invoices.invoices.filter((i) => i.balance === 0 && i.total > 0);
  const outstanding = invoices.invoices.filter((i) => i.outstanding);

  // The CRM field claims no invoice exists, but Books has one. Worth saying out
  // loud — it is the most likely reason someone is looking at this card.
  const contradicted = invoices.invoices.length > 0
    && /not invoiced/i.test(String(financeStatus || ''));

  const disagreeMessage = t(
    invoices.invoices.length === 1
      ? 'enrolmentDetail.finance.disagreeMessageOne'
      : 'enrolmentDetail.finance.disagreeMessageOther',
    {
      financeStatus,
      count: invoices.invoices.length,
      paidNote: paid.length ? t('enrolmentDetail.finance.paidNote', { count: paid.length }) : ''
    }
  );

  return (
    <Card title={financeTitle} action={header}>
      {contradicted && (
        <div className="state" role="status">
          <h3>{t('enrolmentDetail.finance.disagreeTitle')}</h3>
          <p>
            {disagreeMessage}
          </p>
        </div>
      )}

      <dl className="dl">
        <dt>{t('enrolmentDetail.finance.outstandingBalance')}</dt>
        <dd className="mono">{fmtMoney(invoices.outstandingBalance, invoices.currency, { cents: true })}</dd>
        <dt>{t('enrolmentDetail.finance.invoices')}</dt>
        <dd className="mono">
          {invoices.invoices.length}
          {outstanding.length ? ` ${t('enrolmentDetail.finance.outstandingCount', { count: outstanding.length })}` : ''}
        </dd>
      </dl>

      {invoices.invoices.length ? (
        <div className="t-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('enrolmentDetail.finance.table.invoice')}</th>
                <th scope="col">{t('enrolmentDetail.finance.table.date')}</th>
                <th scope="col">{t('enrolmentDetail.finance.table.status')}</th>
                <th scope="col">{t('enrolmentDetail.finance.table.total')}</th>
                <th scope="col">{t('enrolmentDetail.finance.table.balance')}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.invoices.map((inv) => (
                <tr key={inv.id}>
                  <td><Link to={`/invoices/${inv.id}`}>{inv.invoiceNumber || inv.id}</Link></td>
                  <td>{fmtDate(inv.invoiceDate)}</td>
                  <td><Pill value={inv.paymentStatus} /></td>
                  <td className="mono">{fmtMoney(inv.total, inv.currency, { cents: true })}</td>
                  <td className="mono">{fmtMoney(inv.balance, inv.currency, { cents: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">{t('enrolmentDetail.finance.noInvoices')}</p>}

      <p className="note">
        {t('enrolmentDetail.finance.note')}
      </p>
    </Card>
  );
}

export default function EnrolmentDetail() {
  const t = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const can = useCan();
  const toast = useToast();
  const state = useApi((o) => api.enrolment(id, o), [id]);
  const [editing, setEditing] = useState(false);
  const [noting, setNoting] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const action = useAction(async () => { await state.reload(); });

  const loaded = state.data && state.data.enrolment;
  useBreadcrumbLeaf(loaded ? (loaded.reference || loaded.externalReference || null) : null);

  return (
    <Async state={state} empty={{ title: t('enrolmentDetail.notFound') }} emptyWhen={(d) => !d || !d.enrolment}>
      {(d) => {
        const e = d.enrolment;

        const onComplete = () => setConfirm({
          title: t('enrolmentDetail.confirm.completeTitle'),
          message: t('enrolmentDetail.confirm.completeMessage'),
          confirmLabel: t('enrolmentDetail.confirm.completeConfirmLabel'),
          danger: false,
          run: async () => {
            const r = await action.run(() => api.completeEnrolment(id, { expectedModifiedTime: e.modifiedTime }));
            if (r) { toast(t('enrolmentDetail.confirm.completedToast')); setConfirm(null); }
          }
        });

        const onCancel = () => setConfirm({
          title: t('enrolmentDetail.confirm.cancelTitle'),
          message: t('enrolmentDetail.confirm.cancelMessage'),
          confirmLabel: t('enrolmentDetail.confirm.cancelConfirmLabel'),
          run: async () => {
            const r = await action.run(() => api.archiveEnrolment(id, { expectedModifiedTime: e.modifiedTime }));
            if (r) { toast(t('enrolmentDetail.confirm.cancelledToast')); setConfirm(null); }
          }
        });

        const onActivate = () => setConfirm({
          title: t('enrolmentDetail.confirm.reactivateTitle'),
          message: t('enrolmentDetail.confirm.reactivateMessage'),
          confirmLabel: t('enrolmentDetail.confirm.reactivateConfirmLabel'),
          danger: false,
          run: async () => {
            const r = await action.run(() => api.updateEnrolment(id, {
              enrolmentStatus: 'Active', expectedModifiedTime: e.modifiedTime
            }));
            if (r) { toast(t('enrolmentDetail.confirm.reactivatedToast')); setConfirm(null); }
          }
        });

        const onDelete = () => setConfirm({
          title: t('enrolmentDetail.confirm.deleteTitle'),
          message: t('enrolmentDetail.confirm.deleteMessage'),
          confirmLabel: t('enrolmentDetail.confirm.deleteConfirmLabel'),
          run: async () => {
            const r = await action.run(() => api.deleteEnrolment(id));
            if (r) { toast(t('enrolmentDetail.confirm.deletedToast')); navigate('/enrolments', { replace: true }); }
          }
        });

        return (
          <>
            <div className="page-head">
              <h1>{e.reference || e.externalReference || t('enrolmentDetail.fallbackTitle')}</h1>
              <p><Pill value={e.status} /></p>
              <div className="head-actions">
                {can('enrolment:write') && (
                  <>
                    <button type="button" className="btn" onClick={() => setEditing(true)}>{t('enrolmentDetail.edit')}</button>
                    {e.status === 'Active' && (
                      <>
                        <button type="button" className="btn" onClick={onComplete}>{t('enrolmentDetail.complete')}</button>
                        <button type="button" className="btn" onClick={onCancel}>{t('enrolmentDetail.cancelEnrolment')}</button>
                      </>
                    )}
                    {/* Reinstating a cancelled enrolment. Completed is not
                        reopened here: that would rewrite an outcome. */}
                    {e.status === 'Cancelled' && (
                      <button type="button" className="btn" onClick={onActivate}>{t('enrolmentDetail.reactivate')}</button>
                    )}
                  </>
                )}
                {can('activity:write') && (
                  <button type="button" className="btn" onClick={() => setNoting(true)}>{t('enrolmentDetail.addNote')}</button>
                )}
                {/* Only offered when a Books customer was actually resolved:
                    a link to an empty customer filter would show every
                    invoice in the org under this student's name. */}
                {can('invoice:read') && d.invoices && d.invoices.match && d.invoices.match.customerId && (
                  <Link
                    className="btn"
                    to={`/invoices?customerId=${encodeURIComponent(d.invoices.match.customerId)}`}
                  >
                    {t('enrolmentDetail.invoicesLink')}
                  </Link>
                )}
                {can('enrolment:delete') && (
                  <button type="button" className="btn danger" onClick={onDelete}>{t('enrolmentDetail.delete')}</button>
                )}
              </div>
            </div>

            {action.error && (
              <div className="state err" role="alert">
                <h3>{t('enrolmentDetail.actionFailedTitle')}</h3>
                <p>{friendlyError(action.error)}</p>
              </div>
            )}

            {/* Computed on the server from CRM, the LMS connector and Books
                together. Nothing here blocks an action. */}
            <Warnings items={d.warnings} />

            <div className="grid g-2">
              <Card title={t('enrolmentDetail.details.cardTitle')} action={<SourceBadge source="crm" />}>
                <dl className="dl">
                  <dt>{t('enrolmentDetail.details.reference')}</dt><dd className="mono">{e.externalReference || '—'}</dd>
                  <dt>{t('enrolmentDetail.details.status')}</dt><dd><Pill value={e.status} /></dd>
                  <dt>{t('enrolmentDetail.details.enrolled')}</dt><dd>{fmtDate(e.enrolmentDate)}</dd>
                  <dt>{t('enrolmentDetail.details.startDate')}</dt><dd>{fmtDate(e.startDate)}</dd>
                  <dt>{t('enrolmentDetail.details.completionDate')}</dt><dd>{fmtDate(e.completionDate)}</dd>
                  <dt>{t('enrolmentDetail.details.financeStatus')}</dt>
                  <dd>
                    {e.financeStatus || '—'}
                    <span className="field-hint"> {t('enrolmentDetail.details.financeStatusHint')}</span>
                  </dd>
                  <dt>{t('enrolmentDetail.details.certificateIssued')}</dt>
                  <dd>{e.certificateIssued ? t('enrolmentDetail.details.yes') : t('enrolmentDetail.details.no')}</dd>
                  <dt>{t('enrolmentDetail.details.lastModified')}</dt><dd>{fmtDate(e.modifiedTime)}</dd>
                </dl>
              </Card>

              <Card title={t('enrolmentDetail.related.cardTitle')} action={<SourceBadge source="crm" />}>
                <dl className="dl">
                  <dt>{t('enrolmentDetail.related.student')}</dt>
                  <dd>
                    {d.student
                      ? <Link to={`/students/${d.student.id}`}>{d.student.fullName || d.student.email}</Link>
                      : <span className="muted">{t('enrolmentDetail.related.notLinked')}</span>}
                  </dd>
                  <dt>{t('enrolmentDetail.related.programme')}</dt>
                  <dd>
                    {d.programme
                      ? <Link to={`/programmes/${d.programme.id}`}>{d.programme.name}</Link>
                      : <span className="muted">{t('enrolmentDetail.related.notLinked')}</span>}
                  </dd>
                  <dt>{t('enrolmentDetail.related.intake')}</dt>
                  <dd>
                    {d.intake
                      ? <Link to={`/intakes/${d.intake.id}`}>{d.intake.name}</Link>
                      : <span className="muted">{t('enrolmentDetail.related.notLinked')}</span>}
                  </dd>
                  <dt>{t('enrolmentDetail.related.application')}</dt>
                  <dd>
                    {d.application
                      ? <Link to={`/applications/${d.application.id}`}>{d.application.name || d.application.applicationId}</Link>
                      : <span className="muted">{t('enrolmentDetail.related.notLinked')}</span>}
                  </dd>
                </dl>
              </Card>
            </div>

            <Card
              title={t('enrolmentDetail.lms.cardTitle')}
              action={(
                <div className="head-actions">
                  <SourceBadge source="lms" />
                  <DemoDataBadge />
                  <Link className="btn" to="/learning/enrolments">{t('enrolmentDetail.lms.learningHub')}</Link>
                </div>
              )}
            >
              <dl className="dl">
                <dt>{t('enrolmentDetail.lms.mappedCourse')}</dt>
                <dd>
                  {d.lmsCourse
                    ? <Link to={`/learning/courses/${d.lmsCourse.id}`}>
                        {d.lmsCourse.name} <span className="muted">({d.lmsCourse.provider})</span>
                      </Link>
                    : <span className="muted">
                        {d.programme
                          ? t('enrolmentDetail.lms.noCourseMappedToProgramme')
                          : t('enrolmentDetail.lms.noCourseMappedGeneric')}
                      </span>}
                </dd>
              </dl>

              {d.learning.length ? (
                <div className="t-wrap" style={{ marginTop: 12 }}>
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{t('enrolmentDetail.lms.table.externalEnrolment')}</th>
                        <th scope="col">{t('enrolmentDetail.lms.table.course')}</th>
                        <th scope="col">{t('enrolmentDetail.lms.table.status')}</th>
                        <th scope="col">{t('enrolmentDetail.lms.table.progress')}</th>
                        <th scope="col">{t('enrolmentDetail.lms.table.certificate')}</th>
                        <th scope="col">{t('enrolmentDetail.lms.table.sync')}</th>
                        <th scope="col">{t('enrolmentDetail.lms.table.lastSync')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.learning.map((l) => (
                        <tr key={l.id}>
                          <td><Link to={`/learning/enrolments/${l.id}`}>{l.externalEnrolmentId}</Link></td>
                          <td>{l.course ? l.course.name : <span className="muted">—</span>}</td>
                          <td><Pill value={l.lmsStatus} /></td>
                          <td><Progress value={l.progressPercentage} /></td>
                          <td><Pill value={l.certificateStatus} /></td>
                          <td><Pill value={l.syncStatus} /></td>
                          <td>{l.lastSyncTime ? fmtDate(l.lastSyncTime) : <span className="muted">{t('enrolmentDetail.lms.never')}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">
                  {t('enrolmentDetail.lms.noRecordLinked')}
                </p>
              )}

              <h3 style={{ fontSize: 14, margin: '18px 0 8px' }}>{t('enrolmentDetail.lms.valuesHeldTitle')}</h3>
              <dl className="dl">
                <dt>{t('enrolmentDetail.lms.lmsEnrolmentId')}</dt>
                <dd className="mono">{e.lms.enrolmentId || <span className="muted">—</span>}</dd>
                <dt>{t('enrolmentDetail.lms.progress')}</dt>
                <dd className="mono">
                  {e.lms.progressPercentage === null ? <span className="muted">—</span> : `${e.lms.progressPercentage}%`}
                </dd>
                <dt>{t('enrolmentDetail.lms.syncStatus')}</dt><dd><Pill value={e.lms.syncStatus} /></dd>
                <dt>{t('enrolmentDetail.lms.lastSync')}</dt>
                <dd>{e.lms.lastSync ? fmtDate(e.lms.lastSync) : <span className="muted">—</span>}</dd>
              </dl>
              <p className="note">
                {t('enrolmentDetail.lms.note')}
              </p>
            </Card>

            <InvoiceCard invoices={d.invoices} financeStatus={e.financeStatus} />

            <Card title={t('enrolmentDetail.activityCardTitle')}>
              <ActivityLog rows={d.activity} />
            </Card>

            {editing && (
              <EditDialog enrolment={e} onClose={() => setEditing(false)} onDone={async () => { await state.reload(); }} />
            )}

            {noting && (
              <NoteDialog
                entityType="enrolment"
                recordId={e.id}
                onClose={() => setNoting(false)}
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
