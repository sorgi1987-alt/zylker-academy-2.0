import React from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import {
  Async, Card, Kpi, BarList, Pill, ConnDot, SourceBadge, DemoDataBadge, fmtDate, fmtMoney
} from '../components/Ui.jsx';

/**
 * Dashboard.
 *
 * Every figure names its source system. A CRM figure and a Books figure look
 * different on purpose: if Books is unreachable its cards read "Not available"
 * while the CRM cards carry on, because the backend settles the three
 * integrations independently and never lets one failure reject the others.
 *
 * Each card links to the list it summarises, pre-filtered, so a number is a
 * starting point rather than a dead end.
 */
export default function Dashboard() {
  const { user } = useAuth();
  const state = useApi((o) => api.dashboard(o), []);

  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
        <p>
          Live figures for {user.name}. Each card names its source: Zoho CRM for
          admissions, the external LMS connector for learning, Zoho Books for finance.
        </p>
      </div>

      <Async state={state} empty={{ title: 'No data yet' }} emptyWhen={(d) => !d}>
        {(d) => (
          <>
            <section className="grid g-kpi">
              <Kpi label="Students" {...d.kpis.totalStudents} to="/students" />
              <Kpi label="Open applications" {...d.kpis.openApplications} to="/applications" />
              <Kpi label="Active programmes" {...d.kpis.activeProgrammes} to="/programmes?active=true" />
              <Kpi label="Upcoming intakes" {...d.kpis.upcomingIntakes} to="/intakes" />
              <Kpi label="Active enrolments" {...d.kpis.activeEnrolments} to="/enrolments?status=Active" />
              <Kpi label="LMS courses" {...d.kpis.lmsCourses} to="/learning/courses" />
              <Kpi
                label="Average progress"
                {...d.kpis.averageProgress}
                to="/learning/enrolments"
                format={(v) => (v === null || v === undefined ? '—' : `${v}%`)}
              />
              {/* Counts learner completions, not distinct courses — labelled as such. */}
              <Kpi label="Course completions" {...d.kpis.completedCourses} to="/learning/enrolments?lmsStatus=Completed" />
              <Kpi label="Certificates issued" {...d.kpis.certificatesIssued} to="/learning/enrolments" />
              <Kpi
                label="Unmapped LMS records"
                {...d.kpis.unmappedLmsRecords}
                to="/learning/enrolments?mappingStatus=Unmapped"
              />
              <Kpi label="Failed syncs" {...d.kpis.failedSyncs} to="/learning/sync-log?result=error" />
              <Kpi label="Outstanding invoices" {...d.kpis.outstandingInvoices} to="/invoices?status=sent" />
              <Kpi label="Overdue invoices" {...d.kpis.overdueInvoices} to="/invoices?status=overdue" />
              <Kpi
                label="Outstanding balance"
                {...d.kpis.outstandingBalance}
                to="/invoices"
                format={(v) => fmtMoney(v, d.kpis.outstandingBalance.currency)}
              />
            </section>

            <div className="grid g-2">
              <Card title="Applications by stage" action={<SourceBadge source="crm" />}>
                <BarList data={d.applicationsByStage} emptyText="No applications recorded." />
              </Card>
              <Card title="Enrolments by status" action={<SourceBadge source="crm" />}>
                <BarList data={d.enrolmentsByStatus} emptyText="No enrolments recorded." />
              </Card>
            </div>

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
