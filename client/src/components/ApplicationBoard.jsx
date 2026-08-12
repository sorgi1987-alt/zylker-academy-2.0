import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, newIdempotencyKey } from '../api.js';
import { useT } from '../i18n/I18nContext.jsx';
import { useToast, fmtDate, fmtMoney } from './Ui.jsx';
import { friendlyError } from './Form.jsx';

/**
 * A Kanban view of applications, one column per stage.
 *
 * Dragging a card calls the exact same `/api/applications/:id/transition`
 * endpoint the workflow panel (Workflow.jsx) already uses — the allowed-
 * transition table lives server-side only (writes.js TRANSITIONS) and stays
 * there. A drop is not pre-validated against a client-side copy of that
 * table; it is attempted, and the server accepts or refuses it exactly as it
 * would from the detail page. A refusal (invalid transition, stale record,
 * capacity conflict, a hard blocker) reverts the card to its original column
 * and says why, rather than pretending the move happened.
 */

// Presentation only — which columns get the muted "exit" treatment. Not used
// for any validation; that stays server-side.
const EXIT_STAGES = new Set(['Rejected', 'Withdrawn', 'Deferred']);

export default function ApplicationBoard({ rows, stages, canDrag, onReload }) {
  const t = useT();
  const toast = useToast();
  const [items, setItems] = useState(rows);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [pendingId, setPendingId] = useState(null);

  // Re-sync whenever the parent re-fetches (filters/search changed, or a
  // reload after a successful move brought back authoritative data).
  useEffect(() => { setItems(rows); }, [rows]);

  const columns = stages.map((stage) => ({
    stage,
    apps: items.filter((a) => a.stage === stage)
  }));

  const handleDrop = async (targetStage, e) => {
    e.preventDefault();
    setDragOverStage(null);
    const id = e.dataTransfer.getData('text/plain');
    const app = items.find((a) => String(a.id) === id);
    if (!app || app.stage === targetStage) return;

    const previousStage = app.stage;
    // Optimistic move — most drags are valid, and waiting for a round trip
    // before a card visibly moves reads as laggy for the common case.
    setItems((cur) => cur.map((a) => (a.id === app.id ? { ...a, stage: targetStage } : a)));
    setPendingId(app.id);

    try {
      const r = await api.transitionApplication(
        app.id,
        { toStage: targetStage, expectedModifiedTime: app.modifiedTime },
        { idempotencyKey: newIdempotencyKey() }
      );
      toast(
        r.data.enrolmentCreated
          ? t('common.workflow.transitionedWithEnrolment')
          : r.data.enrolment
            ? t('common.workflow.transitionedReusedEnrolment')
            : t('common.workflow.transitioned')
      );
      onReload();
    } catch (err) {
      setItems((cur) => cur.map((a) => (a.id === app.id ? { ...a, stage: previousStage } : a)));
      toast(`${t('applications.board.moveFailed')} ${friendlyError(err)}`, 'err');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="kanban">
      {columns.map(({ stage, apps }) => (
        <div
          key={stage}
          className={`kanban-col${EXIT_STAGES.has(stage) ? ' exit' : ''}${dragOverStage === stage ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage); }}
          onDragLeave={() => setDragOverStage((s) => (s === stage ? null : s))}
          onDrop={(e) => handleDrop(stage, e)}
        >
          <div className="kanban-col-h">
            <span className="kanban-col-title">{stage}</span>
            <span className="kanban-col-count">{apps.length}</span>
          </div>
          <div className="kanban-col-b">
            {apps.length ? apps.map((a) => (
              <Link
                key={a.id}
                to={`/applications/${a.id}`}
                className={`kanban-card${pendingId === a.id ? ' pending' : ''}`}
                draggable={canDrag}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', String(a.id));
                  e.dataTransfer.effectAllowed = 'move';
                }}
              >
                <strong>{a.name || a.applicationId || a.id}</strong>
                <span className="kanban-card-sub">
                  {[a.applicantName, a.programme && a.programme.name].filter(Boolean).join(' · ') || '—'}
                </span>
                <span className="kanban-card-foot">
                  <span className="muted small">{fmtDate(a.applicationDate)}</span>
                  <span className="mono">{fmtMoney(a.tuitionFee)}</span>
                </span>
              </Link>
            )) : (
              <p className="kanban-empty muted small">{t('applications.board.emptyColumn')}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
