import React, { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApi, useAction } from '../useApi.js';
import { api } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import {
  Async, Card, Pill, Progress, SourceBadge, ReadOnlyBadge, DemoDataBadge, RefBadge,
  ConfirmDialog, SectionUnavailable, useToast, fmtDate, fmtMoney
} from '../components/Ui.jsx';
import { friendlyError } from '../components/Form.jsx';
import ActivityLog from '../components/ActivityLog.jsx';
import { Tabs, TabPanel, NoteDialog } from '../components/Record.jsx';
import { useBreadcrumbLeaf } from '../components/Shell.jsx';

/**
 * Student 360 — the primary record workspace.
 *
 * The page is assembled from three systems. The CRM half is the page's spine
 * and always renders; the Learning and Finance sections each report their own
 * state, so an outage in either degrades one tab rather than the whole record.
 * The backend guarantees this by resolving each integration independently and
 * never rejecting the response because one of them failed.
 *
 * The selected tab lives in the URL, so a link to a student's finances is a
 * link somebody can send.
 */

/* --------------------------- Zoho Books section --------------------------- */

/**
 * Invoices for this student.
 *
 * The heading states HOW the student was linked to a Books customer, because a
 * financial record shown against the wrong person is a serious error and the
 * reader deserves to know whether the link is an identifier or an email match.
 * An ambiguous email match shows nothing and says why — an unresolved link is
 * recoverable, showing someone else's invoices is not.
 */
function InvoiceSection({ invoices }) {
  if (!invoices) {
    return (
      <Card title="Invoices">
        <p className="muted">Your role does not include access to finance data.</p>
      </Card>
    );
  }

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
        Accounting changes are made in Zoho Books.
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

/* -------------------------------- overview -------------------------------- */

/**
 * The summary tab.
 *
 * Answers the questions somebody opens a student record to ask — where are they
 * in the process, what are they on, are they progressing, do they owe anything —
 * and links to the tab that holds the detail behind each answer.
 */
function Overview({ d, onTab }) {
  const s = d.student;
  const active = d.enrolments.find((e) => e.status === 'Active') || null;
  const latest = [...d.applications]
    .sort((a, b) => String(b.applicationDate || '').localeCompare(String(a.applicationDate || '')))[0] || null;

  // Averaged across the learner's records. Records that have never reported a
  // percentage are left out rather than counted as zero, which would drag the
  // average down for a course that simply has not reported yet.
  const reported = d.learning.filter((l) => l.progressPercentage !== null);
  const avgProgress = reported.length
    ? Math.round(reported.reduce((sum, l) => sum + l.progressPercentage, 0) / reported.length)
    : null;

  const financeKnown = d.invoices && d.invoices.status === 'matched';

  return (
    <>
      <div className="grid g-2">
        <Card title="Identity" action={<SourceBadge source="crm" />}>
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

        <Card title="Where they are" action={<SourceBadge source="crm" />}>
          <dl className="dl">
            <dt>Current programme</dt>
            <dd>
              {active && active.programme
                ? <Link to={`/programmes/${active.programme.id}`}>{active.programme.name}</Link>
                : latest && latest.programme
                  ? <>{latest.programme.name} <span className="muted">(applied for)</span></>
                  : <span className="muted">None</span>}
            </dd>
            <dt>Current intake</dt>
            <dd>
              {active && active.intake
                ? <Link to={`/intakes/${active.intake.id}`}>{active.intake.name}</Link>
                : latest && latest.intake
                  ? <>{latest.intake.name} <span className="muted">(applied for)</span></>
                  : <span className="muted">None</span>}
            </dd>
            <dt>Latest application</dt>
            <dd>
              {latest
                ? (
                  <>
                    <Link to={`/applications/${latest.id}`}>{latest.name || latest.applicationId}</Link>{' '}
                    <Pill value={latest.stage} />
                  </>
                )
                : <span className="muted">None</span>}
            </dd>
            <dt>Active enrolment</dt>
            <dd>
              {active
                ? <Link to={`/enrolments/${active.id}`}>{active.reference || active.id}</Link>
                : <span className="muted">None</span>}
            </dd>
          </dl>
        </Card>
      </div>

      <div className="grid g-2">
        <Card
          title="Learning progress"
          action={<div className="head-actions"><SourceBadge source="lms" /><DemoDataBadge /></div>}
        >
          {d.learning.length ? (
            <>
              <dl className="dl">
                <dt>Average progress</dt>
                <dd><Progress value={avgProgress} /></dd>
                <dt>Records</dt>
                <dd className="mono">{d.learning.length}</dd>
                <dt>Completed</dt>
                <dd className="mono">{d.learning.filter((l) => l.lmsStatus === 'Completed').length}</dd>
              </dl>
              <button type="button" className="btn" onClick={() => onTab('learning')}>
                See learning records
              </button>
            </>
          ) : (
            <p className="muted">
              No external learning records are mapped to this student, so no progress can be
              reported here.
            </p>
          )}
        </Card>

        <Card
          title="Finance"
          action={<div className="head-actions"><SourceBadge source="books" /><ReadOnlyBadge system="Zoho Books" /></div>}
        >
          {/* A balance is only stated when a Books customer was actually
              resolved. "€0 outstanding" for an unmatched student would be a
              claim this application cannot make. */}
          {financeKnown ? (
            <>
              <dl className="dl">
                <dt>Outstanding balance</dt>
                <dd className="mono">
                  {fmtMoney(d.invoices.outstandingBalance, d.invoices.currency, { cents: true })}
                </dd>
                <dt>Invoices</dt>
                <dd className="mono">{d.invoices.invoices.length}</dd>
              </dl>
              <button type="button" className="btn" onClick={() => onTab('finance')}>See invoices</button>
            </>
          ) : (
            <p className="muted">
              {(d.invoices && d.invoices.detail)
                || 'No Zoho Books customer is linked to this student, so no balance can be shown.'}
            </p>
          )}
        </Card>
      </div>

      <Card
        title="Recent activity"
        action={<button type="button" className="btn" onClick={() => onTab('activity')}>All activity</button>}
      >
        <ActivityLog rows={(d.activity || []).slice(0, 5)} />
      </Card>
    </>
  );
}

/* -------------------------------- the page -------------------------------- */

const TAB_KEYS = ['overview', 'applications', 'enrolments', 'learning', 'finance', 'activity'];

export default function Student360() {
  const { id } = useParams();
  const navigate = useNavigate();
  const can = useCan();
  const toast = useToast();
  const state = useApi((o) => api.student(id, o), [id]);
  const [confirm, setConfirm] = useState(null);
  const [noting, setNoting] = useState(false);
  const [params, setParams] = useSearchParams();

  const action = useAction(async () => { await state.reload(); });

  // The tab is held in the URL so a link to a student's finances can be sent to
  // somebody else and open where it was left.
  const requested = params.get('tab');
  const tab = TAB_KEYS.includes(requested) ? requested : 'overview';
  const setTab = (key) => {
    const next = new URLSearchParams(params);
    if (key === 'overview') next.delete('tab'); else next.set('tab', key);
    setParams(next, { replace: true });
  };

  const loaded = state.data && state.data.student;
  useBreadcrumbLeaf(loaded ? (loaded.fullName || loaded.email || null) : null);

  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/students/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied.');
    } catch {
      // Clipboard access can be refused; saying so beats a silent no-op.
      toast('Could not copy. Use the address bar instead.', 'warn');
    }
  };

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
        const outstanding = d.invoices && d.invoices.status === 'matched'
          ? d.invoices.invoices.filter((i) => i.outstanding).length
          : null;

        const tabs = [
          { key: 'overview', label: 'Overview' },
          { key: 'applications', label: 'Applications', count: d.applications.length },
          { key: 'enrolments', label: 'Enrolments', count: d.enrolments.length },
          { key: 'learning', label: 'Learning', count: d.learning.length },
          // A null count means the source did not answer, which is not zero.
          { key: 'finance', label: 'Finance', count: outstanding },
          { key: 'activity', label: 'Activity', count: (d.activity || []).length }
        ];

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
                {can('application:write') && (
                  <Link className="btn" to={`/applications/new?studentId=${id}`}>New application</Link>
                )}
                {can('enrolment:write') && (
                  <Link className="btn" to={`/enrolments/new?studentId=${id}`}>New enrolment</Link>
                )}
                {can('activity:write') && (
                  <button type="button" className="btn" onClick={() => setNoting(true)}>Add note</button>
                )}
                <button type="button" className="btn" onClick={copyLink}>Copy link</button>
                {s.meta && s.meta.crmUrl && (
                  <a className="btn" href={s.meta.crmUrl} target="_blank" rel="noreferrer noopener">
                    Open in Zoho CRM
                  </a>
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

            <Tabs tabs={tabs} active={tab} onChange={setTab} label="Student record sections" />

            <TabPanel id="overview" active={tab}>
              <Overview d={d} onTab={setTab} />
            </TabPanel>

            <TabPanel id="applications" active={tab}>
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
            </TabPanel>

            <TabPanel id="enrolments" active={tab}>
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

              <Card title="Programmes" action={<SourceBadge source="crm" />}>
                {d.programmes.length ? (
                  <ul className="plain-list">
                    {d.programmes.map((p) => (
                      <li key={p.id}>
                        <Link to={`/programmes/${p.id}`}>{p.name}</Link>
                        {p.code && <span className="mono muted"> {p.code}</span>}
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted">No programmes are linked to this student.</p>}
              </Card>
            </TabPanel>

            <TabPanel id="learning" active={tab}>
              <Card
                title="Learning"
                action={(
                  <div className="head-actions">
                    <SourceBadge source="lms" />
                    <DemoDataBadge />
                    <Link className="btn" to="/learning/enrolments">Learning Hub</Link>
                  </div>
                )}
              >
                {d.learning.length ? (
                  <div className="t-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Course</th>
                          <th scope="col">Provider</th>
                          <th scope="col">Status</th>
                          <th scope="col">Progress</th>
                          <th scope="col">Score</th>
                          <th scope="col">Certificate</th>
                          <th scope="col">Last activity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.learning.map((l) => (
                          <tr key={l.id}>
                            <td>
                              <Link to={`/learning/enrolments/${l.id}`}>
                                {l.course ? l.course.name : l.externalCourseId || l.externalEnrolmentId}
                              </Link>
                            </td>
                            <td>{l.provider}</td>
                            <td><Pill value={l.lmsStatus} /></td>
                            <td><Progress value={l.progressPercentage} /></td>
                            <td className="mono">
                              {l.assessmentScore === null ? <span className="muted">—</span> : l.assessmentScore}
                            </td>
                            <td>
                              <Pill value={l.certificateStatus} />
                              {l.certificateUrl && (
                                <> <a href={l.certificateUrl} target="_blank" rel="noreferrer noopener">View</a></>
                              )}
                            </td>
                            <td>{l.lastActivityTime ? fmtDate(l.lastActivityTime) : <span className="muted">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted">
                    No external learning records are mapped to this student. A record exists in
                    the connector only once it has been matched to this CRM contact.
                  </p>
                )}
              </Card>

              <Card title="Learner platform identifiers" action={<SourceBadge source="crm" />}>
                <dl className="dl">
                  <dt>Provider</dt><dd>{s.lms.provider || <span className="muted">—</span>}</dd>
                  <dt>LMS user id</dt><dd className="mono">{s.lms.userId || <span className="muted">Not linked</span>}</dd>
                  <dt>Last sync</dt><dd>{s.lms.lastSync ? fmtDate(s.lms.lastSync) : <span className="muted">—</span>}</dd>
                </dl>
                <p className="note">
                  These three fields live on the CRM Contact and are set by hand. The
                  learning records above come from the external LMS connector and are a
                  separate source — the two can disagree.
                </p>
              </Card>
            </TabPanel>

            <TabPanel id="finance" active={tab}>
              <InvoiceSection invoices={can('invoice:read') ? d.invoices : null} />
            </TabPanel>

            <TabPanel id="activity" active={tab}>
              <Card title="Activity">
                <ActivityLog rows={d.activity} />
              </Card>
            </TabPanel>

            {noting && (
              <NoteDialog
                entityType="student"
                recordId={s.id}
                onClose={() => setNoting(false)}
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
