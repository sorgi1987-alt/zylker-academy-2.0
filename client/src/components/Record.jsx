import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAction } from '../useApi.js';
import { api } from '../api.js';
import { Modal, useToast } from './Ui.jsx';
import { Field, FormActions, FormError, friendlyError } from './Form.jsx';

/**
 * Shared pieces for record workspaces: contextual warnings, tabs and the
 * internal-note dialog.
 */

/* ------------------------------- warnings -------------------------------- */

const TAG = { critical: 'Critical', warning: 'Warning', information: 'Note' };

/**
 * Contextual warnings about a record.
 *
 * The list is computed on the server, because a warning is a factual claim
 * about the record and has to come from the same place the record does. None of
 * these blocks anything: an unpaid invoice is stated next to an academic action,
 * not used to bar it, since no business rule in this application says it should.
 *
 * Each row carries a word as well as a colour — severity conveyed by colour
 * alone is not information for every reader.
 */
export function Warnings({ items }) {
  if (!items || !items.length) return null;
  const rank = { critical: 0, warning: 1, information: 2 };
  const sorted = [...items].sort((a, b) => rank[a.severity] - rank[b.severity]);

  return (
    <div className="warns" role="status" aria-label="Warnings about this record">
      {sorted.map((w, i) => (
        <div className={`warn-row ${w.severity}`} key={`${w.severity}-${i}`}>
          <span className="warn-tag">{TAG[w.severity] || w.severity}</span>
          <span>
            {w.message}
            {w.to && <> <Link to={w.to}>Open</Link></>}
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
export function Tabs({ tabs, active, onChange, label = 'Sections' }) {
  const onKeyDown = (e) => {
    const i = tabs.findIndex((t) => t.key === active);
    if (i < 0) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); onChange(tabs[(i + 1) % tabs.length].key); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); onChange(tabs[(i - 1 + tabs.length) % tabs.length].key); }
  };

  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          id={`tab-${t.key}`}
          aria-selected={t.key === active}
          aria-controls={`panel-${t.key}`}
          tabIndex={t.key === active ? 0 : -1}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {/* A count of null means "not loaded or unavailable", which is not the
              same as zero and so shows nothing rather than a 0 badge. */}
          {t.count !== null && t.count !== undefined && (
            <span className="tab-count">{t.count}</span>
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
  const toast = useToast();
  const [note, setNote] = useState('');
  const action = useAction(async () => { await onDone(); onClose(); });

  const submit = async (e) => {
    e.preventDefault();
    const r = await action.run(() => api.createNote({ entityType, recordId, note }));
    if (r) toast('Note recorded in the activity trail.');
  };

  return (
    <Modal title="Add an internal note" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Field
          id="note"
          label="Note"
          required
          hint="Recorded in this record's activity history, attributed to you and timestamped. It is not written onto the record in Zoho CRM — this module has no notes field."
        >
          <textarea rows={4} value={note} onChange={(e2) => setNote(e2.target.value)} maxLength={1000} />
        </Field>
        <p className="field-hint">{note.length} of 1000 characters.</p>
        <FormError error={action.error ? friendlyError(action.error) : null} />
        <FormActions
          busy={action.busy}
          disabled={!note.trim()}
          submitLabel="Record note"
          onCancel={onClose}
        />
      </form>
    </Modal>
  );
}
