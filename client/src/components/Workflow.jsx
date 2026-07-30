import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAction } from '../useApi.js';
import { api, newIdempotencyKey } from '../api.js';
import { Card, Modal, SourceBadge, useToast, fmtDate } from './Ui.jsx';
import { Field, FormActions, FormError, friendlyError, DATE_MIN, DATE_MAX } from './Form.jsx';

/**
 * The admissions workflow panel.
 *
 * Everything here is driven by `workflow`, computed on the server from the same
 * transition table the write handler validates against. Nothing about the
 * process is restated in the browser, so the panel cannot offer a move the API
 * would refuse, and the reason a move is missing is the server's reason.
 */

/* ------------------------------ stage tracker ----------------------------- */

function StageTracker({ workflow }) {
  const { stageOrder, currentStage, completedStages, exitStages } = workflow;
  const done = new Set(completedStages);
  const isExit = exitStages.includes(currentStage);

  return (
    <>
      <ol className="track" aria-label="Admissions pipeline">
        {stageOrder.map((s) => {
          const state = s === currentStage ? 'now' : done.has(s) ? 'done' : 'todo';
          return (
            <li key={s} className={`track-step ${state}`} aria-current={state === 'now' ? 'step' : undefined}>
              <span className="track-dot" aria-hidden="true">{state === 'done' ? '✓' : ''}</span>
              <span className="track-label">{s}</span>
              {/* Colour alone is not information for everyone reading this. */}
              <span className="track-state">
                {state === 'now' ? 'Current' : state === 'done' ? 'Passed' : 'Not reached'}
              </span>
            </li>
          );
        })}
      </ol>

      {isExit && (
        <p className="note" style={{ marginTop: 12 }}>
          This application left the pipeline at <strong>{currentStage}</strong>. The steps
          above show the process, not this application's position in it.
        </p>
      )}
    </>
  );
}

/* --------------------------- transition dialog ---------------------------- */

/**
 * Collects only what this CRM module can actually store, plus a comment.
 *
 * The comment has no field on the Application module, so it is written to the
 * activity trail rather than to the record — and the dialog says so, because a
 * note the user believes is on the record but is not would be worse than no
 * note at all. A follow-up date and a responsible staff member are not offered:
 * there is no field for either, and inventing an API name would fail at the CRM
 * boundary.
 */
function TransitionDialog({ application, target, workflow, onClose, onDone }) {
  const toast = useToast();
  const [idempotencyKey, setKey] = useState(newIdempotencyKey);
  const [form, setForm] = useState({
    comment: '',
    decisionDate: '',
    documentsStatus: application.documentsStatus || ''
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const action = useAction(onDone);

  const wantsDecisionDate = (workflow.collects.decisionDate || []).includes(target);
  const wantsDocuments = target === 'Documents Pending';
  const enrolling = target === 'Enrolled';

  const submit = async (e) => {
    e.preventDefault();
    const r = await action.run(() => api.transitionApplication(
      application.id,
      {
        toStage: target,
        expectedModifiedTime: application.modifiedTime,
        comment: form.comment || undefined,
        decisionDate: wantsDecisionDate && form.decisionDate ? form.decisionDate : undefined,
        documentsStatus: wantsDocuments && form.documentsStatus ? form.documentsStatus : undefined
      },
      { idempotencyKey }
    ));
    if (r) {
      toast(
        r.data.enrolmentCreated
          ? 'Stage changed and an enrolment was created.'
          : r.data.enrolment
            ? 'Stage changed. The existing enrolment was reused.'
            : 'Stage changed.'
      );
      // A fresh key, so a later transition is not treated as a replay of this one.
      setKey(newIdempotencyKey());
      onClose();
    }
  };

  return (
    <Modal title={`Move to ${target}`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <p style={{ marginTop: 0 }}>
          The stage will change to <strong>{target}</strong> in Zoho CRM.
          {enrolling && ' An enrolment is created if one does not already exist; repeating this will not create a second.'}
        </p>

        {wantsDecisionDate && (
          <Field id="decisionDate" label="Decision date"
            hint="Written to the Decision Date field. Left blank, today's date is used.">
            <input type="date" min={DATE_MIN} max={DATE_MAX}
              value={form.decisionDate} onChange={set('decisionDate')} />
          </Field>
        )}

        {wantsDocuments && (
          <Field id="documentsStatus" label="Documents required"
            hint="Written to the Documents Status field on the application.">
            <input value={form.documentsStatus} onChange={set('documentsStatus')}
              placeholder="e.g. Passport, transcript" />
          </Field>
        )}

        <Field id="comment" label="Comment"
          hint="Recorded in this application's activity trail, attributed to you. The Application module has no comment field, so this is not written onto the CRM record.">
          <textarea rows={3} value={form.comment} onChange={set('comment')} />
        </Field>

        <FormError error={action.error ? friendlyError(action.error) : null} />
        <FormActions busy={action.busy} submitLabel={`Move to ${target}`} onCancel={onClose} />
      </form>
    </Modal>
  );
}

/* --------------------------------- panel ---------------------------------- */

export default function WorkflowPanel({ application, workflow, enrolment, canTransition, onDone }) {
  const [target, setTarget] = useState(null);
  if (!workflow) return null;

  // Blockers are grouped by the stage they affect, so a button can be disabled
  // with its own reason rather than with a generic warning banner.
  const hard = workflow.blockers.filter((b) => !b.warningOnly);
  const soft = workflow.blockers.filter((b) => b.warningOnly);
  const blockersFor = (stage) => hard.filter((b) => b.stage === stage);

  return (
    <Card
      title="Admissions workflow"
      action={<SourceBadge source="crm" />}
    >
      <StageTracker workflow={workflow} />

      {workflow.intakeUsage && (
        <p className="field-hint" style={{ marginTop: 10 }}>
          Linked intake: {workflow.intakeUsage.used} of {workflow.intakeUsage.capacity} places taken.
        </p>
      )}

      {soft.length > 0 && (
        <div className="note" style={{ marginTop: 12 }}>
          {soft.map((b) => <div key={b.reason}>{b.reason}</div>)}
        </div>
      )}

      {canTransition ? (
        <div style={{ marginTop: 14 }}>
          {workflow.isTerminal ? (
            <p className="muted small" style={{ margin: 0 }}>
              This application is at a final stage and cannot be moved further.
            </p>
          ) : (
            <>
              <p className="field-hint" style={{ margin: '0 0 8px' }}>Available next actions</p>
              <div className="head-actions">
                {workflow.allowed.map((s) => {
                  const blocks = blockersFor(s);
                  const disabled = blocks.length > 0;
                  return (
                    <button
                      key={s}
                      type="button"
                      className="btn"
                      disabled={disabled}
                      title={disabled ? blocks[0].reason : undefined}
                      onClick={() => setTarget(s)}
                    >
                      Move to {s}
                    </button>
                  );
                })}
              </div>

              {/* A disabled button explains itself in text as well as in a
                  tooltip, which a touch user never sees. */}
              {hard.length > 0 && (
                <ul className="blocked-list">
                  {hard.map((b) => (
                    <li key={`${b.stage}-${b.reason}`}>
                      <strong>{b.stage}</strong> is blocked: {b.reason}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {workflow.blocked.length > 0 && (
            <details className="why">
              <summary>Why are the other stages not offered?</summary>
              <ul className="blocked-list">
                {workflow.blocked.map((b) => (
                  <li key={b.stage}><strong>{b.stage}</strong> — {b.reason}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ) : (
        <p className="muted small" style={{ marginTop: 14 }}>
          Your role can view this workflow but not change the stage.
        </p>
      )}

      {enrolment && (
        <p className="field-hint" style={{ marginTop: 12 }}>
          Enrolment <Link to={`/enrolments/${enrolment.id}`}>{enrolment.reference || enrolment.id}</Link>
          {enrolment.enrolmentDate ? ` · created ${fmtDate(enrolment.enrolmentDate)}` : ''}
        </p>
      )}

      {target && (
        <TransitionDialog
          application={application}
          workflow={workflow}
          target={target}
          onClose={() => setTarget(null)}
          onDone={onDone}
        />
      )}
    </Card>
  );
}
