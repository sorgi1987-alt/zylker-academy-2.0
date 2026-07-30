import React from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import {
  Async, Card, Kpi, BarList, MoneyBarList, Funnel, Pill, ConnDot,
  SourceBadge, DemoDataBadge, fmtDate, fmtMoney
} from '../components/Ui.jsx';
import AttentionPanel from '../components/Attention.jsx';

/**
 * Dashboard — an operational workspace rather than a summary.
 *
 * Two independent requests: the attention queue and the figures. They load and
 * fail separately, so a slow Books aggregation delays one panel instead of the
 * page, and within the figures each source is settled on its own — an
 * unreachable Books reads "Not available" on its own cards while the CRM ones
 * carry on.
 *
 * Every card is a link to the list it summarises, already filtered, and the
 * destination shows a chip naming that filter. A number here is the start of a
 * task, not the end of one.
 */
export default function Dashboard() {
  const { user } = useAuth();
  const state = useApi((o) => api.dashboard(o), []);

  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
        <p>
          Live figures for {user.name}. Each card names its source and opens the
          filtered list behind it: Zoho CRM for admissions, the external LMS
          connector for learning, Zoho Books for finance.
        </p>
      </div>

      {/* Loads on its own request — see the note in Attention.jsx. */}
      <AttentionPanel />

      <Async state={state} empty={{ title: 'No data yet' }} emptyWhen={(d) => !d}>
        {(d) => (
          <>
            <h2 className="sec-h">Admissions</h2>
            <section className="grid g-kpi">
              {/* Submitted, Under Review and Documents Pending together, which is
                  exactly what ?awaitingAction=true selects — so the number here
                  and the row count there are the same number. */}
              <Kpi label="Applications awaiting action" {...d.kpis.applicationsAwaitingAction}
                to="/applications?awaitingAction=true" />
              <Kpi label="Offers awaiting response" {...d.kpis.offersAwaitingResponse}
                to={`/applications?stage=${encodeURIComponent('Offer Issued')}`} />
              <Kpi label="Open applications" {...d.kpis.openApplications} to="/applications" />
              {/* Lifetime, not a rolling window — the label says so rather than
                  leaving the reader to assume the more flattering reading. */}
              <Kpi
                label="Conversion to enrolled (all time)"
                {...d.kpis.conversionRate}
                to={`/applications?stage=${encodeURIComponent('Enrolled')}`}
                format={(v) => (v === null || v === undefined ? '—' : `${v}%`)}
              />
              <Kpi label="Students" {...d.kpis.totalStudents} to="/students" />
            </section>

            <h2 className="sec-h">Delivery</h2>
            <section className="grid g-kpi">
              <Kpi label="Active enrolments" {...d.kpis.activeEnrolments} to="/enrolments?status=Active" />
              <Kpi label="Enrolments without LMS mapping" {...d.kpis.enrolmentsWithoutLmsMapping}
                to="/enrolments?lmsMapped=no" />
              <Kpi label="Upcoming intakes" {...d.kpis.upcomingIntakes} to="/intakes" />
              <Kpi label="Intakes near capacity" {...d.kpis.intakeCapacityWarnings}
                to="/intakes?capacity=at-risk" />
              <Kpi label="Active programmes" {...d.kpis.activeProgrammes} to="/programmes?active=true" />
            </section>

            <h2 className="sec-h">Learning</h2>
            <section className="grid g-kpi">
              <Kpi
                label="Average progress"
                {...d.kpis.averageProgress}
                to="/learning/enrolments"
                format={(v) => (v === null || v === undefined ? '—' : `${v}%`)}
              />
              <Kpi label="Learners with no recent activity" {...d.kpis.inactiveLearners}
                to="/learning/enrolments?activity=stale" />
              {/* Counts learner completions, not distinct courses — labelled as such. */}
              <Kpi label="Course completions" {...d.kpis.completedCourses}
                to="/learning/enrolments?lmsStatus=Completed" />
              <Kpi label="Certificates issued" {...d.kpis.certificatesIssued} to="/learning/enrolments" />
              <Kpi label="Unmapped LMS records" {...d.kpis.unmappedLmsRecords}
                to="/learning/enrolments?mappingStatus=Unmapped" />
              <Kpi label="Failed syncs" {...d.kpis.failedSyncs} to="/learning/sync-log?result=error" />
              <Kpi label="LMS courses" {...d.kpis.lmsCourses} to="/learning/courses" />
            </section>

            <h2 className="sec-h">Finance</h2>
            <section className="grid g-kpi">
              <Kpi label="Overdue invoices" {...d.kpis.overdueInvoices} to="/invoices?status=overdue" />
              <Kpi
                label="Overdue balance"
                {...d.kpis.overdueBalance}
                to="/invoices?status=overdue"
                format={(v) => fmtMoney(v, d.kpis.overdueBalance.currency)}
              />
              <Kpi label="Outstanding invoices" {...d.kpis.outstandingInvoices} to="/invoices?status=sent" />
              <Kpi
                label="Outstanding balance"
                {...d.kpis.outstandingBalance}
                to="/invoices"
                format={(v) => fmtMoney(v, d.kpis.outstandingBalance.currency)}
              />
            </section>

            <div className="grid g-2">
              <Card
                title="Admissions funnel"
                action={<SourceBadge source="crm" />}
              >
                <Funnel steps={d.admissionsFunnel} />
                <p className="field-hint" style={{ marginTop: 12 }}>
                  Cumulative: each step counts every application that reached it. The
                  percentage is the fall from the step above.
                  {' '}Outside the funnel — rejected {d.admissionsExits.Rejected || 0},
                  withdrawn {d.admissionsExits.Withdrawn || 0},
                  deferred {d.admissionsExits.Deferred || 0}.
                </p>
              </Card>

              <Card title="Active enrolments by programme" action={<SourceBadge source="crm" />}>
                <BarList data={d.enrolmentsByProgramme} emptyText="No active enrolments." />
              </Card>
            </div>

            <div className="grid g-2">
              <Card title="Applications by stage" action={<SourceBadge source="crm" />}>
                <BarList data={d.applicationsByStage} emptyText="No applications recorded." />
              </Card>

              <Card
                title="Invoice ageing"
                action={(
                  <div className="head-actions">
                    <SourceBadge source="books" />
                    <Link className="btn" to="/invoices">All invoices</Link>
                  </div>
                )}
              >
                {d.invoiceAgeing
                  ? (
                    <MoneyBarList
                      data={d.invoiceAgeing}
                      order={['Not yet due', '1–30 days', '31–60 days', '61–90 days', 'Over 90 days']}
                      currency={d.invoiceAgeingCurrency}
                      emptyText="Nothing outstanding."
                    />
                  )
                  : <p className="muted">Zoho Books could not be reached, so this is not available.</p>}
              </Card>
            </div>

            {d.intakeCapacity && d.intakeCapacity.length > 0 && (
              <Card
                title="Intakes near or at capacity"
                action={<Link className="btn" to="/intakes?capacity=at-risk">See all</Link>}
              >
                <ul className="plain-list">
                  {d.intakeCapacity.map((i) => {
                    const full = i.activeEnrolments >= i.capacity;
                    return (
                      <li key={i.id}>
                        <Link to={`/intakes/${i.id}`}>{i.name}</Link>
                        <span className="muted"> · starts {fmtDate(i.startDate)} · </span>
                        <span className="mono">{i.activeEnrolments} of {i.capacity}</span>
                        <span className={`pill ${full ? 'stop' : 'warn'}`}>
                          {full ? 'At capacity' : 'Near capacity'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}

            <div className="grid g-2">
              <Card
                title="LMS courses by provider"
                action={<div className="head-actions"><SourceBadge source="lms" /><DemoDataBadge /></div>}
              >
                {d.lmsCoursesByProvider
                  ? <BarList data={d.lmsCoursesByProvider} emptyText="No courses recorded." />
                  : <p className="muted">The LMS connector could not be reached, so this is not available.</p>}
              </Card>
              <Card
                title="Learners by LMS status"
                action={<div className="head-actions"><SourceBadge source="lms" /><DemoDataBadge /></div>}
              >
                {d.learnersByLmsStatus
                  ? <BarList data={d.learnersByLmsStatus} emptyText="No learner records yet." />
                  : <p className="muted">The LMS connector could not be reached, so this is not available.</p>}
              </Card>
            </div>

            <Card
              title="Recent admissions activity"
              action={<Link className="btn" to="/applications">All applications</Link>}
            >
              {d.recentApplications.length ? (
                <div className="t-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Application</th>
                        <th scope="col">Stage</th>
                        <th scope="col">Programme</th>
                        <th scope="col">Applied</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.recentApplications.map((a) => (
                        <tr key={a.id}>
                          <td><Link to={`/applications/${a.id}`}>{a.name || a.applicationId || a.id}</Link></td>
                          <td><Pill value={a.stage} /></td>
                          <td>{a.programme ? a.programme.name : <span className="muted">—</span>}</td>
                          <td>{fmtDate(a.applicationDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="muted">No applications yet.</p>}
            </Card>

            <div className="grid g-2">
              <Card title="Upcoming intakes" action={<Link className="btn" to="/intakes">All intakes</Link>}>
                {d.upcomingIntakes.length ? (
                  <ul className="plain-list">
                    {d.upcomingIntakes.map((i) => (
                      <li key={i.id}>
                        <Link to={`/intakes/${i.id}`}>{i.name}</Link>
                        <span className="muted"> · starts {fmtDate(i.startDate)} </span>
                        <Pill value={i.status} />
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted">No intakes are scheduled to start.</p>}
              </Card>

              <Card title="Integration status" action={<Link className="btn" to="/integration">Details</Link>}>
                <ConnDot label="Zoho CRM" status={d.connections.crm.status} detail={d.connections.crm.detail} />
                <ConnDot
                  label="External LMS (Catalyst)"
                  status={d.connections.lms.status}
                  detail={d.connections.lms.detail}
                />
                <ConnDot label="Zoho Books" status={d.connections.books.status} detail={d.connections.books.detail} />
              </Card>
            </div>
          </>
        )}
      </Async>
    </>
  );
}
