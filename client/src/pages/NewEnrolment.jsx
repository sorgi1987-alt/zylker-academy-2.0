import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApi, useAction } from '../useApi.js';
import { api, newIdempotencyKey } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import { useT } from '../i18n/I18nContext.jsx';
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
  const t = useT();
  const navigate = useNavigate();
  const toast = useToast();
  const can = useCan();
  const canOverride = can('intake:capacity-override');

  const students = useApi((o) => api.students({ perPage: 100 }, o), []);
  const programmes = useApi((o) => api.programmes({ perPage: 100 }, o), []);
  const intakes = useApi((o) => api.intakes({ perPage: 100 }, o), []);

  // Pre-selected when arriving from a student's record, so the person is not
  // asked to find in a dropdown the student they were just looking at.
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    studentId: params.get('studentId') || '',
    programmeId: '', intakeId: '', applicationId: '',
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
    studentId: !form.studentId ? t('newEnrolment.errors.chooseStudent') : null,
    programmeId: !form.programmeId ? t('newEnrolment.errors.chooseProgramme') : null,
    intakeId: !form.intakeId ? t('newEnrolment.errors.chooseIntake') : null
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const blockedByCapacity = Boolean(chosenIntake && chosenIntake.full && !(canOverride && override));

  const action = useAction();

  const onSubmit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (hasErrors || blockedByCapacity) return;
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
      toast(t('newEnrolment.createdToast'));
      navigate(`/enrolments/${r.data.id}`, { replace: true });
    }
  };

  const loading = students.status === 'loading' || programmes.status === 'loading' || intakes.status === 'loading';
  const failed = [students, programmes, intakes].find((s) => s.status === 'error');
  if (loading) return <Loading rows={6} label={t('newEnrolment.loadingForm')} />;
  if (failed) return <ErrorState error={failed.error} onRetry={failed.reload} />;

  return (
    <>
      <div className="page-head">
        <h1>{t('newEnrolment.pageTitle')}</h1>
        <p>{t('newEnrolment.pageIntro')}</p>
      </div>

      <Card>
        <form onSubmit={onSubmit} noValidate>
          <div className="form-grid">
            <Field id="studentId" label={t('newEnrolment.student')} required error={touched ? errors.studentId : null}>
              <select value={form.studentId} onChange={set('studentId')}>
                <option value="">{t('newEnrolment.chooseStudent')}</option>
                {(students.data || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName || t('newEnrolment.unnamed')}{s.email ? ` — ${s.email}` : ''}
                  </option>
                ))}
              </select>
            </Field>

            <Field id="programmeId" label={t('newEnrolment.programme')} required error={touched ? errors.programmeId : null}>
              <select value={form.programmeId} onChange={set('programmeId')}>
                <option value="">{t('newEnrolment.chooseProgramme')}</option>
                {(programmes.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>

            <Field
              id="intakeId"
              label={t('newEnrolment.intake')}
              required
              error={touched ? errors.intakeId : null}
              hint={form.programmeId ? t('newEnrolment.intakeHintFiltered') : t('newEnrolment.intakeHintNoProgramme')}
            >
              <select value={form.intakeId} onChange={set('intakeId')} disabled={!form.programmeId}>
                <option value="">{t('newEnrolment.chooseIntake')}</option>
                {intakesForProgramme.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                    {i.capacity === null
                      ? ''
                      : i.full ? ` — ${t('newEnrolment.full')}` : ` — ${t('newEnrolment.placesLeft', { count: i.placesRemaining })}`}
                  </option>
                ))}
              </select>
            </Field>

            <Field id="enrolmentDate" label={t('newEnrolment.enrolmentDate')} hint={t('newEnrolment.enrolmentDateHint')}>
              <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.enrolmentDate} onChange={set('enrolmentDate')} />
            </Field>

            <Field id="startDate" label={t('newEnrolment.startDate')}>
              <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.startDate} onChange={set('startDate')} />
            </Field>
          </div>

          {chosenIntake && chosenIntake.full && (
            <div className="state" role="status">
              <h3>{t('newEnrolment.fullIntake.title')}</h3>
              <p>
                {t('newEnrolment.fullIntake.placesTaken', { used: chosenIntake.counts.activeEnrolments, capacity: chosenIntake.capacity })}
              </p>
              {canOverride ? (
                <label className="checkbox-row">
                  <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                  {t('newEnrolment.fullIntake.overrideLabel')}
                </label>
              ) : (
                <p className="muted">
                  {t('newEnrolment.fullIntake.cannotOverride')}
                </p>
              )}
            </div>
          )}

          <FormError error={action.error ? friendlyError(action.error) : null} />
          <FormActions
            busy={action.busy}
            disabled={blockedByCapacity}
            submitLabel={t('newEnrolment.createEnrolment')}
            onCancel={() => navigate('/enrolments')}
          />
        </form>
      </Card>
    </>
  );
}
