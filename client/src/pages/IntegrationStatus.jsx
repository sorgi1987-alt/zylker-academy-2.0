import React from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { api } from '../api.js';
import {
  Async, Card, ConnDot, SourceBadge, ReadOnlyBadge, DemoDataBadge, fmtDate
} from '../components/Ui.jsx';

/**
 * Integration status.
 *
 * Reports what each connection actually did on this request, not what it is
 * configured to do. Everything here is a boolean, a state name, a count or a
 * redacted message — no token, client id or secret is returned by the endpoint
 * that feeds this page.
 */
export default function IntegrationStatus() {
  const state = useApi((o) => api.integrationStatus(o), []);

  return (
    <>
      <div className="page-head">
        <h1>Integration status</h1>
        <p>
          Live connection health for Zoho CRM, the external LMS connector, Zoho Books
          and Zoho Desk, and the mapping between them.
        </p>
      </div>

      <Async state={state} empty={{ title: 'Status unavailable' }} emptyWhen={(d) => !d}>
        {(d) => {
          const lms = d.lms || {};
          const counts = lms.counts || null;

          return (
            <>
              <Card title="Connections">
                <ConnDot label="Zoho CRM" status={d.connections.crm.status} detail={d.connections.crm.detail} />
                <ConnDot
                  label="External LMS (Catalyst Data Store)"
                  status={d.connections.lms.status}
                  detail={d.connections.lms.detail}
                />
                <ConnDot label="Zoho Books" status={d.connections.books.status} detail={d.connections.books.detail} />
                <ConnDot label="Zoho Desk" status={d.connections.desk.status} detail={d.connections.desk.detail} />
                <p className="note">
                  Zoho CRM is read and written by this application. Zoho Books and Zoho Desk
                  are read-only. The LMS connector is a normalised dataset in Catalyst: no
                  request is made to Moodle, Canvas, TrainerCentral or any SCORM host, and
                  the provider names are source labels on rows.
                </p>
              </Card>

              <div className="grid g-2">
                <Card title="Authentication">
                  <dl className="dl">
                    <dt>Provider</dt><dd>{d.auth.provider}</dd>
                    <dt>Mode</dt><dd className="mono">{d.auth.mode}</dd>
                    <dt>Your role</dt><dd>{d.auth.role}</dd>
                    <dt>Role source</dt><dd className="muted">{d.auth.roleSource}</dd>
                    <dt>Identity resolved by</dt><dd className="mono">{d.auth.resolvedBy}</dd>
                  </dl>
                  <p className="note">
                    Identity is resolved server-side from a credential the Catalyst SDK
                    validated. Platform identity headers are never trusted, because the
                    gateway does not strip client-supplied copies of them.
                  </p>
                </Card>

                <Card
                  title="Zoho Books configuration"
                  action={<div className="head-actions"><SourceBadge source="books" /><ReadOnlyBadge system="Zoho Books" /></div>}
                >
                  <dl className="dl">
                    <dt>Configured</dt><dd>{d.booksConfig.configured ? 'Yes' : 'No'}</dd>
                    <dt>Organisation id</dt>
                    <dd className="mono">{d.booksConfig.organizationId || <span className="muted">Not set</span>}</dd>
                    <dt>API domain</dt><dd className="mono">{d.booksConfig.baseUrl}</dd>
                  </dl>
                  {!d.booksConfig.configured && (
                    <p className="note">
                      Set <span className="mono">ZOHO_BOOKS_ORG_ID</span> in the Catalyst
                      environment and create the Books connection to enable the Finance section.
                    </p>
                  )}
                </Card>
              </div>

              <Card
                title="Zoho Desk configuration"
                action={<div className="head-actions"><SourceBadge source="desk" /><ReadOnlyBadge system="Zoho Desk" /></div>}
              >
                <dl className="dl">
                  <dt>Configured</dt><dd>{d.deskConfig.configured ? 'Yes' : 'No'}</dd>
                  <dt>Organisation id</dt>
                  <dd className="mono">{d.deskConfig.organizationId || <span className="muted">Not set</span>}</dd>
                  <dt>API domain</dt><dd className="mono">{d.deskConfig.baseUrl}</dd>
                </dl>
                {!d.deskConfig.configured && (
                  <p className="note">
                    Set <span className="mono">ZOHO_DESK_ORG_ID</span> in the Catalyst
                    environment and create the Desk connection to enable the Support section.
                  </p>
                )}
              </Card>

              <Card
                title="External LMS connector"
                action={(
                  <div className="head-actions">
                    <SourceBadge source="lms" />
                    <DemoDataBadge />
                    <Link className="btn" to="/learning/courses">Learning Hub</Link>
                  </div>
                )}
              >
                {counts ? (
                  <>
                    <dl className="dl">
                      <dt>Courses</dt>
                      <dd className="mono">{counts.courses} ({counts.activeCourses} active)</dd>
                      <dt>Courses mapped to a programme</dt>
                      <dd className="mono">{counts.coursesMapped} of {counts.courses}</dd>
                      <dt>Learner records</dt><dd className="mono">{counts.enrolments}</dd>
                      <dt>Learner records mapped</dt>
                      <dd className="mono">{counts.enrolmentsMapped} of {counts.enrolments}</dd>
                      <dt>Synced to CRM</dt>
                      <dd className="mono">
                        {counts.syncedCourses} courses, {counts.syncedEnrolments} learner records
                      </dd>
                      <dt>Failed syncs</dt><dd className="mono">{counts.failedSyncs}</dd>
                      <dt>Average progress</dt>
                      <dd className="mono">
                        {lms.averageProgress === null || lms.averageProgress === undefined
                          ? <span className="muted">Not recorded</span>
                          : `${lms.averageProgress}%`}
                      </dd>
                      <dt>Last synchronisation</dt>
                      <dd>{lms.lastSync ? fmtDate(lms.lastSync) : <span className="muted">Never</span>}</dd>
                    </dl>
                    <p className="note">
                      Data Store tables:{' '}
                      <span className="mono">{Object.values(d.connections.lms.tables || {}).join(', ')}</span>
                    </p>
                  </>
                ) : (
                  <p className="muted">
                    {d.connections.lms.detail || 'The Catalyst Data Store did not answer, so no counts are available.'}
                  </p>
                )}
              </Card>

              <Card title="Counts">
                <dl className="dl">
                  <dt>Programmes in CRM</dt><dd className="mono">{d.counts.programmes}</dd>
                  <dt>Students in CRM</dt><dd className="mono">{d.counts.students}</dd>
                  <dt>Enrolments in CRM</dt><dd className="mono">{d.counts.enrolments}</dd>
                  <dt>Courses in the connector</dt>
                  <dd className="mono">
                    {d.counts.lmsCourses === null
                      ? <span className="muted">Not available</span>
                      : d.counts.lmsCourses}
                  </dd>
                  <dt>Learner records in the connector</dt>
                  <dd className="mono">
                    {d.counts.lmsEnrolments === null
                      ? <span className="muted">Not available</span>
                      : d.counts.lmsEnrolments}
                  </dd>
                </dl>
              </Card>

              {d.unmappedProgrammes.length > 0 && (
                <Card title="Programmes with no LMS course">
                  <p className="muted">
                    Nothing in the connector is mapped to these, so no learning data will
                    reach them. Map a course from the Learning Hub.
                  </p>
                  <ul className="plain-list">
                    {d.unmappedProgrammes.map((p) => (
                      <li key={p.id}>
                        <Link to={`/programmes/${p.id}`}>{p.name}</Link>{' '}
                        <span className="mono muted">{p.code}</span>{' '}
                        <span className="muted">— {p.reason}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              <Card title="CRM fields the connector writes">
                <div className="t-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Module</th>
                        <th scope="col">Field</th>
                        <th scope="col">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.legacyCrmFields.map((f) => (
                        <tr key={`${f.module}-${f.apiName}`}>
                          <td>{f.module}</td>
                          <td className="mono">{f.apiName}</td>
                          <td className="muted">{f.note || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card title="CRM fields that do not exist yet">
                <p className="muted">
                  A complete sync would need these on the CRM Enrolments module. They are
                  absent, so their values stay in Catalyst and are shown from there. Creating
                  CRM fields is a metadata change and is deliberately not done automatically.
                </p>
                <div className="t-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Module</th>
                        <th scope="col">Suggested field</th>
                        <th scope="col">Type</th>
                        <th scope="col">Values</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.recommendedCrmFields.map((f) => (
                        <tr key={f.apiName}>
                          <td>{f.module}</td>
                          <td className="mono">{f.apiName}</td>
                          <td>{f.type}</td>
                          <td className="muted">{f.values ? f.values.join(', ') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card title="Notes">
                <ul className="plain-list">
                  {d.notes.map((note) => <li key={note}>{note}</li>)}
                </ul>
              </Card>
            </>
          );
        }}
      </Async>
    </>
  );
}
