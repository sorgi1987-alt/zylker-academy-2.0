import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi, useAction } from '../useApi.js';
import { api, newIdempotencyKey } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import { Card, Loading, ErrorState, useToast } from '../components/Ui.jsx';
import { Field, FormActions, FormError, friendlyError, DATE_MIN, DATE_MAX } from '../components/Form.jsx';

/**
 * New enrolment.
 *
 * Capacity is shown against each intake so the limit is visible before the form
 * is submitted rather than discovered by rejection. The override checkbox is
 * only rendered for a principal holding intake:capacity-override, and — more
 * importantly — the server ignores the flag unless that permission is held, so
 * a hand-crafted request cannot use it.
 */
export default function NewEnrolment() {
  const navigate = useNavigate();
  const toast = useToast();
  const can = useCan();
  const canOverride = can('intake:capacity-override');

  const students = useApi((o) => api.students({ perPage: 100 }, o), []);
  const programmes = useApi((o) => api.programmes({ perPage: 100 }, o), []);
  const intakes = useApi((o) => api.intakes({ perPage: 100 }, o), []);

  const [form, setForm] = useState({
    studentId: '', programmeId: '', intakeId: '', applicationId: '',
    enrolmentDate: '', startDate: ''
  });
  const [override, setOverride] = useState(false);
  const [touched, setTouched] = useState(false);
  const [idempotencyKey] = useState(newIdempotencyKey);

  const set = (k) => (e) => setForm((f) => {
    const next = { ...f, [k]: e.target.value };
    if (k === 'programmeId') next.intakeId = '';
    return next;
  });

  const intakesForProgramme = useMemo(() => {
    if (!form.programmeId || intakes.status !== 'ready') return [];
    return (intakes.data || []).filter(
      (i) => i.programme && String(i.programme.id) === String(form.programmeId)
    );
  }, [form.programmeId, intakes.status, intakes.data]);

  const chosenIntake = intakesForProgramme.find((i) => String(i.id) === String(form.intakeId)) || null;

  const errors = {
    studentId: !form.studentId ? 'Choose a student.' : null,
    programmeId: !form.programmeId ? 'Choose a programme.' : null,
    intakeId: !form.intakeId ? 'Choose an intake.' : null
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const action = useAction();

  const onSubmit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (hasErrors) return;
    const r = await action.run(() => api.createEnrolment({
      studentId: form.studentId,
      programmeId: form.programmeId,
      intakeId: form.intakeId,
      applicationId: form.applicationId || undefined,
      enrolmentDate: form.enrolmentDate || undefined,
      startDate: form.startDate || undefined,
      capacityOverride: override || undefined
    }, { idempotencyKey }));
    if (r) {
      toast('Enrolment created.');
      navigate(`/enrolments/${r.data.id}`, { replace: true });
    }
  };

  const loading = students.status === 'loading' || programmes.status === 'loading' || intakes.status === 'loading';
  const failed = [students, programmes, intakes].find((s) => s.status === 'error');
  if (loading) return <Loading rows={6} label="Loading form data" />;
  if (failed) return <ErrorState error={failed.error} onRetry={failed.reload} />;

  return (
    <>
      <div className="page-head">
        <h1>New enrolment</h1>
        <p>Creates an enrolment in Zoho CRM and sets the student to Active.</p>
      </div>

      <Card>
        <form onSubmit={onSubmit} noValidate>
          <div className="form-grid">
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

            <Field id="programmeId" label="Programme" required error={touched ? errors.programmeId : null}>
              <select value={form.programmeId} onChange={set('programmeId')}>
                <option value="">Choose a programme…</option>
                {(programmes.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>

            <Field
              id="intakeId"
              label="Intake"
              required
              error={touched ? errors.intakeId : null}
              hint={form.programmeId ? 'Only intakes for the chosen programme are listed.' : 'Choose a programme first.'}
            >
              <select value={form.intakeId} onChange={set('intakeId')} disabled={!form.programmeId}>
                <option value="">Choose an intake…</option>
                {intakesForProgramme.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                    {i.capacity === null
                      ? ''
                      : i.full ? ' — full' : ` — ${i.placesRemaining} places left`}
                  </option>
                ))}
              </select>
            </Field>

            <Field id="enrolmentDate" label="Enrolment date" hint="Defaults to today.">
              <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.enrolmentDate} onChange={set('enrolmentDate')} />
            </Field>

            <Field id="startDate" label="Start date">
              <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.startDate} onChange={set('startDate')} />
            </Field>
          </div>

          {chosenIntake && chosenIntake.full && (
            <div className="state" role="status">
              <h3>This intake is full</h3>
              <p>
                {chosenIntake.counts.activeEnrolments} of {chosenIntake.capacity} places are taken.
              </p>
              {canOverride ? (
                <label className="checkbox-row">
                  <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                  I confirm this enrolment should exceed the intake capacity.
                </label>
              ) : (
                <p className="muted">
                  Your role cannot override a capacity limit. Ask an administrator, or
                  increase the capacity on the intake.
                </p>
              )}
            </div>
          )}

          <FormError error={action.error ? friendlyError(action.error) : null} />
          <FormActions
            busy={action.busy}
            submitLabel="Create enrolment"
            onCancel={() => navigate('/enrolments')}
          />
        </form>
      </Card>
    </>
  );
}
