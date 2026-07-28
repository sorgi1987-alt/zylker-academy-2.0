import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi, useAction } from '../useApi.js';
import { api } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import {
  Async, Card, Pill, SourceBadge, ReadOnlyBadge, ConfirmDialog, Modal, useToast, fmtDate, fmtMoney
} from '../components/Ui.jsx';
import { Field, FormActions, FormError, friendlyError, DATE_MIN, DATE_MAX } from '../components/Form.jsx';
import ActivityLog from '../components/ActivityLog.jsx';

function EditDialog({ enrolment, onClose, onDone }) {
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
    if (r) toast('Enrolment updated.');
  };

  return (
    <Modal title="Edit enrolment" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field id="financeStatus" label="Finance status">
            <input value={form.financeStatus} onChange={set('financeStatus')} />
          </Field>
          <Field id="startDate" label="Start date">
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.startDate} onChange={set('startDate')} />
          </Field>
          <Field id="completionDate" label="Completion date">
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.completionDate} onChange={set('completionDate')} />
          </Field>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={form.certificateIssued} onChange={set('certificateIssued')} />
          Certificate issued
        </label>
        <p className="note">
          Progress percentage and Zoho Learn identifiers are maintained in CRM and are
          not editable here, because this application never writes to Zoho Learn.
        </p>
        <FormError error={action.error ? friendlyError(action.error) : null} />
        <FormActions busy={action.busy} submitLabel="Save changes" onCancel={onClose} />
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
  if (!invoices) return null;   // caller lacks invoice:read, or Books is off

  const header = (
    <div className="head-actions">
      <SourceBadge source="books" />
      <ReadOnlyBadge system="Zoho Books" />
    </div>
  );

  if (invoices.status === 'not_configured' || invoices.status === 'unavailable') {
    return (
      <Card title="Finance" action={header}>
        <p className="muted">{invoices.detail || 'Zoho Books could not be reached.'}</p>
      </Card>
    );
  }

  if (invoices.status === 'ambiguous') {
    return (
      <Card title="Finance" action={header}>
        <p className="muted">{invoices.detail}</p>
        <p className="note">
          No invoices are shown while the Zoho Books link is ambiguous, so this student is
          never shown another customer&rsquo;s finances.
        </p>
      </Card>
    );
  }

  if (invoices.status === 'unmatched') {
    return (
      <Card title="Finance" action={header}>
        <p className="muted">{invoices.detail || 'No Zoho Books customer is linked to this student.'}</p>
      </Card>
    );
  }

  const paid = invoices.invoices.filter((i) => i.balance === 0 && i.total > 0);
  const outstanding = invoices.invoices.filter((i) => i.outstanding);

  // The CRM field claims no invoice exists, but Books has one. Worth saying out
  // loud — it is the most likely reason someone is looking at this card.
  const contradicted = invoices.invoices.length > 0
    && /not invoiced/i.test(String(financeStatus || ''));

  return (
    <Card title="Finance" action={header}>
      {contradicted && (
        <div className="state" role="status">
          <h3>CRM and Zoho Books disagree</h3>
          <p>
            The enrolment&rsquo;s finance status in CRM reads &ldquo;{financeStatus}&rdquo;, but
            Zoho Books holds {invoices.invoices.length} invoice
            {invoices.invoices.length === 1 ? '' : 's'} for this student
            {paid.length ? `, ${paid.length} of them paid` : ''}. That CRM field is
            maintained by hand and nothing updates it from Books — edit the enrolment to
            bring it into line.
          </p>
        </div>
      )}

      <dl className="dl">
        <dt>Outstanding balance</dt>
        <dd className="mono">{fmtMoney(invoices.outstandingBalance, invoices.currency, { cents: true })}</dd>
        <dt>Invoices</dt>
        <dd className="mono">
          {invoices.invoices.length}
          {outstanding.length ? ` (${outstanding.length} outstanding)` : ''}
        </dd>
      </dl>

      {invoices.invoices.length ? (
        <div className="t-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Invoice</th>
                <th scope="col">Date</th>
                <th scope="col">Status</th>
                <th scope="col">Total</th>
                <th scope="col">Balance</th>
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
      ) : <p className="muted">This customer has no invoices in Zoho Books.</p>}

      <p className="note">
        Invoices in Zoho Books belong to a customer, not to an individual enrolment,
        so these are all invoices for this student.
      </p>
    </Card>
  );
}

export default function EnrolmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const can = useCan();
  const toast = useToast();
  const state = useApi((o) => api.enrolment(id, o), [id]);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const action = useAction(async () => { await state.reload(); });

  return (
    <Async state={state} empty={{ title: 'Enrolment not found' }} emptyWhen={(d) => !d || !d.enrolment}>
      {(d) => {
        const e = d.enrolment;

        const onComplete = () => setConfirm({
          title: 'Mark this enrolment complete?',
          message: 'The status becomes Completed and a completion date is recorded. If this is the student’s only active enrolment, they become an alumnus.',
          confirmLabel: 'Complete enrolment',
          danger: false,
          run: async () => {
            const r = await action.run(() => api.completeEnrolment(id, { expectedModifiedTime: e.modifiedTime }));
            if (r) { toast('Enrolment completed.'); setConfirm(null); }
          }
        });

        const onCancel = () => setConfirm({
          title: 'Cancel this enrolment?',
          message: 'The status becomes Cancelled in Zoho CRM. The record is kept and its place is released.',
          confirmLabel: 'Cancel enrolment',
          run: async () => {
            const r = await action.run(() => api.archiveEnrolment(id, { expectedModifiedTime: e.modifiedTime }));
            if (r) { toast('Enrolment cancelled.'); setConfirm(null); }
          }
        });

        const onDelete = () => setConfirm({
          title: 'Delete this enrolment permanently?',
          message: 'This cannot be undone. Consider cancelling instead, which keeps the record.',
          confirmLabel: 'Delete permanently',
          run: async () => {
            const r = await action.run(() => api.deleteEnrolment(id));
            if (r) { toast('Enrolment deleted.'); navigate('/enrolments', { replace: true }); }
          }
        });

        return (
          <>
            <div className="page-head">
              <h1>{e.reference || e.externalReference || 'Enrolment'}</h1>
              <p><Pill value={e.status} /></p>
              <div className="head-actions">
                {can('enrolment:write') && (
                  <>
                    <button type="button" className="btn" onClick={() => setEditing(true)}>Edit</button>
                    {e.status === 'Active' && (
                      <>
                        <button type="button" className="btn" onClick={onComplete}>Complete</button>
                        <button type="button" className="btn" onClick={onCancel}>Cancel enrolment</button>
                      </>
                    )}
                  </>
                )}
                {can('enrolment:delete') && (
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
              <Card title="Enrolment details" action={<SourceBadge source="crm" />}>
                <dl className="dl">
                  <dt>Reference</dt><dd className="mono">{e.externalReference || '—'}</dd>
                  <dt>Status</dt><dd><Pill value={e.status} /></dd>
                  <dt>Enrolled</dt><dd>{fmtDate(e.enrolmentDate)}</dd>
                  <dt>Start date</dt><dd>{fmtDate(e.startDate)}</dd>
                  <dt>Completion date</dt><dd>{fmtDate(e.completionDate)}</dd>
                  <dt>Finance status</dt>
                  <dd>
                    {e.financeStatus || '—'}
                    <span className="field-hint"> Set by hand in CRM — not from Zoho Books.</span>
                  </dd>
                  <dt>Certificate issued</dt><dd>{e.certificateIssued ? 'Yes' : 'No'}</dd>
                  <dt>Last modified</dt><dd>{fmtDate(e.modifiedTime)}</dd>
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
                  <dt>Application</dt>
                  <dd>
                    {d.application
                      ? <Link to={`/applications/${d.application.id}`}>{d.application.name || d.application.applicationId}</Link>
                      : <span className="muted">Not linked</span>}
                  </dd>
                </dl>
              </Card>
            </div>

            <Card
              title="Zoho Learn"
              action={<div className="head-actions"><SourceBadge source="learn" /><ReadOnlyBadge system="Zoho Learn" /></div>}
            >
              <dl className="dl">
                <dt>Course</dt>
                <dd>
                  {d.learnCourse
                    ? <a href={d.learnCourse.url} target="_blank" rel="noreferrer noopener">{d.learnCourse.name}</a>
                    : <span className="muted">
                        {d.learn.status === 'connected' ? 'No course mapped' : `Unavailable (${d.learn.label})`}
                      </span>}
                  {d.learnMatch.inferred && <span className="pill warn">Inferred match</span>}
                </dd>
                <dt>Learn enrolment id</dt><dd className="mono">{e.lms.enrolmentId || '—'}</dd>
                <dt>Progress</dt>
                <dd className="mono">{e.lms.progressPercentage === null ? '—' : `${e.lms.progressPercentage}%`}</dd>
                <dt>Sync status</dt><dd><Pill value={e.lms.syncStatus} /></dd>
                <dt>Last sync</dt><dd>{e.lms.lastSync ? fmtDate(e.lms.lastSync) : '—'}</dd>
              </dl>
              <p className="note">
                These values are maintained manually in CRM. This application does not create
                learners, enrol them, or write progress back to Zoho Learn.
              </p>
            </Card>

            <InvoiceCard invoices={d.invoices} financeStatus={e.financeStatus} />

            <Card title="Activity">
              <ActivityLog rows={d.activity} />
            </Card>

            {editing && (
              <EditDialog enrolment={e} onClose={() => setEditing(false)} onDone={async () => { await state.reload(); }} />
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
