import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePagedList, useApi, useAction, useDebounced } from '../useApi.js';
import { api, newIdempotencyKey } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import { useT } from '../i18n/I18nContext.jsx';
import {
  Async, Card, Pill, Pagination, FilterChips, SourceBadge, Modal, ConfirmDialog, ExportCsvButton, useToast, fmtDate
} from '../components/Ui.jsx';
import { Field, FormActions, FormError, friendlyError, DATE_MIN, DATE_MAX } from '../components/Form.jsx';
import { useViews, useViewDraft, ViewSelect, ViewFilterPanel, liveConditions } from '../components/ViewManager.jsx';
import { INTAKE_FIELDS } from '../viewFields.js';
import { toCsv, downloadCsv } from '../csv.js';

const STATUSES = ['Planning', 'Open', 'Full', 'In Progress', 'Completed', 'Cancelled'];
const DELIVERY = ['On Campus', 'Online', 'Hybrid'];

// Matches the table this page has always rendered.
const DEFAULT_COLUMNS = ['programme', 'status', 'startDate', 'capacity', 'applicationCount', 'enrolmentCount', 'deliveryMode'];

// Export mirrors the table exactly — one entry per optional column, plus the
// primary (intake) column added separately since it's never optional.
const EXPORT_COLUMNS = {
  programme: { labelKey: 'intakes.table.programme', value: (i) => (i.programme ? i.programme.name : '') },
  status: { labelKey: 'intakes.table.status', value: (i) => i.status || '' },
  academicYear: { labelKey: 'views.fields.intake.academicYear', value: (i) => i.academicYear || '' },
  startDate: { labelKey: 'intakes.table.starts', value: (i) => fmtDate(i.startDate) },
  endDate: { labelKey: 'views.fields.intake.endDate', value: (i) => fmtDate(i.endDate) },
  applicationOpenDate: { labelKey: 'views.fields.intake.applicationOpenDate', value: (i) => fmtDate(i.applicationOpenDate) },
  applicationDeadline: { labelKey: 'views.fields.intake.applicationDeadline', value: (i) => fmtDate(i.applicationDeadline) },
  capacity: { labelKey: 'intakes.table.capacity', value: (i) => (i.capacity === null ? '' : `${i.counts.activeEnrolments} / ${i.capacity}`) },
  deliveryMode: { labelKey: 'intakes.table.delivery', value: (i) => i.deliveryMode || '' },
  location: { labelKey: 'views.fields.intake.location', value: (i) => i.location || '' },
  applicationCount: { labelKey: 'intakes.table.applications', value: (i) => i.counts.applications },
  enrolmentCount: { labelKey: 'intakes.table.enrolments', value: (i) => i.counts.enrolments }
};

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
  const views = useViews('zylker.views.intakes');
  const [draft, setDraft] = useViewDraft(views.activeView, DEFAULT_COLUMNS);
  const [deletingViewId, setDeletingViewId] = useState(null);

  const debouncedConditions = useDebounced(draft.conditions, 350);
  useEffect(() => {
    const c = liveConditions(debouncedConditions);
    list.setFilter('conditions', c.length ? JSON.stringify(c) : undefined);
    list.setFilter('sortBy', draft.sort ? draft.sort.field : undefined);
    list.setFilter('sortDir', draft.sort ? draft.sort.direction : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedConditions, draft.sort]);

  const has = (key) => draft.columns.includes(key);

  /*
   * Capacity filters, dashboard-linked (?capacity=at-risk / full) — a
   * computed threshold on enrolments vs capacity, not a plain field, so it
   * stays a URL-driven filter alongside the general view/condition system
   * rather than becoming a condition itself. Intakes with no capacity
   * recorded are not limited and are excluded from both, rather than being
   * treated as a limit of zero. Same coexistence pattern as Applications'
   * `awaitingAction`.
   */
  const CAPACITY_OPTIONS = [
    { value: 'at-risk', label: t('intakes.capacityAtRisk') },
    { value: 'full', label: t('intakes.capacityFull') }
  ];
  const capacityLabel = (v) => (CAPACITY_OPTIONS.find((o) => o.value === v) || {}).label || v;

  const exportIntakes = async () => {
    const res = await api.intakes({ ...list.params, page: 1, perPage: 200 });
    const columns = [
      { label: t('intakes.table.intake'), value: (i) => i.name },
      ...draft.columns
        .filter((k) => EXPORT_COLUMNS[k])
        .map((k) => ({ label: t(EXPORT_COLUMNS[k].labelKey), value: EXPORT_COLUMNS[k].value }))
    ];
    downloadCsv('intakes.csv', toCsv(res.data || [], columns));
  };

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
      {/* The active nav item already names this page; a repeated visible
          heading was pure redundancy. The h1 stays for screen readers. */}
      <h1 className="sr-only">{t('intakes.pageTitle')}</h1>

      <Card
        header={(
          <>
            <div className="view-header-left">
              <ViewSelect
                views={views.views}
                activeViewId={views.activeViewId}
                defaultViewId={views.defaultViewId}
                onSelect={views.selectView}
              />
            </div>
            <div className="head-actions">
              <SourceBadge source="crm" />
              <ExportCsvButton onExport={exportIntakes} />
              {can('intake:write') && (
                <button type="button" className="btn primary" onClick={() => setCreating(true)}>{t('intakes.newIntake')}</button>
              )}
            </div>
          </>
        )}
        headerClassName="view-header"
      >
        <FilterChips
          chips={[
            list.filters.status && {
              key: 'status', label: t('intakes.statusLabel'), value: list.filters.status,
              onClear: () => list.setFilter('status', '')
            },
            list.filters.capacity && {
              key: 'capacity', label: t('intakes.capacityLabel'), value: capacityLabel(list.filters.capacity),
              onClear: () => list.setFilter('capacity', '')
            }
          ]}
          onClearAll={list.clearFilters}
        />

        <div className="view-layout">
          <ViewFilterPanel
            fields={INTAKE_FIELDS}
            defaultViewId={views.defaultViewId}
            draft={draft}
            onDraftChange={setDraft}
            onSave={views.saveView}
            onDelete={(id) => setDeletingViewId(id)}
            onToggleDefault={views.toggleDefaultView}
          />

          <div className="view-content">
            <Async state={list} empty={{ title: t('intakes.noMatch') }}>
              {(rows, meta) => (
                <>
                  <div className="t-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">{t('intakes.table.intake')}</th>
                          {has('programme') && <th scope="col">{t('intakes.table.programme')}</th>}
                          {has('status') && <th scope="col">{t('intakes.table.status')}</th>}
                          {has('academicYear') && <th scope="col">{t('views.fields.intake.academicYear')}</th>}
                          {has('startDate') && <th scope="col">{t('intakes.table.starts')}</th>}
                          {has('endDate') && <th scope="col">{t('views.fields.intake.endDate')}</th>}
                          {has('applicationOpenDate') && <th scope="col">{t('views.fields.intake.applicationOpenDate')}</th>}
                          {has('applicationDeadline') && <th scope="col">{t('views.fields.intake.applicationDeadline')}</th>}
                          {has('capacity') && <th scope="col">{t('intakes.table.capacity')}</th>}
                          {has('deliveryMode') && <th scope="col">{t('intakes.table.delivery')}</th>}
                          {has('location') && <th scope="col">{t('views.fields.intake.location')}</th>}
                          {has('applicationCount') && <th scope="col">{t('intakes.table.applications')}</th>}
                          {has('enrolmentCount') && <th scope="col">{t('intakes.table.enrolments')}</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((i) => (
                          <tr key={i.id}>
                            <td><Link to={`/intakes/${i.id}`}>{i.name}</Link></td>
                            {has('programme') && (
                              <td>
                                {i.programme
                                  ? <Link to={`/programmes/${i.programme.id}`}>{i.programme.name}</Link>
                                  : <span className="muted">—</span>}
                              </td>
                            )}
                            {has('status') && (
                              <td>
                                <Pill value={i.status} />
                                {i.full && <span className="pill stop">{t('intakes.fullBadge')}</span>}
                              </td>
                            )}
                            {has('academicYear') && <td>{i.academicYear || <span className="muted">—</span>}</td>}
                            {has('startDate') && <td>{fmtDate(i.startDate)}</td>}
                            {has('endDate') && <td>{fmtDate(i.endDate)}</td>}
                            {has('applicationOpenDate') && <td>{fmtDate(i.applicationOpenDate)}</td>}
                            {has('applicationDeadline') && <td>{fmtDate(i.applicationDeadline)}</td>}
                            {has('capacity') && (
                              <td className="mono">
                                {/* "Not limited" and a capacity of zero are different
                                    things and must not look the same. */}
                                {i.capacity === null
                                  ? <span className="muted">{t('intakes.notLimited')}</span>
                                  : `${i.counts.activeEnrolments} / ${i.capacity}`}
                              </td>
                            )}
                            {has('deliveryMode') && <td>{i.deliveryMode || <span className="muted">—</span>}</td>}
                            {has('location') && <td>{i.location || <span className="muted">—</span>}</td>}
                            {has('applicationCount') && <td className="mono">{i.counts.applications}</td>}
                            {has('enrolmentCount') && <td className="mono">{i.counts.enrolments}</td>}
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
          </div>
        </div>
      </Card>

      {creating && (
        <NewIntakeDialog onClose={() => setCreating(false)} onDone={async () => { await list.reload(); }} />
      )}

      {deletingViewId && (
        <ConfirmDialog
          title={t('views.deleteConfirmTitle')}
          message={t('views.deleteConfirmMessage')}
          confirmLabel={t('views.deleteView')}
          onConfirm={() => { views.deleteView(deletingViewId); setDeletingViewId(null); }}
          onCancel={() => setDeletingViewId(null)}
        />
      )}
    </>
  );
}
