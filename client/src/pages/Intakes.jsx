import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePagedList, useApi, useAction } from '../useApi.js';
import { api, newIdempotencyKey } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import { useT } from '../i18n/I18nContext.jsx';
import {
  Async, Card, Pill, Pagination, SearchBox, FilterSelect, FilterChips, SourceBadge, Modal, ExportCsvButton, useToast, fmtDate
} from '../components/Ui.jsx';
import { Field, FormActions, FormError, friendlyError, DATE_MIN, DATE_MAX } from '../components/Form.jsx';
import { toCsv, downloadCsv } from '../csv.js';

const STATUSES = ['Planning', 'Open', 'Full', 'In Progress', 'Completed', 'Cancelled'];
const DELIVERY = ['On Campus', 'Online', 'Hybrid'];

function NewIntakeDialog({ onClose, onDone }) {
  const t = useT();
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
    name: !form.name.trim() ? t('intakes.newDialog.nameRequired') : null,
    programmeId: !form.programmeId ? t('intakes.newDialog.programmeRequired') : null,
    // Checked here as well as on the server, so the mistake is caught before a
    // round trip rather than after one.
    endDate: form.startDate && form.endDate && form.endDate < form.startDate
      ? t('intakes.newDialog.endDateError') : null,
    applicationDeadline: form.applicationOpenDate && form.applicationDeadline
      && form.applicationDeadline < form.applicationOpenDate
      ? t('intakes.newDialog.applicationDeadlineError') : null
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
    if (r) toast(t('intakes.newDialog.created'));
  };

  return (
    <Modal title={t('intakes.newDialog.title')} onClose={onClose} wide busy={action.busy}>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field id="name" label={t('intakes.newDialog.nameLabel')} required error={touched ? errors.name : null}>
            <input value={form.name} onChange={set('name')} />
          </Field>
          <Field id="programmeId" label={t('intakes.newDialog.programmeLabel')} required error={touched ? errors.programmeId : null}>
            <select value={form.programmeId} onChange={set('programmeId')}>
              <option value="">{t('intakes.newDialog.programmePlaceholder')}</option>
              {(programmes.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field id="status" label={t('intakes.newDialog.statusLabel')}>
            <select value={form.status} onChange={set('status')}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field id="academicYear" label={t('intakes.newDialog.academicYearLabel')}>
            <input value={form.academicYear} onChange={set('academicYear')} placeholder="2026/27" />
          </Field>
          <Field id="startDate" label={t('intakes.newDialog.startDateLabel')}>
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.startDate} onChange={set('startDate')} />
          </Field>
          <Field id="endDate" label={t('intakes.newDialog.endDateLabel')} error={touched ? errors.endDate : null}>
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.endDate} onChange={set('endDate')} />
          </Field>
          <Field id="applicationOpenDate" label={t('intakes.newDialog.applicationOpenLabel')}>
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.applicationOpenDate} onChange={set('applicationOpenDate')} />
          </Field>
          <Field id="applicationDeadline" label={t('intakes.newDialog.applicationDeadlineLabel')} error={touched ? errors.applicationDeadline : null}>
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={form.applicationDeadline} onChange={set('applicationDeadline')} />
          </Field>
          <Field id="capacity" label={t('intakes.newDialog.capacityLabel')} hint={t('intakes.newDialog.capacityHint')}>
            <input type="number" min="0" value={form.capacity} onChange={set('capacity')} />
          </Field>
          <Field id="deliveryMode" label={t('intakes.newDialog.deliveryLabel')}>
            <select value={form.deliveryMode} onChange={set('deliveryMode')}>
              <option value="">{t('intakes.newDialog.notSet')}</option>
              {DELIVERY.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field id="location" label={t('intakes.newDialog.locationLabel')}>
            <input value={form.location} onChange={set('location')} />
          </Field>
        </div>
        <FormError error={action.error ? friendlyError(action.error) : null} />
        <FormActions busy={action.busy} submitLabel={t('intakes.newDialog.submit')} onCancel={onClose} />
      </form>
    </Modal>
  );
}

export default function Intakes() {
  const t = useT();
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const list = usePagedList(api.intakes, {
    initialFilters: {
      status: params.get('status') || undefined,
      capacity: params.get('capacity') || undefined
    }
  });

  /*
   * Capacity filters. Intakes with no capacity recorded are not limited and are
   * excluded from both, rather than being treated as a limit of zero.
   */
  const CAPACITY_OPTIONS = [
    { value: 'at-risk', label: t('intakes.capacityAtRisk') },
    { value: 'full', label: t('intakes.capacityFull') }
  ];
  const capacityLabel = (v) => (CAPACITY_OPTIONS.find((o) => o.value === v) || {}).label || v;

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

  // This page has no column picker (unlike Students/Applications/Programmes)
  // so the export always mirrors the one, fixed table exactly.
  const exportIntakes = async () => {
    const res = await api.intakes({ ...list.params, page: 1, perPage: 200 });
    const columns = [
      { label: t('intakes.table.intake'), value: (i) => i.name },
      { label: t('intakes.table.programme'), value: (i) => (i.programme ? i.programme.name : '') },
      { label: t('intakes.table.status'), value: (i) => i.status || '' },
      { label: t('intakes.table.starts'), value: (i) => fmtDate(i.startDate) },
      { label: t('intakes.table.capacity'), value: (i) => (i.capacity === null ? '' : `${i.counts.activeEnrolments} / ${i.capacity}`) },
      { label: t('intakes.table.applications'), value: (i) => i.counts.applications },
      { label: t('intakes.table.enrolments'), value: (i) => i.counts.enrolments },
      { label: t('intakes.table.delivery'), value: (i) => i.deliveryMode || '' }
    ];
    downloadCsv('intakes.csv', toCsv(res.data || [], columns));
  };

  return (
    <>
      <div className="page-head">
        <h1>{t('intakes.pageTitle')}</h1>
      </div>

      <Card
        title={t('intakes.allIntakes')}
        action={(
          <div className="head-actions">
            <SourceBadge source="crm" />
            <ExportCsvButton onExport={exportIntakes} />
            {can('intake:write') && (
              <button type="button" className="btn primary" onClick={() => setCreating(true)}>{t('intakes.newIntake')}</button>
            )}
          </div>
        )}
      >
        <div className="toolbar">
          <SearchBox
            id="intake-search"
            label={t('common.search')}
            value={list.search}
            onChange={list.setSearch}
            placeholder={t('intakes.searchPlaceholder')}
          />
          <FilterSelect
            id="intake-status"
            label={t('intakes.statusLabel')}
            value={list.filters.status || ''}
            onChange={(v) => list.setFilter('status', v)}
            options={STATUSES}
            allLabel={t('intakes.allStatuses')}
          />
          <FilterSelect
            id="intake-capacity"
            label={t('intakes.capacityLabel')}
            value={list.filters.capacity || ''}
            onChange={(v) => list.setFilter('capacity', v)}
            options={CAPACITY_OPTIONS}
            allLabel={t('intakes.anyLabel')}
          />
        </div>

        <FilterChips
          chips={[
            list.filters.status && {
              key: 'status', label: t('intakes.statusLabel'), value: list.filters.status,
              onClear: () => list.setFilter('status', '')
            },
            list.filters.capacity && {
              key: 'capacity', label: t('intakes.capacityLabel'), value: capacityLabel(list.filters.capacity),
              onClear: () => list.setFilter('capacity', '')
            },
            list.search && {
              key: 'search', label: t('common.search'), value: list.search,
              onClear: () => list.setSearch('')
            }
          ]}
          onClearAll={list.clearFilters}
        />

        <Async state={list} empty={{ title: t('intakes.noMatch') }}>
          {(rows, meta) => (
            <>
              <div className="t-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t('intakes.table.intake')}</th>
                      <th scope="col">{t('intakes.table.programme')}</th>
                      <th scope="col">{t('intakes.table.status')}</th>
                      <th scope="col">{t('intakes.table.starts')}</th>
                      <th scope="col">{t('intakes.table.capacity')}</th>
                      <th scope="col">{t('intakes.table.applications')}</th>
                      <th scope="col">{t('intakes.table.enrolments')}</th>
                      <th scope="col">{t('intakes.table.delivery')}</th>
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
                          {i.full && <span className="pill stop">{t('intakes.fullBadge')}</span>}
                        </td>
                        <td>{fmtDate(i.startDate)}</td>
                        <td className="mono">
                          {/* "Not limited" and a capacity of zero are different
                              things and must not look the same. */}
                          {i.capacity === null
                            ? <span className="muted">{t('intakes.notLimited')}</span>
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

              {meta.capped && (
                <p className="note">
                  {t('intakes.showingRecent', { total: meta.total })}
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
        <NewIntakeDialog onClose={() => setCreating(false)} onDone={async () => { await list.reload(); }} />
      )}
    </>
  );
}
