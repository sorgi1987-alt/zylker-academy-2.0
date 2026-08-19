import React from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { api } from '../api.js';
import { useT } from '../i18n/I18nContext.jsx';
import {
  Async, Card, ConnDot, SourceBadge, ReadOnlyBadge, DemoDataBadge, BarList, fmtDate, fmtDateTime
} from '../components/Ui.jsx';

// `sync_status` values written by bootstrap.js/reconciliation.js, plus the
// synthetic 'never-synced' syncHealth.js reports when an entity has no
// sync_state row yet.
const SYNC_STATUS_TONE = { completed: 'ok', running: 'info', failed: 'stop', 'never-synced': 'mute' };
const SYNC_STATUS_KEY = {
  completed: 'integration.syncStatusCompleted',
  running: 'integration.syncStatusRunning',
  failed: 'integration.syncStatusFailed',
  'never-synced': 'integration.syncStatusNeverSynced'
};
// Reuses each list page's own page title rather than a second translated
// copy of the same five names.
const ENTITY_LABEL_KEY = {
  students: 'students.pageTitle',
  applications: 'applications.pageTitle',
  programmes: 'programmes.pageTitle',
  intakes: 'intakes.pageTitle',
  enrolments: 'enrolments.pageTitle'
};

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
          const sync = d.syncHealth || {};
          const apiCallLog = sync.apiCallLog || null;
          // The number the whole read-model PoC exists to prove: live Zoho
          // CRM reads caused by someone browsing this app, not by a sync
          // path — should be zero, every time, for the 5 migrated entities.
          const liveCrmReads = apiCallLog
            ? apiCallLog.breakdown
              .filter((b) => b.service === 'crm' && b.source === 'interactive-read-live')
              .reduce((sum, b) => sum + b.count, 0)
            : null;
          const sourceTotals = sync.appliedBySourceTotals || { eventSync: 0, reconciliation: 0, writeThrough: 0 };

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

              <Card title={t('integration.readModelCard')} action={<SourceBadge source="crm" />}>
                <p className="muted">{t('integration.readModelIntro')}</p>

                {apiCallLog ? (
                  <>
                    <div className="read-model-headline">
                      <span className="read-model-headline-value mono">{liveCrmReads}</span>
                      <span className="read-model-headline-label">
                        {t('integration.liveCrmReadsLabel', { hours: apiCallLog.windowHours })}
                      </span>
                    </div>
                    <p className={liveCrmReads === 0 ? 'note' : 'note stop'} role={liveCrmReads === 0 ? undefined : 'alert'}>
                      {liveCrmReads === 0 ? t('integration.liveCrmReadsGood') : t('integration.liveCrmReadsWarn')}
                    </p>
                    {apiCallLog.truncated && <p className="note">{t('integration.apiCallLogTruncated')}</p>}
                  </>
                ) : (
                  <p className="muted">{t('integration.apiCallLogUnavailable')}</p>
                )}

                <h3 className="card-subhead">{t('integration.updatesBySourceTitle')}</h3>
                <BarList
                  data={{
                    [t('integration.sourceEventSync')]: sourceTotals.eventSync,
                    [t('integration.sourceReconciliation')]: sourceTotals.reconciliation,
                    [t('integration.sourceWriteThrough')]: sourceTotals.writeThrough
                  }}
                  emptyText={t('integration.updatesBySourceEmpty')}
                />

                <h3 className="card-subhead">{t('integration.syncTableTitle')}</h3>
                <div className="t-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{t('integration.syncTableEntity')}</th>
                        <th scope="col">{t('integration.syncTableStatus')}</th>
                        <th scope="col">{t('integration.syncTableLastSynced')}</th>
                        <th scope="col">{t('integration.syncTableLastEvent')}</th>
                        <th scope="col">{t('integration.syncTableUpdates')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(sync.entities || []).map((e) => {
                        const status = e.status || 'never-synced';
                        const applied = e.appliedBySource || { eventSync: 0, reconciliation: 0, writeThrough: 0 };
                        return (
                          <tr key={e.entity}>
                            <td>{t(ENTITY_LABEL_KEY[e.entity] || e.entity)}</td>
                            <td><span className={`pill ${SYNC_STATUS_TONE[status] || 'mute'}`}>{t(SYNC_STATUS_KEY[status] || SYNC_STATUS_KEY['never-synced'])}</span></td>
                            <td>{e.lastSuccessfulSync ? fmtDateTime(e.lastSuccessfulSync) : <span className="muted">—</span>}</td>
                            <td>{e.lastEventReceivedAt ? fmtDateTime(e.lastEventReceivedAt) : <span className="muted">—</span>}</td>
                            <td className="mono">{applied.eventSync + applied.reconciliation + applied.writeThrough}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {apiCallLog && apiCallLog.breakdown.length > 0 && (
                  <>
                    <h3 className="card-subhead">{t('integration.apiCallBreakdownTitle', { hours: apiCallLog.windowHours })}</h3>
                    <div className="t-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th scope="col">{t('integration.apiCallBreakdownService')}</th>
                            <th scope="col">{t('integration.apiCallBreakdownSource')}</th>
                            <th scope="col">{t('integration.apiCallBreakdownCalls')}</th>
                            <th scope="col">{t('integration.apiCallBreakdownFailed')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {apiCallLog.breakdown.map((b) => (
                            <tr key={`${b.service}-${b.source}`}>
                              <td className="mono">{b.service}</td>
                              <td>{t(`integration.apiCallSource.${b.source}`)}</td>
                              <td className="mono">{b.count}</td>
                              <td className="mono">{b.failed || <span className="muted">0</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </Card>

              <div className="grid g-2">
                <Card title={t('integration.authCard')}>
                  <dl className="dl">
                    <dt>{t('integration.mode')}</dt><dd className="mono">{d.auth.mode}</dd>
                    <dt>{t('integration.yourRole')}</dt><dd>{d.auth.role}</dd>
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

              {/* LMS-side counts are not repeated here — they already live on
                  the "External LMS connector" card above, next to the
                  mapping and sync figures they belong with. */}
              <Card title={t('integration.countsCard')}>
                <dl className="dl">
                  <dt>{t('integration.programmesInCrm')}</dt><dd className="mono">{d.counts.programmes}</dd>
                  <dt>{t('integration.studentsInCrm')}</dt><dd className="mono">{d.counts.students}</dd>
                  <dt>{t('integration.enrolmentsInCrm')}</dt><dd className="mono">{d.counts.enrolments}</dd>
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

              <Card title={t('integration.crmFieldMappingCard')}>
                <p className="muted">{t('integration.crmFieldMappingNote')}</p>
                <div className="t-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{t('integration.module')}</th>
                        <th scope="col">{t('integration.field')}</th>
                        <th scope="col">{t('integration.fieldStatus')}</th>
                        <th scope="col">{t('integration.note')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.legacyCrmFields.map((f) => (
                        <tr key={`written-${f.module}-${f.apiName}`}>
                          <td>{f.module}</td>
                          <td className="mono">{f.apiName}</td>
                          <td><span className="pill ok">{t('integration.fieldStatusWritten')}</span></td>
                          <td className="muted">{f.note || '—'}</td>
                        </tr>
                      ))}
                      {d.recommendedCrmFields.map((f) => (
                        <tr key={`missing-${f.module}-${f.apiName}`}>
                          <td>{f.module}</td>
                          <td className="mono">{f.apiName}</td>
                          <td><span className="pill warn">{t('integration.fieldStatusMissing')}</span></td>
                          <td className="muted">
                            {f.type}{f.values ? ` — ${f.values.join(', ')}` : ''}
                          </td>
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
