import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePagedList, useAction } from '../useApi.js';
import { api, newIdempotencyKey } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import {
  Async, Card, Pill, Pagination, SearchBox, FilterSelect, SourceBadge, Modal, useToast, fmtMoney
} from '../components/Ui.jsx';
import { Field, FormActions, FormError, friendlyError } from '../components/Form.jsx';

const LEVELS = ['Foundation', 'Certificate', 'Diploma', 'Undergraduate', 'Postgraduate', 'Professional', 'Other'];
const STATUSES = ['Draft', 'Open for Applications', 'Running', 'Suspended', 'Archived'];

function NewProgrammeDialog({ onClose, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: '', status: 'Draft', academicLevel: '', department: '', award: '',
    durationValue: '', durationUnit: '', tuitionFee: '', lmsCourseId: '', lmsCourseUrl: ''
  });
  const [touched, setTouched] = useState(false);
  const [idempotencyKey] = useState(newIdempotencyKey);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const action = useAction(async (r) => { await onDone(r); onClose(); });

  const nameError = !form.name.trim() ? 'A programme name is required.' : null;

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (nameError) return;
    const r = await action.run(() => api.createProgramme({
      name: form.name.trim(),
      status: form.status || undefined,
      academicLevel: form.academicLevel || undefined,
      department: form.department.trim() || undefined,
      award: form.award.trim() || undefined,
      durationValue: form.durationValue === '' ? undefined : Number(form.durationValue),
      durationUnit: form.durationUnit || undefined,
      tuitionFee: form.tuitionFee === '' ? undefined : Number(form.tuitionFee),
      lmsCourseId: form.lmsCourseId.trim() || undefined,
      lmsCourseUrl: form.lmsCourseUrl.trim() || undefined
    }, { idempotencyKey }));
    if (r) toast('Programme created.');
  };

  return (
    <Modal title="New programme" onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field id="name" label="Programme name" required error={touched ? nameError : null}>
            <input value={form.name} onChange={set('name')} />
          </Field>
          <Field id="status" label="Status">
            <select value={form.status} onChange={set('status')}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field id="academicLevel" label="Academic level">
            <select value={form.academicLevel} onChange={set('academicLevel')}>
              <option value="">Not set</option>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>
          <Field id="department" label="Department">
            <input value={form.department} onChange={set('department')} />
          </Field>
          <Field id="award" label="Award or certificate">
            <input value={form.award} onChange={set('award')} />
          </Field>
          <Field id="durationValue" label="Duration">
            <input type="number" min="0" value={form.durationValue} onChange={set('durationValue')} />
          </Field>
          <Field id="durationUnit" label="Duration unit" hint="For example Months or Weeks.">
            <input value={form.durationUnit} onChange={set('durationUnit')} />
          </Field>
          <Field id="tuitionFee" label="Tuition fee">
            <input type="number" min="0" value={form.tuitionFee} onChange={set('tuitionFee')} />
          </Field>
          <Field
            id="lmsCourseId"
            label="LMS course id"
            hint="Normally written by the LMS connector when a course is synced. Set it here only to record a course this connector does not hold."
          >
            <input value={form.lmsCourseId} onChange={set('lmsCourseId')} />
          </Field>
          <Field id="lmsCourseUrl" label="LMS course URL">
            <input value={form.lmsCourseUrl} onChange={set('lmsCourseUrl')} />
          </Field>
        </div>
        <FormError error={action.error ? friendlyError(action.error) : null} />
        <FormActions busy={action.busy} submitLabel="Create programme" onCancel={onClose} />
      </form>
    </Modal>
  );
}

export default function Programmes() {
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const list = usePagedList(api.programmes, {
    initialFilters: { active: params.get('active') || undefined }
  });

  /*
   * The global Create menu links here with ?new=1 rather than to a separate
   * route, so the one working programme form is reused instead of duplicated.
   * The flag is removed once consumed, so Back does not reopen the dialog and a
   * refresh does not either.
   */
  const wantsNew = params.get('new') === '1';
  useEffect(() => {
    if (!wantsNew) return;
    if (can('programme:write')) setCreating(true);
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  }, [wantsNew, can, params, setParams]);

  return (
    <>
      <div className="page-head">
        <h1>Programmes</h1>
        <p>Programmes of study held in Zoho CRM, with their intakes, applications and enrolments.</p>
      </div>

      <Card
        title="All programmes"
        action={(
          <div className="head-actions">
            <SourceBadge source="crm" />
            {can('programme:write') && (
              <button type="button" className="btn primary" onClick={() => setCreating(true)}>
                New programme
              </button>
            )}
          </div>
        )}
      >
        <div className="toolbar">
          <SearchBox
            id="programme-search"
            label="Search"
            value={list.search}
            onChange={list.setSearch}
            placeholder="Name, code or department"
          />
          <FilterSelect
            id="programme-active"
            label="Availability"
            value={list.filters.active || ''}
            onChange={(v) => list.setFilter('active', v)}
            options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]}
            allLabel="All"
          />
        </div>

        <Async state={list} empty={{ title: 'No programmes match' }}>
          {(rows, meta) => (
            <>
              <div className="t-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Programme</th>
                      <th scope="col">Code</th>
                      <th scope="col">Level</th>
                      <th scope="col">Status</th>
                      <th scope="col">Fee</th>
                      <th scope="col">Intakes</th>
                      <th scope="col">Enrolments</th>
                      <th scope="col">LMS course</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id}>
                        <td><Link to={`/programmes/${p.id}`}>{p.name}</Link></td>
                        <td className="mono">{p.code || <span className="muted">—</span>}</td>
                        <td>{p.academicLevel || <span className="muted">—</span>}</td>
                        <td>
                          <Pill value={p.status} />
                          {!p.active && <span className="pill mute">Inactive</span>}
                        </td>
                        <td className="mono">{fmtMoney(p.tuitionFee)}</td>
                        <td className="mono">{p.counts.intakes}</td>
                        <td className="mono">{p.counts.enrolments}</td>
                        <td>
                          {p.lmsCourse
                            ? <Link to={`/learning/courses/${p.lmsCourse.id}`}>{p.lmsCourse.name}</Link>
                            : <span className="muted">Not mapped</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {meta.lmsDemonstrationDataset && (
                <p className="note">
                  The LMS course column comes from the external LMS connector, a
                  demonstration dataset in Catalyst. Programme data is from Zoho CRM and is
                  unaffected if the connector is unavailable.
                </p>
              )}

              <Pagination
                page={meta.page}
                totalPages={meta.totalPages}
                total={meta.total}
                onPage={list.setPage}
                busy={list.status === 'loading'}
              />
            </>
          )}
        </Async>
      </Card>

      {creating && (
        <NewProgrammeDialog
          onClose={() => setCreating(false)}
          onDone={async () => { await list.reload(); }}
        />
      )}
    </>
  );
}
