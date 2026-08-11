import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { api } from '../api.js';
import { Async, Card, FilterSelect, SourceBadge } from '../components/Ui.jsx';
import LearningNav from '../components/LearningNav.jsx';
import SyncLogTable from '../components/SyncLogTable.jsx';
import { useT } from '../i18n/I18nContext.jsx';

/**
 * Everything the connector has done, most recent first.
 *
 * Failures are kept, not just successes. A log that only records what worked
 * cannot answer the question people actually bring to it, which is why a field
 * in CRM does not match what the LMS shows.
 */
export default function LearningSyncLog() {
  const t = useT();
  // Honours ?result=error so the dashboard's "Failed syncs" card lands on the
  // failures rather than on an unfiltered log the reader has to filter again.
  const [params] = useSearchParams();
  const [entityType, setEntityType] = useState(params.get('entityType') || '');
  const [result, setResult] = useState(params.get('result') || '');
  const state = useApi(
    (o) => api.lmsSyncLog({ limit: 100, entityType: entityType || undefined, result: result || undefined }, o),
    [entityType, result]
  );

  return (
    <>
      <div className="page-head">
        <h1>{t('learningSyncLog.pageTitle')}</h1>
        <p>{t('learningSyncLog.pageIntro')}</p>
      </div>

      <LearningNav />

      <Card title={t('learningSyncLog.cardTitle')} action={<SourceBadge source="lms" />}>
        <div className="toolbar">
          <FilterSelect
            id="log-entity"
            label={t('learningSyncLog.entityLabel')}
            value={entityType}
            onChange={setEntityType}
            options={['Course', 'Enrolment']}
            allLabel={t('learningSyncLog.allEntities')}
          />
          <FilterSelect
            id="log-result"
            label={t('learningSyncLog.resultLabel')}
            value={result}
            onChange={setResult}
            options={[
              { value: 'success', label: t('learningSyncLog.resultSucceeded') },
              { value: 'error', label: t('learningSyncLog.resultFailed') }
            ]}
            allLabel={t('learningSyncLog.allResults')}
          />
        </div>

        <Async
          state={state}
          empty={{ title: t('learningSyncLog.emptyTitle'), message: t('learningSyncLog.emptyMessage') }}
        >
          {(rows) => (
            <>
              <SyncLogTable rows={rows} />
              <p className="note">
                {t('learningSyncLog.attributionNote')}
              </p>
            </>
          )}
        </Async>
      </Card>
    </>
  );
}
