import React from 'react';
import { useT, translate } from '../i18n/I18nContext.jsx';

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
  const t = useT();
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
      <button className="btn primary" type="submit" disabled={busy || disabled}>
        {busy ? t('common.saving') : submitLabel}
      </button>
      {onCancel && <button className="btn" type="button" onClick={onCancel} disabled={busy}>{t('common.cancel')}</button>}
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
    UNAUTHENTICATED: translate('common.errors.sessionEnded'),
    FORBIDDEN: err.requiredPermission
      ? translate('common.errors.notAllowedWithPermission', { permission: err.requiredPermission })
      : translate('common.errors.notAllowed'),
    CONFLICT: translate('common.errors.conflict'),
    NO_MODIFIED_TIME: translate('common.errors.noModifiedTime'),
    DUPLICATE_EMAIL: translate('common.errors.duplicateEmail'),
    DUPLICATE_ENROLMENT: translate('common.errors.duplicateEnrolment'),
    INTAKE_PROGRAMME_MISMATCH: translate('common.errors.intakeProgrammeMismatch'),
    INTAKE_AT_CAPACITY: translate('common.errors.intakeAtCapacity'),
    INVALID_DATE_RANGE: translate('common.errors.invalidDateRange'),
    INVALID_DATE: err.message || translate('common.errors.invalidDateFallback'),
    // Zoho names the field it objected to; safeError() puts that in the message.
    INVALID_DATA: err.message || translate('common.errors.invalidDataFallback'),
    MANDATORY_NOT_FOUND: err.message || translate('common.errors.mandatoryNotFoundFallback'),
    HAS_RELATED_RECORDS: err.message || translate('common.errors.hasRelatedRecordsFallback'),
    HAS_RELATED_ENROLMENT: err.message || translate('common.errors.hasRelatedEnrolmentFallback'),
    RATE_LIMITED: translate('common.errors.rateLimited'),
    NETWORK: translate('common.errors.network'),
    BOOKS_NOT_CONFIGURED: translate('common.errors.booksNotConfigured')
  };
  return map[err.code] || err.message || translate('common.errors.actionFailedFallback');
}
