import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAction } from '../useApi.js';
import { api } from '../api.js';
import { useT } from '../i18n/I18nContext.jsx';
import { Modal, useToast } from './Ui.jsx';
import { Field, FormActions, FormError, friendlyError } from './Form.jsx';

/**
 * Shared pieces for record workspaces: contextual warnings, tabs and the
 * internal-note dialog.
 */

/* ------------------------------- warnings -------------------------------- */

/**
 * Contextual warnings about a record.
 *
 * The list is computed on the server, because a warning is a factual claim
 * about the record and has to come from the same place the record does. None of
 * these blocks anything: an unpaid invoice is stated next to an academic action,
 * not used to bar it, since no business rule in this application says it should.
 *
 * Each row carries a word as well as a colour — severity conveyed by colour
 * alone is not information for every reader. `w.message` itself is authored
 * server-side (functions/zylker_api/index.js), often with live counts and
 * record-specific detail interpolated in, so it stays in English — the same
 * treatment as any other server-originated sentence in this app.
 */
export function Warnings({ items }) {
  const t = useT();
  if (!items || !items.length) return null;
  const rank = { critical: 0, warning: 1, information: 2 };
  const sorted = [...items].sort((a, b) => rank[a.severity] - rank[b.severity]);

  return (
    <div className="warns" role="status" aria-label={t('common.record.warningsLabel')}>
      {sorted.map((w, i) => (
        <div className={`warn-row ${w.severity}`} key={`${w.severity}-${i}`}>
          <span className="warn-tag">{t(`common.record.severityTag.${w.severity}`) || w.severity}</span>
          <span>
            {w.message}
            {w.to && <> <Link to={w.to}>{t('common.record.open')}</Link></>}
          </span>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- tabs ---------------------------------- */

/**
 * Tab strip for a record workspace.
 *
 * Roving state is held by the caller so the selected tab can also be driven
 * from a URL. Arrow keys move between tabs, which is what a screen reader user
 * expects from a `tablist`.
 */
export function Tabs({ tabs, active, onChange, label }) {
  const t = useT();
  const onKeyDown = (e) => {
    const i = tabs.findIndex((tb) => tb.key === active);
    if (i < 0) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); onChange(tabs[(i + 1) % tabs.length].key); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); onChange(tabs[(i - 1 + tabs.length) % tabs.length].key); }
  };

  return (
    <div className="tabs" role="tablist" aria-label={label || t('common.record.sectionsLabel')} onKeyDown={onKeyDown}>
      {tabs.map((tb) => (
        <button
          key={tb.key}
          type="button"
          role="tab"
          id={`tab-${tb.key}`}
          aria-selected={tb.key === active}
          aria-controls={`panel-${tb.key}`}
          tabIndex={tb.key === active ? 0 : -1}
          onClick={() => onChange(tb.key)}
        >
          {tb.label}
          {/* A count of null means "not loaded or unavailable", which is not the
              same as zero and so shows nothing rather than a 0 badge. */}
          {tb.count !== null && tb.count !== undefined && (
            <span className="tab-count">{tb.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export const TabPanel = ({ id, active, children }) => (
  <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={id !== active}>
    {id === active ? children : null}
  </div>
);

/* ----------------------------- internal note ------------------------------ */

/**
 * Records a note against a record.
 *
 * The note is written to the activity trail, not to CRM: none of these modules
 * has a notes field this application may write, and the dialog says so rather
 * than letting someone believe the text landed on the record in Zoho.
 */
export function NoteDialog({ entityType, recordId, onClose, onDone }) {
  const t = useT();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const action = useAction(async () => { await onDone(); onClose(); });
  const noteError = !note.trim() ? t('common.record.note.required') : null;

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (noteError) return;
    const r = await action.run(() => api.createNote({ entityType, recordId, note }));
    if (r) toast(t('common.record.note.recorded'));
  };

  return (
    <Modal title={t('common.record.note.title')} onClose={onClose} busy={action.busy}>
      <form onSubmit={submit} noValidate>
        <Field
          id="note"
          label={t('common.record.note.label')}
          required
          error={touched ? noteError : null}
          hint={t('common.record.note.hint')}
        >
          <textarea rows={4} value={note} onChange={(e2) => setNote(e2.target.value)} maxLength={1000} />
        </Field>
        <p className="field-hint">{t('common.record.note.charCount', { count: note.length })}</p>
        <FormError error={action.error ? friendlyError(action.error) : null} />
        <FormActions
          busy={action.busy}
          submitLabel={t('common.record.note.submit')}
          onCancel={onClose}
        />
      </form>
    </Modal>
  );
}
