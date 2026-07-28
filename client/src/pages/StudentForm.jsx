import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, newIdempotencyKey } from '../api.js';
import { useApi, useAction } from '../useApi.js';
import { Card, Loading, ErrorState, useToast } from '../components/Ui.jsx';
import { Field, FormActions, FormError, EMAIL_RE, friendlyError } from '../components/Form.jsx';

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
    lastName: !form.lastName.trim() ? 'A last name is required.' : null,
    email: form.email && !EMAIL_RE.test(form.email.trim()) ? 'Enter a valid email address.' : null
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
      toast(isEdit ? 'Student updated.' : 'Student created.');
      navigate(`/students/${isEdit ? id : result.data.id}`, { replace: true });
    }
  };

  if (isEdit && existing.status === 'loading') return <Loading rows={5} label="Loading student" />;
  if (isEdit && existing.status === 'error') return <ErrorState error={existing.error} onRetry={existing.reload} />;

  return (
    <>
      <div className="page-head">
        <h1>{isEdit ? 'Edit student' : 'Add student'}</h1>
        <p>
          {isEdit
            ? 'Changes are written to the linked Zoho CRM contact record.'
            : 'Creates a contact record in Zoho CRM. Email addresses must be unique.'}
        </p>
      </div>

      <Card>
        <form onSubmit={onSubmit} noValidate>
          <div className="form-grid">
            <Field id="firstName" label="First name">
              <input value={form.firstName} onChange={set('firstName')} autoComplete="given-name" />
            </Field>

            <Field id="lastName" label="Last name" required error={touched ? errors.lastName : null}>
              <input value={form.lastName} onChange={set('lastName')} autoComplete="family-name" required />
            </Field>

            <Field
              id="email"
              label="Email"
              error={touched ? errors.email : null}
              hint="Used to detect duplicate students and to match Zoho Books invoices."
            >
              <input type="email" value={form.email} onChange={set('email')} autoComplete="email" />
            </Field>

            <Field id="studentStatus" label="Status">
              <select value={form.studentStatus} onChange={set('studentStatus')}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <FormError error={action.error ? friendlyError(action.error) : null} />

          <FormActions
            busy={action.busy}
            submitLabel={isEdit ? 'Save changes' : 'Create student'}
            onCancel={() => navigate(isEdit ? `/students/${id}` : '/students')}
          />
        </form>
      </Card>
    </>
  );
}
