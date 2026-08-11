import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApi, useAction } from '../useApi.js';
import { api, newIdempotencyKey } from '../api.js';
import { useT } from '../i18n/I18nContext.jsx';
import { Card, Loading, ErrorState, useToast } from '../components/Ui.jsx';
import { Field, FormActions, FormError, EMAIL_RE, friendlyError, DATE_MIN, DATE_MAX } from '../components/Form.jsx';

/**
 * New application.
 *
 * The applicant is chosen in one of two ways: pick an existing student, or
 * enter a new one. "New" does not mean "create unconditionally" — the server
 * resolves the email against existing students first and reuses the match, so a
 * second application for someone already on file cannot silently produce a
 * duplicate student record.
 *
 * Intakes are filtered to the chosen programme in the form AND validated
 * server-side, because a stale option list in a long-lived tab would otherwise
 * be able to submit a mismatched pair.
 */
export default function NewApplication() {
  const t = useT();
  const navigate = useNavigate();
  const toast = useToast();

  const students = useApi((o) => api.students({ perPage: 100 }, o), []);
  const programmes = useApi((o) => api.programmes({ perPage: 100, active: 'true' }, o), []);
  const intakes = useApi((o) => api.intakes({ perPage: 100 }, o), []);

  // Pre-selected when arriving from a student's record.
  const [params] = useSearchParams();
  const [mode, setMode] = useState('existing');   // existing | new
  const [form, setForm] = useState({
    studentId: params.get('studentId') || '',
    firstName: '', lastName: '', email: '',
    programmeId: '', intakeId: '', applicationDate: '', closingDate: '', tuitionFee: '', studyMode: ''
  });
  const [touched, setTouched] = useState(false);
  const [idempotencyKey] = useState(newIdempotencyKey);

  const set = (k) => (e) => setForm((f) => {
    const next = { ...f, [k]: e.target.value };
    // Changing the programme invalidates the chosen intake.
    if (k === 'programmeId') next.intakeId = '';
    return next;
  });

  const intakesForProgramme = useMemo(() => {
    if (!form.programmeId || intakes.status !== 'ready') return [];
    return (intakes.data || []).filter(
      (i) => i.programme && String(i.programme.id) === String(form.programmeId)
    );
  }, [form.programmeId, intakes.status, intakes.data]);

  const errors = {
    studentId: mode === 'existing' && !form.studentId ? t('newApplication.studentRequiredError') : null,
    lastName: mode === 'new' && !form.lastName.trim() ? t('newApplication.lastNameRequiredError') : null,
    email: mode === 'new'
      ? (!form.email.trim()
        ? t('newApplication.emailRequiredError')
        : (!EMAIL_RE.test(form.email.trim()) ? t('newApplication.emailInvalidError') : null))
      : null,
    programmeId: !form.programmeId ? t('newApplication.programmeRequiredError') : null
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const action = useAction();

  const onSubmit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (hasErrors) return;

    const payload = {
      programmeId: form.programmeId,
      intakeId: form.intakeId || undefined,
      applicationDate: form.applicationDate || undefined,
      closingDate: form.closingDate || undefined,
      tuitionFee: form.tuitionFee === '' ? undefined : Number(form.tuitionFee),
      studyMode: form.studyMode || undefined,
      ...(mode === 'existing'
        ? { studentId: form.studentId }
        : { firstName: form.firstName.trim() || undefined, lastName: form.lastName.trim(), email: form.email.trim() })
    };

    const r = await action.run(() => api.createApplication(payload, { idempotencyKey }));
    if (r) {
      toast(t('newApplication.createdToast'));
      navigate(`/applications/${r.data.id}`, { replace: true });
    }
  };

  const loading = students.status === 'loading' || programmes.status === 'loading' || intakes.status === 'loading';
  const failed = [students, programmes, intakes].find((s) => s.status === 'error');

  if (loading) return <Loading rows={6} label={t('newApplication.loadingLabel')} />;
  if (failed) return <ErrorState error={failed.error} onRetry={failed.reload} />;

  return (
    <>
      <div className="page-head">
        <h1>{t('newApplication.pageTitle')}</h1>
        <p>{t('newApplication.pageIntro')}</p>
      </div>

      <Card>
        <form onSubmit={onSubmit} noValidate>
          <fieldset className="fieldset">
            <legend>{t('newApplication.applicantLegend')}</legend>
            <div className="radio-row" role="radiogroup" aria-label={t('newApplication.applicantSourceLabel')}>
              <label>
                <input
                  type="radio"
                  name="applicant-mode"
                  checked={mode === 'existing'}
                  onChange={() => setMode('existing')}
                />
                {t('newApplication.existingStudent')}
              </label>
              <label>
                <input
                  type="radio"
                  name="applicant-mode"
                  checked={mode === 'new'}
                  onChange={() => setMode('new')}
                />
                {t('newApplication.newStudent')}
              </label>
            </div>

            {mode === 'existing' ? (
              <Field id="studentId" label={t('newApplication.studentLabel')} required error={touched ? errors.studentId : null}>
                <select value={form.studentId} onChange={set('studentId')}>
                  <option value="">{t('newApplication.studentPlaceholder')}</option>
                  {(students.data || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName || t('newApplication.unnamedStudent')}{s.email ? ` — ${s.email}` : ''}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <div className="form-grid">
                <Field id="firstName" label={t('newApplication.firstNameLabel')}>
                  <input value={form.firstName} onChange={set('firstName')} autoComplete="given-name" />
                </Field>
                <Field id="lastName" label={t('newApplication.lastNameLabel')} required error={touched ? errors.lastName : null}>
                  <input value={form.lastName} onChange={set('lastName')} autoComplete="family-name" />
                </Field>
                <Field
                  id="email"
                  label={t('newApplication.emailLabel')}
                  required
                  error={touched ? errors.email : null}
                  hint={t('newApplication.emailHint')}
                >
                  <input type="email" value={form.email} onChange={set('email')} autoComplete="email" />
                </Field>
              </div>
            )}
          </fieldset>

          <fieldset className="fieldset">
            <legend>{t('newApplication.programmeIntakeLegend')}</legend>
            <div className="form-grid">
              <Field id="programmeId" label={t('newApplication.programmeLabel')} required error={touched ? errors.programmeId : null}>
                <select value={form.programmeId} onChange={set('programmeId')}>
                  <option value="">{t('newApplication.programmePlaceholder')}</option>
                  {(programmes.data || []).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </Field>

              <Field
                id="intakeId"
                label={t('newApplication.intakeLabel')}
                hint={form.programmeId
                  ? t('newApplication.intakeHintFiltered')
                  : t('newApplication.intakeHintChooseProgramme')}
              >
                <select value={form.intakeId} onChange={set('intakeId')} disabled={!form.programmeId}>
                  <option value="">{t('newApplication.intakeNoneYet')}</option>
                  {intakesForProgramme.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}{i.full ? t('newApplication.intakeFullSuffix') : i.placesRemaining !== null ? t('newApplication.intakePlacesLeftSuffix', { count: i.placesRemaining }) : ''}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </fieldset>

          <fieldset className="fieldset">
            <legend>{t('newApplication.detailsLegend')}</legend>
            <div className="form-grid">
              <Field id="applicationDate" label={t('newApplication.applicationDateLabel')} hint={t('newApplication.applicationDateHint')}>
                <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.applicationDate} onChange={set('applicationDate')} />
              </Field>
              <Field id="closingDate" label={t('newApplication.closingDateLabel')}>
                <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.closingDate} onChange={set('closingDate')} />
              </Field>
              <Field id="tuitionFee" label={t('newApplication.tuitionFeeLabel')}>
                <input type="number" min="0" step="1" value={form.tuitionFee} onChange={set('tuitionFee')} />
              </Field>
              <Field id="studyMode" label={t('newApplication.studyModeLabel')}>
                <input value={form.studyMode} onChange={set('studyMode')} />
              </Field>
            </div>
          </fieldset>

          <FormError error={action.error ? friendlyError(action.error) : null} />
          <FormActions
            busy={action.busy}
            submitLabel={t('newApplication.submitLabel')}
            onCancel={() => navigate('/applications')}
          />
        </form>
      </Card>
    </>
  );
}
