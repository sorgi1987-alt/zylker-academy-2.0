import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePagedList, useApi, useAction } from '../useApi.js';
import { api, newIdempotencyKey } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import {
  Async, Card, Pill, Pagination, SearchBox, FilterSelect, SourceBadge, Modal, useToast, fmtDate
} from '../components/Ui.jsx';
import { Field, FormActions, FormError, friendlyError, DATE_MIN, DATE_MAX } from '../components/Form.jsx';

const STATUSES = ['Planning', 'Open', 'Full', 'In Progress', 'Completed', 'Cancelled'];
const DELIVERY = ['On Campus', 'Online', 'Hybrid'];

function NewIntakeDialog({ onClose, onDone }) {
  const toast = useToast();
  const programmes = useApi((o) => api.programmes({ perPage: 100 }, o), []);
  const [form, setForm] = useState({
    name: '', programmeId: '', status: 'Planning', academicYear: '',
    startDate: '', endDate: '', applicationOpenDate: '', applicationDeadline: '',
    capacity: '', deliveryMode: '', location: ''
  });
  const [touched, setTouched] = useState(false);
  const [idempotencyKey] = useState(newIdempotencyKey);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const action = useAction(async (r) => { await onDone(r); onClose(); });

  const errors = {
    name: !form.name.trim() ? 'An intake name is required.' : null,
    programmeId: !form.programmeId ? 'Choose the programme this intake belongs to.' : null,
    // Checked here as well as on the server, so the mistake is caught before a
    // round trip rather than after one.
    endDate: form.startDate && form.endDate && form.endDate < form.startDate
      ? 'The end date cannot be before the start date.' : null,
    applicationDeadline: form.applicationOpenDate && form.applicationDeadline
      && form.applicationDeadline < form.applicationOpenDate
      ? 'The deadline cannot be before the opening date.' : null
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (hasErrors) return;
    const r = await action.run(() => api.createIntake({
      ...form,
      name: form.name.trim(),
      capacity: form.capacity === '' ? undefined : Number(form.capacity),
      location: form.location.trim() || undefined,
      academicYear: form.academicYear.trim() || undefined
    }, { idempotencyKey }));
    if (r) toast('Intake created.');
  };

  return (
    <Modal title="New intake" onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field id="name" label="Intake name" required error={touched ? errors.name : null}>
            <input value={form.name} onChange={set('name')} />
          </Field>
          <Field id="programmeId" label="Programme" required error={touched ? errors.programmeId : null}>
            <select value={form.programmeId} onChange={set('programmeId')}>
              <option value="">Choose a programme…</option>
              {(programmes.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field id="status" label="Status">
            <select value={form.status} onChange={set('status')}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field id="academicYear" label="Academic year">
            <input value={form.academicYear} onChange={set('academicYear')} placeholder="2026/27" />
          </Field>
          <Field id="startDate" label="Start date">
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.startDate} onChange={set('startDate')} />
          </Field>
          <Field id="endDate" label="End date" error={touched ? errors.endDate : null}>
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.endDate} onChange={set('endDate')} />
          </Field>
          <Field id="applicationOpenDate" label="Applications open">
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.applicationOpenDate} onChange={set('applicationOpenDate')} />
          </Field>
          <Field id="applicationDeadline" label="Application deadline" error={touched ? errors.applicationDeadline : null}>
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.applicationDeadline} onChange={set('applicationDeadline')} />
          </Field>
          <Field id="capacity" label="Capacity" hint="Leave blank for no limit.">
            <input type="number" min="0" value={form.capacity} onChange={set('capacity')} />
          </Field>
          <Field id="deliveryMode" label="Delivery method">
            <select value={form.deliveryMode} onChange={set('deliveryMode')}>
              <option value="">Not set</option>
              {DELIVERY.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field id="location" label="Campus or location">
            <input value={form.location} onChange={set('location')} />
          </Field>
        </div>
        <FormError error={action.error ? friendlyError(action.error) : null} />
        <FormActions busy={action.busy} submitLabel="Create intake" onCancel={onClose} />
      </form>
    </Modal>
  );
}

export default function Intakes() {
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const list = usePagedList(api.intakes);

  // Opened by the global Create menu via ?new=1; the flag is cleared once used
  // so Back and refresh do not reopen the dialog. See Programmes for the same
  // pattern.
  const wantsNew = params.get('new') === '1';
  useEffect(() => {
    if (!wantsNew) return;
    if (can('intake:write')) setCreating(true);
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  }, [wantsNew, can, params, setParams]);

  return (
    <>
      <div className="page-head">
        <h1>Intakes</h1>
        <p>Scheduled intakes for each programme, with capacity and enrolment counts.</p>
      </div>

      <Card
        title="All intakes"
        action={(
          <div className="head-actions">
            <SourceBadge source="crm" />
            {can('intake:write') && (
              <button type="button" className="btn primary" onClick={() => setCreating(true)}>New intake</button>
            )}
          </div>
        )}
      >
        <div className="toolbar">
          <SearchBox
            id="intake-search"
            label="Search"
            value={list.search}
            onChange={list.setSearch}
            placeholder="Name, academic year or location"
          />
          <FilterSelect
            id="intake-status"
            label="Status"
            value={list.filters.status || ''}
            onChange={(v) => list.setFilter('status', v)}
            options={STATUSES}
            allLabel="All statuses"
          />
        </div>

        <Async state={list} empty={{ title: 'No intakes match' }}>
          {(rows, meta) => (
            <>
              <div className="t-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Intake</th>
                      <th scope="col">Programme</th>
                      <th scope="col">Status</th>
                      <th scope="col">Starts</th>
                      <th scope="col">Capacity</th>
                      <th scope="col">Applications</th>
                      <th scope="col">Enrolments</th>
                      <th scope="col">Delivery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((i) => (
                      <tr key={i.id}>
                        <td><Link to={`/intakes/${i.id}`}>{i.name}</Link></td>
                        <td>
                          {i.programme
                            ? <Link to={`/programmes/${i.programme.id}`}>{i.programme.name}</Link>
                            : <span className="muted">—</span>}
                        </td>
                        <td>
                          <Pill value={i.status} />
                          {i.full && <span className="pill stop">Full</span>}
                        </td>
                        <td>{fmtDate(i.startDate)}</td>
                        <td className="mono">
                          {/* "Not limited" and a capacity of zero are different
                              things and must not look the same. */}
                          {i.capacity === null
                            ? <span className="muted">Not limited</span>
                            : `${i.counts.activeEnrolments} / ${i.capacity}`}
                        </td>
                        <td className="mono">{i.counts.applications}</td>
                        <td className="mono">{i.counts.enrolments}</td>
                        <td>{i.deliveryMode || <span className="muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

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
        <NewIntakeDialog onClose={() => setCreating(false)} onDone={async () => { await list.reload(); }} />
      )}
    </>
  );
}
