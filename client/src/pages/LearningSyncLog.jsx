import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { api } from '../api.js';
import { Async, Card, FilterSelect, SourceBadge } from '../components/Ui.jsx';
import LearningNav from '../components/LearningNav.jsx';
import SyncLogTable from '../components/SyncLogTable.jsx';

/**
 * Everything the connector has done, most recent first.
 *
 * Failures are kept, not just successes. A log that only records what worked
 * cannot answer the question people actually bring to it, which is why a field
 * in CRM does not match what the LMS shows.
 */
export default function LearningSyncLog() {
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
        <h1>Learning Hub</h1>
        <p>Every mapping and synchronisation the connector has performed, and who triggered it.</p>
      </div>

      <LearningNav />

      <Card title="Synchronisation log" action={<SourceBadge source="lms" />}>
        <div className="toolbar">
          <FilterSelect
            id="log-entity"
            label="Entity"
            value={entityType}
            onChange={setEntityType}
            options={['Course', 'Enrolment']}
            allLabel="All entities"
          />
          <FilterSelect
            id="log-result"
            label="Result"
            value={result}
            onChange={setResult}
            options={[{ value: 'success', label: 'Succeeded' }, { value: 'error', label: 'Failed' }]}
            allLabel="All results"
          />
        </div>

        <Async
          state={state}
          empty={{ title: 'Nothing logged yet', message: 'Map or synchronise a record and it will appear here.' }}
        >
          {(rows) => (
            <>
              <SyncLogTable rows={rows} />
              <p className="note">
                Each entry is attributed to the signed-in user who caused it. Entries are
                written after the CRM write returns, so a logged success means CRM
                confirmed the change rather than that a request was sent.
              </p>
            </>
          )}
        </Async>
      </Card>
    </>
  );
}
