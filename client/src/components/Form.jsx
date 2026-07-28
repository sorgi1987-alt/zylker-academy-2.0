import React from 'react';

/** Labelled field with inline validation message and hint. */
export function Field({ id, label, error, hint, children, required }) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}{required && <span aria-hidden="true" style={{ color: '#b42318' }}> *</span>}
      </label>
      {React.cloneElement(children, {
        id,
        'aria-invalid': error ? 'true' : undefined,
        'aria-describedby': error ? `${id}-err` : (hint ? `${id}-hint` : undefined)
      })}
      {hint && !error && <span className="field-hint" id={`${id}-hint`}>{hint}</span>}
      {error && <span className="field-error" role="alert" id={`${id}-err`}>{error}</span>}
    </div>
  );
}

/** Standard action row for a form: submit + cancel with busy state. */
export function FormActions({ busy, submitLabel, onCancel, disabled }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
      <button className="btn primary" type="submit" disabled={busy || disabled}>
        {busy ? 'Saving…' : submitLabel}
      </button>
      {onCancel && <button className="btn" type="button" onClick={onCancel} disabled={busy}>Cancel</button>}
    </div>
  );
}

/** Server-side failure shown above the form actions. */
export const FormError = ({ error }) =>
  error ? <p className="field-error" role="alert" style={{ marginTop: 10 }}>{error}</p> : null;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Bounds for every date input in the application.
 *
 * A bare `<input type="date">` will happily produce `0006-08-23` when someone
 * mistypes a year, and Zoho CRM answers that with a bare HTTP 400 naming no
 * field. Giving the picker a range makes the browser reject it at the point of
 * entry. The server validates the same rule independently — this is a courtesy,
 * not a control.
 */
export const DATE_MIN = '1900-01-01';
export const DATE_MAX = '2200-12-31';

/**
 * Formats an ApiError for display.
 *
 * The server already returns a sanitised, human-readable message, so this only
 * overrides the handful of codes where a shorter or more actionable sentence
 * helps. Anything unmapped falls through to the server's own wording rather
 * than being replaced by a generic one — a specific error is more useful than
 * a tidy one.
 */
export function friendlyError(err) {
  if (!err) return null;
  const map = {
    UNAUTHENTICATED: 'Your session has ended. Reload the page and sign in again.',
    FORBIDDEN: err.requiredPermission
      ? `Your role does not allow this action (${err.requiredPermission}).`
      : 'Your role does not allow this action.',
    CONFLICT: 'Someone else changed this record while you had it open. Reload to see their version, then reapply your change.',
    NO_MODIFIED_TIME: 'This change could not be applied safely because the record was read incompletely. This is a fault in the application, not something you did.',
    DUPLICATE_EMAIL: 'A student with this email already exists.',
    DUPLICATE_ENROLMENT: 'This student already has an active enrolment for that programme and intake.',
    INTAKE_PROGRAMME_MISMATCH: 'That intake belongs to a different programme.',
    INTAKE_AT_CAPACITY: 'That intake is full. An administrator can confirm an override.',
    INVALID_DATE_RANGE: 'Check the dates: an end date cannot come before its start date.',
    INVALID_DATE: err.message || 'Check the date — it is not a valid calendar date.',
    // Zoho names the field it objected to; safeError() puts that in the message.
    INVALID_DATA: err.message || 'Zoho rejected one of the values. Check the highlighted field.',
    MANDATORY_NOT_FOUND: err.message || 'Zoho requires a value that was not supplied.',
    HAS_RELATED_RECORDS: err.message || 'Other records still depend on this one, so it cannot be deleted.',
    HAS_RELATED_ENROLMENT: err.message || 'An enrolment still depends on this record.',
    RATE_LIMITED: 'Too many changes just now. Wait a moment and try again.',
    NETWORK: 'Could not reach the service. Check your connection and try again.',
    BOOKS_NOT_CONFIGURED: 'Zoho Books is not configured for this deployment.'
  };
  return map[err.code] || err.message || 'The action could not be completed.';
}
