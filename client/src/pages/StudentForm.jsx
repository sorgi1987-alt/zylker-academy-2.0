import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, newIdempotencyKey } from '../api.js';
import { useApi, useAction } from '../useApi.js';
import { useT } from '../i18n/I18nContext.jsx';
import { Card, Loading, ErrorState, useToast } from '../components/Ui.jsx';
import { Field, FormActions, FormError, EMAIL_RE, friendlyError } from '../components/Form.jsx';

// Live CRM status values, also sent back as the studentStatus payload — left
// untranslated (see Students.jsx).
const STATUSES = ['Applicant', 'Active', 'Withdrawn', 'Alumni'];

/**
 * Create and edit a student. One component for both, because the fields and
 * validation are identical and keeping them in step across two files is exactly
 * the kind of drift that produces a form which can create an invalid record but
 * not edit one.
 *
 * On edit the record's `modifiedTime` is sent back as `expectedModifiedTime`,
 * so a save that would overwrite someone else's concurrent change is refused by
 * the server with 409 rather than silently winning.
 */
export default function StudentForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const t = useT();

  const existing = useApi(
    (o) => (isEdit ? api.student(id, o) : Promise.resolve({ data: null, meta: {} })),
    [id, isEdit]
  );

  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', studentStatus: 'Applicant' });
  const [touched, setTouched] = useState(false);
  const [expectedModifiedTime, setExpectedModifiedTime] = useState(null);
  const [idempotencyKey] = useState(newIdempotencyKey);

  useEffect(() => {
    if (!isEdit || existing.status !== 'ready' || !existing.data) return;
    const s = existing.data.student;
    setForm({
      firstName: s.firstName || '',
      lastName: s.lastName || '',
      email: s.email || '',
      studentStatus: s.status || 'Applicant'
    });
    setExpectedModifiedTime(s.modifiedTime || null);
  }, [existing.status, existing.data, isEdit]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const errors = {
    lastName: !form.lastName.trim() ? t('studentForm.lastNameRequired') : null,
    email: form.email && !EMAIL_RE.test(form.email.trim()) ? t('studentForm.emailInvalid') : null
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const action = useAction();

  const onSubmit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (hasErrors) return;

    const payload = {
      firstName: form.firstName.trim() || undefined,
      lastName: form.lastName.trim(),
      email: form.email.trim() || undefined,
      studentStatus: form.studentStatus
    };

    const result = await action.run(() => (isEdit
      ? api.updateStudent(id, { ...payload, expectedModifiedTime })
      : api.createStudent(payload, { idempotencyKey })));

    if (result) {
      toast(isEdit ? t('studentForm.toastUpdated') : t('studentForm.toastCreated'));
      navigate(`/students/${isEdit ? id : result.data.id}`, { replace: true });
    }
  };

  if (isEdit && existing.status === 'loading') return <Loading rows={5} label={t('studentForm.loadingStudent')} />;
  if (isEdit && existing.status === 'error') return <ErrorState error={existing.error} onRetry={existing.reload} />;

  return (
    <>
      <div className="page-head">
        <h1>{isEdit ? t('studentForm.editTitle') : t('studentForm.addTitle')}</h1>
        <p>
          {isEdit
            ? t('studentForm.editIntro')
            : t('studentForm.addIntro')}
        </p>
      </div>

      <Card>
        <form onSubmit={onSubmit} noValidate>
          <div className="form-grid">
            <Field id="firstName" label={t('studentForm.firstName')}>
              <input value={form.firstName} onChange={set('firstName')} autoComplete="given-name" />
            </Field>

            <Field id="lastName" label={t('studentForm.lastName')} required error={touched ? errors.lastName : null}>
              <input value={form.lastName} onChange={set('lastName')} autoComplete="family-name" required />
            </Field>

            <Field
              id="email"
              label={t('studentForm.email')}
              error={touched ? errors.email : null}
              hint={t('studentForm.emailHint')}
            >
              <input type="email" value={form.email} onChange={set('email')} autoComplete="email" />
            </Field>

            <Field id="studentStatus" label={t('studentForm.status')}>
              <select value={form.studentStatus} onChange={set('studentStatus')}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <FormError error={action.error ? friendlyError(action.error) : null} />

          <FormActions
            busy={action.busy}
            submitLabel={isEdit ? t('studentForm.saveChanges') : t('studentForm.createStudent')}
            onCancel={() => navigate(isEdit ? `/students/${id}` : '/students')}
          />
        </form>
      </Card>
    </>
  );
}
