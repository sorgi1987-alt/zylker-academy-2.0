import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { api } from '../api.js';
import { Async, Card, FilterSelect } from '../components/Ui.jsx';
import ActivityLogComponent from '../components/ActivityLog.jsx';
import { useT } from '../i18n/I18nContext.jsx';

const ENTITY_TYPES = ['student', 'application', 'programme', 'intake', 'enrolment'];

/**
 * Every write this application has made to a CRM entity, most recent first —
 * who did it, not just what changed.
 *
 * This exists because Zoho CRM's own record history only ever shows the one
 * shared connection identity this application authenticates with; it cannot
 * say which of your staff actually made a given change. This log is built
 * from the same admissions_audit table the per-record Activity tab already
 * reads, just without a record filter — see LearningSyncLog for the LMS
 * connector's equivalent (course/enrolment writes and CRM syncs).
 */
export default function ActivityLog() {
  const t = useT();
  const [entityType, setEntityType] = useState('');
  const [result, setResult] = useState('');
  const [operation, setOperation] = useState('');
  const state = useApi(
    (o) => api.activity({
      limit: 100,
      entityType: entityType || undefined,
      result: result || undefined,
      operation: operation || undefined
    }, o),
    [entityType, result, operation]
  );

  const entityOptions = ENTITY_TYPES.map((v) => ({ value: v, label: t(`activityLog.entity.${v}`) }));

  return (
    <>
      <div className="page-head">
        <h1>{t('activityLog.pageTitle')}</h1>
        <p>{t('activityLog.pageIntro')}</p>
      </div>

      <Card title={t('activityLog.cardTitle')}>
        <div className="toolbar">
          <FilterSelect
            id="activity-entity"
            label={t('activityLog.entityLabel')}
            value={entityType}
            onChange={setEntityType}
            options={entityOptions}
            allLabel={t('activityLog.allEntities')}
          />
          <FilterSelect
            id="activity-result"
            label={t('activityLog.resultLabel')}
            value={result}
            onChange={setResult}
            options={[
              { value: 'success', label: t('activityLog.resultSucceeded') },
              { value: 'error', label: t('activityLog.resultFailed') }
            ]}
            allLabel={t('activityLog.allResults')}
          />
          <FilterSelect
            id="activity-operation"
            label={t('activityLog.operationLabel')}
            value={operation}
            onChange={setOperation}
            options={[
              { value: 'create', label: t('activityLog.operationCreated') },
              { value: 'update', label: t('activityLog.operationUpdated') },
              { value: 'delete', label: t('activityLog.operationDeleted') }
            ]}
            allLabel={t('activityLog.allOperations')}
          />
        </div>

        <Async
          state={state}
          empty={{ title: t('activityLog.emptyTitle'), message: t('activityLog.emptyMessage') }}
        >
          {(rows) => (
            <>
              <ActivityLogComponent rows={rows} unavailable={state.meta && state.meta.unavailable} />
              <p className="note">
                {t('activityLog.attributionNote')}{' '}
                <Link to="/learning/sync-log">{t('activityLog.lmsLogLink')}</Link>
              </p>
            </>
          )}
        </Async>
      </Card>
    </>
  );
}
