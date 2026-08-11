import React from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { api } from '../api.js';
import { useT } from '../i18n/I18nContext.jsx';
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
  const t = useT();
  const state = useApi((o) => api.integrationStatus(o), []);

  return (
    <>
      <div className="page-head">
        <h1>{t('integration.pageTitle')}</h1>
        <p>{t('integration.pageIntro')}</p>
      </div>

      <Async state={state} empty={{ title: t('integration.statusUnavailable') }} emptyWhen={(d) => !d}>
        {(d) => {
          const lms = d.lms || {};
          const counts = lms.counts || null;

          return (
            <>
              <Card title={t('integration.connectionsCard')}>
                <ConnDot label={t('dashboard.conn.crm')} status={d.connections.crm.status} detail={d.connections.crm.detail} />
                <ConnDot
                  label={t('integration.connLmsCatalyst')}
                  status={d.connections.lms.status}
                  detail={d.connections.lms.detail}
                />
                <ConnDot label={t('dashboard.conn.books')} status={d.connections.books.status} detail={d.connections.books.detail} />
                <ConnDot label={t('dashboard.conn.desk')} status={d.connections.desk.status} detail={d.connections.desk.detail} />
                <p className="note">{t('integration.connectionsNote')}</p>
              </Card>

              <div className="grid g-2">
                <Card title={t('integration.authCard')}>
                  <dl className="dl">
                    <dt>{t('integration.provider')}</dt><dd>{d.auth.provider}</dd>
                    <dt>{t('integration.mode')}</dt><dd className="mono">{d.auth.mode}</dd>
                    <dt>{t('integration.yourRole')}</dt><dd>{d.auth.role}</dd>
                    <dt>{t('integration.roleSource')}</dt><dd className="muted">{d.auth.roleSource}</dd>
                    <dt>{t('integration.identityResolvedBy')}</dt><dd className="mono">{d.auth.resolvedBy}</dd>
                  </dl>
                  <p className="note">{t('integration.authNote')}</p>
                </Card>

                <Card
                  title={t('integration.booksConfigCard')}
                  action={<div className="head-actions"><SourceBadge source="books" /><ReadOnlyBadge system="Zoho Books" /></div>}
                >
                  <dl className="dl">
                    <dt>{t('integration.configured')}</dt><dd>{d.booksConfig.configured ? t('integration.yes') : t('integration.no')}</dd>
                    <dt>{t('integration.organisationId')}</dt>
                    <dd className="mono">{d.booksConfig.organizationId || <span className="muted">{t('integration.notSet')}</span>}</dd>
                    <dt>{t('integration.apiDomain')}</dt><dd className="mono">{d.booksConfig.baseUrl}</dd>
                  </dl>
                  {!d.booksConfig.configured && (
                    <p className="note">
                      {t('integration.booksNotConfiguredBefore')}{' '}
                      <span className="mono">ZOHO_BOOKS_ORG_ID</span>{' '}
                      {t('integration.booksNotConfiguredAfter')}
                    </p>
                  )}
                </Card>
              </div>

              <Card
                title={t('integration.deskConfigCard')}
                action={<div className="head-actions"><SourceBadge source="desk" /><ReadOnlyBadge system="Zoho Desk" /></div>}
              >
                <dl className="dl">
                  <dt>{t('integration.configured')}</dt><dd>{d.deskConfig.configured ? t('integration.yes') : t('integration.no')}</dd>
                  <dt>{t('integration.organisationId')}</dt>
                  <dd className="mono">{d.deskConfig.organizationId || <span className="muted">{t('integration.notSet')}</span>}</dd>
                  <dt>{t('integration.apiDomain')}</dt><dd className="mono">{d.deskConfig.baseUrl}</dd>
                </dl>
                {!d.deskConfig.configured && (
                  <p className="note">
                    {t('integration.deskNotConfiguredBefore')}{' '}
                    <span className="mono">ZOHO_DESK_ORG_ID</span>{' '}
                    {t('integration.deskNotConfiguredAfter')}
                  </p>
                )}
              </Card>

              <Card
                title={t('integration.lmsConnectorCard')}
                action={(
                  <div className="head-actions">
                    <SourceBadge source="lms" />
                    <DemoDataBadge />
                    <Link className="btn" to="/learning/courses">{t('integration.learningHub')}</Link>
                  </div>
                )}
              >
                {counts ? (
                  <>
                    <dl className="dl">
                      <dt>{t('integration.courses')}</dt>
                      <dd className="mono">{counts.courses} ({t('integration.activeCount', { count: counts.activeCourses })})</dd>
                      <dt>{t('integration.coursesMappedToProgramme')}</dt>
                      <dd className="mono">{t('common.ofCount', { used: counts.coursesMapped, total: counts.courses })}</dd>
                      <dt>{t('integration.learnerRecords')}</dt><dd className="mono">{counts.enrolments}</dd>
                      <dt>{t('integration.learnerRecordsMapped')}</dt>
                      <dd className="mono">{t('common.ofCount', { used: counts.enrolmentsMapped, total: counts.enrolments })}</dd>
                      <dt>{t('integration.syncedToCrm')}</dt>
                      <dd className="mono">
                        {t('integration.syncedSummary', { courses: counts.syncedCourses, enrolments: counts.syncedEnrolments })}
                      </dd>
                      <dt>{t('integration.failedSyncs')}</dt><dd className="mono">{counts.failedSyncs}</dd>
                      <dt>{t('integration.averageProgress')}</dt>
                      <dd className="mono">
                        {lms.averageProgress === null || lms.averageProgress === undefined
                          ? <span className="muted">{t('integration.notRecorded')}</span>
                          : `${lms.averageProgress}%`}
                      </dd>
                      <dt>{t('integration.lastSynchronisation')}</dt>
                      <dd>{lms.lastSync ? fmtDate(lms.lastSync) : <span className="muted">{t('integration.never')}</span>}</dd>
                    </dl>
                    <p className="note">
                      {t('integration.dataStoreTables')}{' '}
                      <span className="mono">{Object.values(d.connections.lms.tables || {}).join(', ')}</span>
                    </p>
                  </>
                ) : (
                  <p className="muted">
                    {d.connections.lms.detail || t('integration.lmsNoAnswer')}
                  </p>
                )}
              </Card>

              <Card title={t('integration.countsCard')}>
                <dl className="dl">
                  <dt>{t('integration.programmesInCrm')}</dt><dd className="mono">{d.counts.programmes}</dd>
                  <dt>{t('integration.studentsInCrm')}</dt><dd className="mono">{d.counts.students}</dd>
                  <dt>{t('integration.enrolmentsInCrm')}</dt><dd className="mono">{d.counts.enrolments}</dd>
                  <dt>{t('integration.coursesInConnector')}</dt>
                  <dd className="mono">
                    {d.counts.lmsCourses === null
                      ? <span className="muted">{t('integration.notAvailable')}</span>
                      : d.counts.lmsCourses}
                  </dd>
                  <dt>{t('integration.learnerRecordsInConnector')}</dt>
                  <dd className="mono">
                    {d.counts.lmsEnrolments === null
                      ? <span className="muted">{t('integration.notAvailable')}</span>
                      : d.counts.lmsEnrolments}
                  </dd>
                </dl>
              </Card>

              {d.unmappedProgrammes.length > 0 && (
                <Card title={t('integration.unmappedProgrammesCard')}>
                  <p className="muted">{t('integration.unmappedProgrammesNote')}</p>
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

              <Card title={t('integration.crmFieldsWrittenCard')}>
                <div className="t-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{t('integration.module')}</th>
                        <th scope="col">{t('integration.field')}</th>
                        <th scope="col">{t('integration.note')}</th>
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

              <Card title={t('integration.crmFieldsMissingCard')}>
                <p className="muted">{t('integration.crmFieldsMissingNote')}</p>
                <div className="t-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{t('integration.module')}</th>
                        <th scope="col">{t('integration.suggestedField')}</th>
                        <th scope="col">{t('integration.type')}</th>
                        <th scope="col">{t('integration.values')}</th>
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

              <Card title={t('integration.notesCard')}>
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
