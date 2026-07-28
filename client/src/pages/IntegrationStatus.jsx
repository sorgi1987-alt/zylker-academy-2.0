import React from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { api } from '../api.js';
import { Async, Card, ConnDot, SourceBadge, ReadOnlyBadge } from '../components/Ui.jsx';

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
        <p>Live connection health for Zoho CRM, Zoho Learn and Zoho Books, and the mapping between them.</p>
      </div>

      <Async state={state} empty={{ title: 'Status unavailable' }} emptyWhen={(d) => !d}>
        {(d) => (
          <>
            <Card title="Connections">
              <ConnDot label="Zoho CRM" status={d.connections.crm.status} detail={d.connections.crm.detail} />
              <ConnDot label="Zoho Learn" status={d.connections.learn.status} detail={d.connections.learn.detail} />
              <ConnDot label="Zoho Books" status={d.connections.books.status} detail={d.connections.books.detail} />
              <p className="note">
                Zoho CRM is read and written by this application. Zoho Learn and Zoho Books
                are read-only.
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

            <Card title="Counts">
              <dl className="dl">
                <dt>Programmes in CRM</dt><dd className="mono">{d.counts.programmes}</dd>
                <dt>Courses in Learn</dt>
                <dd className="mono">
                  {d.counts.courses === null ? <span className="muted">Not available</span> : d.counts.courses}
                </dd>
                <dt>Programmes mapped to a course</dt><dd className="mono">{d.counts.coursesMatched}</dd>
                <dt>Mappings inferred from the name</dt><dd className="mono">{d.counts.inferredMatches}</dd>
                <dt>Students</dt><dd className="mono">{d.counts.students}</dd>
                <dt>Enrolments</dt><dd className="mono">{d.counts.enrolments}</dd>
              </dl>
            </Card>

            {d.inferredMatchProgrammes.length > 0 && (
              <Card title="Programmes matched by name only">
                <p className="muted">
                  These were matched to a Learn course by name because no identifier was
                  stored. Add the Learn course id on the programme to make the link exact.
                </p>
                <ul className="plain-list">
                  {d.inferredMatchProgrammes.map((p) => (
                    <li key={p.id}>
                      <Link to={`/programmes/${p.id}`}>{p.name}</Link>{' '}
                      <span className="mono muted">{p.code}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {d.unmappedProgrammes.length > 0 && (
              <Card title="Programmes with no Learn course">
                <ul className="plain-list">
                  {d.unmappedProgrammes.map((p) => (
                    <li key={p.id}>
                      <Link to={`/programmes/${p.id}`}>{p.name}</Link>{' '}
                      <span className="muted">— {p.reason}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {d.enrolmentsNotSynced.length > 0 && (
              <Card title="Enrolments not marked as synced">
                <p className="muted">
                  Sync status is maintained manually in CRM. This application does not
                  write to Zoho Learn, so these require a manual action.
                </p>
                <ul className="plain-list">
                  {d.enrolmentsNotSynced.slice(0, 20).map((e) => (
                    <li key={e.id}>
                      <Link to={`/enrolments/${e.id}`}>{e.reference || e.id}</Link>{' '}
                      <span className="muted">— {e.syncStatus || 'no status'}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card title="Notes">
              <ul className="plain-list">
                {d.notes.map((note) => <li key={note}>{note}</li>)}
              </ul>
            </Card>
          </>
        )}
      </Async>
    </>
  );
}
