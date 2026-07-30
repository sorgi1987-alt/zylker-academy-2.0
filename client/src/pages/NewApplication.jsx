import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApi, useAction } from '../useApi.js';
import { api, newIdempotencyKey } from '../api.js';
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
    studentId: mode === 'existing' && !form.studentId ? 'Choose a student.' : null,
    lastName: mode === 'new' && !form.lastName.trim() ? 'A last name is required.' : null,
    email: mode === 'new'
      ? (!form.email.trim()
        ? 'An email is required to resolve or create the student.'
        : (!EMAIL_RE.test(form.email.trim()) ? 'Enter a valid email address.' : null))
      : null,
    programmeId: !form.programmeId ? 'Choose a programme.' : null
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
      toast('Application created.');
      navigate(`/applications/${r.data.id}`, { replace: true });
    }
  };

  const loading = students.status === 'loading' || programmes.status === 'loading' || intakes.status === 'loading';
  const failed = [students, programmes, intakes].find((s) => s.status === 'error');

  if (loading) return <Loading rows={6} label="Loading form data" />;
  if (failed) return <ErrorState error={failed.error} onRetry={failed.reload} />;

  return (
    <>
      <div className="page-head">
        <h1>New application</h1>
        <p>Creates an application in Zoho CRM at the Submitted stage.</p>
      </div>

      <Card>
        <form onSubmit={onSubmit} noValidate>
          <fieldset className="fieldset">
            <legend>Applicant</legend>
            <div className="radio-row" role="radiogroup" aria-label="Applicant source">
              <label>
                <input
                  type="radio"
                  name="applicant-mode"
                  checked={mode === 'existing'}
                  onChange={() => setMode('existing')}
                />
                Existing student
              </label>
              <label>
                <input
                  type="radio"
                  name="applicant-mode"
                  checked={mode === 'new'}
                  onChange={() => setMode('new')}
                />
                New student
              </label>
            </div>

            {mode === 'existing' ? (
              <Field id="studentId" label="Student" required error={touched ? errors.studentId : null}>
                <select value={form.studentId} onChange={set('studentId')}>
                  <option value="">Choose a student…</option>
                  {(students.data || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName || 'Unnamed'}{s.email ? ` — ${s.email}` : ''}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <div className="form-grid">
                <Field id="firstName" label="First name">
                  <input value={form.firstName} onChange={set('firstName')} autoComplete="given-name" />
                </Field>
                <Field id="lastName" label="Last name" required error={touched ? errors.lastName : null}>
                  <input value={form.lastName} onChange={set('lastName')} autoComplete="family-name" />
                </Field>
                <Field
                  id="email"
                  label="Email"
                  required
                  error={touched ? errors.email : null}
                  hint="If a student already exists with this email, that record is reused rather than duplicated."
                >
                  <input type="email" value={form.email} onChange={set('email')} autoComplete="email" />
                </Field>
              </div>
            )}
          </fieldset>

          <fieldset className="fieldset">
            <legend>Programme and intake</legend>
            <div className="form-grid">
              <Field id="programmeId" label="Programme" required error={touched ? errors.programmeId : null}>
                <select value={form.programmeId} onChange={set('programmeId')}>
                  <option value="">Choose a programme…</option>
                  {(programmes.data || []).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </Field>

              <Field
                id="intakeId"
                label="Intake"
                hint={form.programmeId
                  ? 'Only intakes belonging to the chosen programme are listed.'
                  : 'Choose a programme first.'}
              >
                <select value={form.intakeId} onChange={set('intakeId')} disabled={!form.programmeId}>
                  <option value="">No intake yet</option>
                  {intakesForProgramme.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}{i.full ? ' — full' : i.placesRemaining !== null ? ` — ${i.placesRemaining} places left` : ''}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </fieldset>

          <fieldset className="fieldset">
            <legend>Details</legend>
            <div className="form-grid">
              <Field id="applicationDate" label="Application date" hint="Defaults to today.">
                <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.applicationDate} onChange={set('applicationDate')} />
              </Field>
              <Field id="closingDate" label="Expected decision date">
                <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.closingDate} onChange={set('closingDate')} />
              </Field>
              <Field id="tuitionFee" label="Tuition fee">
                <input type="number" min="0" step="1" value={form.tuitionFee} onChange={set('tuitionFee')} />
              </Field>
              <Field id="studyMode" label="Preferred study mode">
                <input value={form.studyMode} onChange={set('studyMode')} />
              </Field>
            </div>
          </fieldset>

          <FormError error={action.error ? friendlyError(action.error) : null} />
          <FormActions
            busy={action.busy}
            submitLabel="Create application"
            onCancel={() => navigate('/applications')}
          />
        </form>
      </Card>
    </>
  );
}
