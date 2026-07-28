import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi, useAction } from '../useApi.js';
import { api } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import {
  Async, Card, Pill, SourceBadge, ReadOnlyBadge, RefBadge, ConfirmDialog,
  SectionUnavailable, useToast, fmtDate, fmtMoney
} from '../components/Ui.jsx';
import { friendlyError } from '../components/Form.jsx';
import ActivityLog from '../components/ActivityLog.jsx';

/**
 * Student 360.
 *
 * The page is assembled from three systems. The CRM half is the page's spine
 * and always renders; the Learn and Books sections each report their own state,
 * so an outage in either degrades one card rather than the whole record. The
 * backend guarantees this by resolving each integration independently and never
 * rejecting the response because one of them failed.
 */

/* --------------------------- Zoho Books section --------------------------- */

/**
 * Invoices for this student.
 *
 * The heading states HOW the student was linked to a Books customer, because a
 * financial record shown against the wrong person is a serious error and the
 * reader deserves to know whether the link is an identifier or an email guess.
 * An ambiguous email match shows nothing and says why — an unresolved link is
 * recoverable, showing someone else's invoices is not.
 */
function InvoiceSection({ invoices }) {
  if (!invoices) return null;

  if (invoices.status === 'not_configured') {
    return (
      <Card title="Invoices" action={<SourceBadge source="books" />}>
        <p className="muted">{invoices.detail}</p>
      </Card>
    );
  }

  if (invoices.status === 'unavailable') {
    return (
      <Card title="Invoices" action={<SourceBadge source="books" />}>
        <SectionUnavailable system="Zoho Books" detail={invoices.detail} />
      </Card>
    );
  }

  if (invoices.status === 'ambiguous') {
    return (
      <Card title="Invoices" action={<SourceBadge source="books" />}>
        <div className="state" role="status">
          <h3>The Zoho Books link is ambiguous</h3>
          <p>{invoices.detail}</p>
          {invoices.match?.candidates?.length > 0 && (
            <ul className="plain-list">
              {invoices.match.candidates.map((c) => (
                <li key={c.id}>
                  <strong>{c.name}</strong> <span className="muted">· {c.email} · id {c.id}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="note">
            No invoices are shown until one customer is linked, so that this student is
            never shown another customer&rsquo;s finances.
          </p>
        </div>
      </Card>
    );
  }

  if (invoices.status === 'unmatched') {
    return (
      <Card title="Invoices" action={<SourceBadge source="books" />}>
        <p className="muted">{invoices.detail || 'No Zoho Books customer is linked to this student.'}</p>
      </Card>
    );
  }

  const matchedOnLabel = invoices.match?.matchedOn === 'crm-field'
    ? `stored Books customer id (${invoices.match.field})`
    : 'exact email match';

  return (
    <Card
      title="Invoices"
      action={<div className="head-actions"><SourceBadge source="books" /><ReadOnlyBadge system="Zoho Books" /></div>}
    >
      <p className="note">
        Linked to Zoho Books customer <span className="mono">{invoices.match.customerId}</span> by {matchedOnLabel}.
      </p>

      <dl className="dl">
        <dt>Outstanding balance</dt>
        <dd className="mono">{fmtMoney(invoices.outstandingBalance, invoices.currency, { cents: true })}</dd>
      </dl>

      {invoices.invoices.length ? (
        <div className="t-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Invoice</th>
                <th scope="col">Date</th>
                <th scope="col">Due</th>
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
                  <td>{fmtDate(inv.dueDate)}</td>
                  <td><Pill value={inv.paymentStatus} /></td>
                  <td className="mono">{fmtMoney(inv.total, inv.currency, { cents: true })}</td>
                  <td className="mono">{fmtMoney(inv.balance, inv.currency, { cents: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">This customer has no invoices.</p>}

      {invoices.hasMore && (
        <p className="note">
          Only the most recent invoices are shown here.{' '}
          <Link to={`/invoices?customerId=${invoices.match.customerId}`}>See all in Finance</Link>.
        </p>
      )}
    </Card>
  );
}

/* -------------------------------- the page -------------------------------- */

export default function Student360() {
  const { id } = useParams();
  const navigate = useNavigate();
  const can = useCan();
  const toast = useToast();
  const state = useApi((o) => api.student(id, o), [id]);
  const [confirm, setConfirm] = useState(null);

  const action = useAction(async () => { await state.reload(); });

  const onArchive = (student) => setConfirm({
    title: 'Archive this student?',
    message: 'The student will be marked as Withdrawn in Zoho CRM. Their applications and enrolments are kept.',
    confirmLabel: 'Archive student',
    run: async () => {
      const r = await action.run(() => api.archiveStudent(id, { expectedModifiedTime: student.modifiedTime }));
      if (r) { toast('Student archived.'); setConfirm(null); }
    }
  });

  const onDelete = () => setConfirm({
    title: 'Delete this student permanently?',
    message: 'This cannot be undone. Deletion is refused if any application or enrolment still points at this student.',
    confirmLabel: 'Delete permanently',
    run: async () => {
      const r = await action.run(() => api.deleteStudent(id));
      if (r) { toast('Student deleted.'); navigate('/students', { replace: true }); }
    }
  });

  return (
    <Async state={state} empty={{ title: 'Student not found' }} emptyWhen={(d) => !d || !d.student}>
      {(d) => {
        const s = d.student;
        return (
          <>
            <div className="page-head">
              <h1>{s.fullName || 'Unnamed student'}</h1>
              <p>
                <Pill value={s.status} />{' '}
                <RefBadge reference={s.studentId || s.externalReference} />
              </p>
              <div className="head-actions">
                {can('student:write') && (
                  <>
                    <Link className="btn" to={`/students/${id}/edit`}>Edit</Link>
                    {s.status !== 'Withdrawn' && (
                      <button type="button" className="btn" onClick={() => onArchive(s)}>Archive</button>
                    )}
                  </>
                )}
                {can('student:delete') && (
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
              <Card title="Personal details" action={<SourceBadge source="crm" />}>
                <dl className="dl">
                  <dt>Full name</dt><dd>{s.fullName || '—'}</dd>
                  <dt>Email</dt><dd>{s.email || '—'}</dd>
                  <dt>Student ID</dt><dd className="mono">{s.studentId || '—'}</dd>
                  <dt>Status</dt><dd><Pill value={s.status} /></dd>
                  <dt>External reference</dt><dd className="mono">{s.externalReference || '—'}</dd>
                  <dt>Added</dt><dd>{fmtDate(s.createdTime)}</dd>
                  <dt>Last modified</dt><dd>{fmtDate(s.modifiedTime)}</dd>
                </dl>
              </Card>

              <Card
                title="Learner platform"
                action={<div className="head-actions"><SourceBadge source="learn" /><ReadOnlyBadge system="Zoho Learn" /></div>}
              >
                <dl className="dl">
                  <dt>Provider</dt><dd>{s.lms.provider || '—'}</dd>
                  <dt>Learn user id</dt><dd className="mono">{s.lms.userId || <span className="muted">Not linked</span>}</dd>
                  <dt>Last sync</dt><dd>{s.lms.lastSync ? fmtDate(s.lms.lastSync) : '—'}</dd>
                </dl>
                <p className="note">
                  These fields are maintained manually in CRM. This application does not
                  create learners or enrol them in Zoho Learn.
                </p>
              </Card>
            </div>

            <Card title="Applications" action={<SourceBadge source="crm" />}>
              {d.applications.length ? (
                <div className="t-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Application</th>
                        <th scope="col">Stage</th>
                        <th scope="col">Programme</th>
                        <th scope="col">Intake</th>
                        <th scope="col">Applied</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.applications.map((a) => (
                        <tr key={a.id}>
                          <td><Link to={`/applications/${a.id}`}>{a.name || a.applicationId}</Link></td>
                          <td><Pill value={a.stage} /></td>
                          <td>{a.programme ? a.programme.name : <span className="muted">—</span>}</td>
                          <td>{a.intake ? a.intake.name : <span className="muted">—</span>}</td>
                          <td>{fmtDate(a.applicationDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="muted">This student has no applications.</p>}
            </Card>

            <Card title="Enrolments" action={<SourceBadge source="crm" />}>
              {d.enrolments.length ? (
                <div className="t-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Enrolment</th>
                        <th scope="col">Status</th>
                        <th scope="col">Programme</th>
                        <th scope="col">Intake</th>
                        <th scope="col">Enrolled</th>
                        <th scope="col">Progress</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.enrolments.map((e) => (
                        <tr key={e.id}>
                          <td><Link to={`/enrolments/${e.id}`}>{e.reference || e.externalReference || e.id}</Link></td>
                          <td><Pill value={e.status} /></td>
                          <td>{e.programme ? e.programme.name : <span className="muted">—</span>}</td>
                          <td>{e.intake ? e.intake.name : <span className="muted">—</span>}</td>
                          <td>{fmtDate(e.enrolmentDate)}</td>
                          <td className="mono">
                            {e.lms.progressPercentage === null ? '—' : `${e.lms.progressPercentage}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="muted">This student has no enrolments.</p>}
            </Card>

            <Card
              title="Programmes and course mapping"
              action={<div className="head-actions"><SourceBadge source="crm" /><SourceBadge source="learn" /></div>}
            >
              {d.programmes.length ? (
                <ul className="plain-list">
                  {d.programmes.map((p) => (
                    <li key={p.id}>
                      <Link to={`/programmes/${p.id}`}>{p.name}</Link>
                      {p.learnCourse ? (
                        <>
                          {' · '}
                          <a href={p.learnCourse.url} target="_blank" rel="noreferrer noopener">
                            {p.learnCourse.name} in Zoho Learn
                          </a>
                          {p.learnMatch.inferred && (
                            <span className="pill warn" title="Matched on course name because no identifier was stored">
                              Inferred match
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="muted"> · no Zoho Learn course mapped</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : <p className="muted">No programmes are linked to this student.</p>}

              {d.learn.status !== 'connected' && (
                <p className="note">
                  Zoho Learn is unavailable ({d.learn.label}), so course details could not be
                  loaded. Programme information above is from CRM and is unaffected.
                </p>
              )}
            </Card>

            <InvoiceSection invoices={d.invoices} />

            <Card title="Recent activity">
              <ActivityLog rows={d.activity} />
            </Card>

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
