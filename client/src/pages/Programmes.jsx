import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePagedList, useAction, useDebounced } from '../useApi.js';
import { api, newIdempotencyKey } from '../api.js';
import { useCan } from '../AuthContext.jsx';
import { useT } from '../i18n/I18nContext.jsx';
import {
  Async, Card, Pill, Pagination, SourceBadge, Modal, ConfirmDialog, useToast, fmtMoney
} from '../components/Ui.jsx';
import { Field, FormActions, FormError, friendlyError } from '../components/Form.jsx';
import { useViews, useViewDraft, ViewSelect, ViewFilterPanel, liveConditions } from '../components/ViewManager.jsx';
import { PROGRAMME_FIELDS } from '../viewFields.js';

const LEVELS = ['Foundation', 'Certificate', 'Diploma', 'Undergraduate', 'Postgraduate', 'Professional', 'Other'];
const STATUSES = ['Draft', 'Open for Applications', 'Running', 'Suspended', 'Archived'];

// Matches the table this page has always rendered. "LMS course" is a link to
// another page's record, not a plain field, so it is never part of the
// toggle system — it stays a fixed trailing column, like the primary name
// column is a fixed leading one.
const DEFAULT_COLUMNS = ['code', 'academicLevel', 'status', 'tuitionFee', 'intakeCount', 'enrolmentCount'];

function NewProgrammeDialog({ onClose, onDone }) {
  const t = useT();
  const toast = useToast();
  const [form, setForm] = useState({
    name: '', status: 'Draft', academicLevel: '', department: '', award: '',
    durationValue: '', durationUnit: '', tuitionFee: '', lmsCourseId: '', lmsCourseUrl: ''
  });
  const [touched, setTouched] = useState(false);
  const [idempotencyKey] = useState(newIdempotencyKey);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const action = useAction(async (r) => { await onDone(r); onClose(); });

  const nameError = !form.name.trim() ? t('programmes.newDialog.nameRequired') : null;

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
    if (r) toast(t('programmes.newDialog.created'));
  };

  return (
    <Modal title={t('programmes.newDialog.title')} onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field id="name" label={t('programmes.newDialog.nameLabel')} required error={touched ? nameError : null}>
            <input value={form.name} onChange={set('name')} />
          </Field>
          <Field id="status" label={t('programmes.newDialog.statusLabel')}>
            <select value={form.status} onChange={set('status')}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field id="academicLevel" label={t('programmes.newDialog.academicLevelLabel')}>
            <select value={form.academicLevel} onChange={set('academicLevel')}>
              <option value="">{t('programmes.newDialog.notSet')}</option>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>
          <Field id="department" label={t('programmes.newDialog.departmentLabel')}>
            <input value={form.department} onChange={set('department')} />
          </Field>
          <Field id="award" label={t('programmes.newDialog.awardLabel')}>
            <input value={form.award} onChange={set('award')} />
          </Field>
          <Field id="durationValue" label={t('programmes.newDialog.durationLabel')}>
            <input type="number" min="0" value={form.durationValue} onChange={set('durationValue')} />
          </Field>
          <Field id="durationUnit" label={t('programmes.newDialog.durationUnitLabel')} hint={t('programmes.newDialog.durationUnitHint')}>
            <input value={form.durationUnit} onChange={set('durationUnit')} />
          </Field>
          <Field id="tuitionFee" label={t('programmes.newDialog.tuitionFeeLabel')}>
            <input type="number" min="0" value={form.tuitionFee} onChange={set('tuitionFee')} />
          </Field>
          <Field
            id="lmsCourseId"
            label={t('programmes.newDialog.lmsCourseIdLabel')}
            hint={t('programmes.newDialog.lmsCourseIdHint')}
          >
            <input value={form.lmsCourseId} onChange={set('lmsCourseId')} />
          </Field>
          <Field id="lmsCourseUrl" label={t('programmes.newDialog.lmsCourseUrlLabel')}>
            <input value={form.lmsCourseUrl} onChange={set('lmsCourseUrl')} />
          </Field>
        </div>
        <FormError error={action.error ? friendlyError(action.error) : null} />
        <FormActions busy={action.busy} submitLabel={t('programmes.newDialog.submit')} onCancel={onClose} />
      </form>
    </Modal>
  );
}

export default function Programmes() {
  const t = useT();
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const list = usePagedList(api.programmes, {
    initialFilters: { active: params.get('active') || undefined }
  });
  const views = useViews('zylker.views.programmes');
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
      {/* The active nav item already names this page; a repeated visible
          heading was pure redundancy. The h1 stays for screen readers. */}
      <h1 className="sr-only">{t('programmes.pageTitle')}</h1>

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
              {can('programme:write') && (
                <button type="button" className="btn primary" onClick={() => setCreating(true)}>
                  {t('programmes.newProgramme')}
                </button>
              )}
            </div>
          </>
        )}
        headerClassName="view-header"
      >
        <div className="view-layout">
          <ViewFilterPanel
            fields={PROGRAMME_FIELDS}
            defaultViewId={views.defaultViewId}
            draft={draft}
            onDraftChange={setDraft}
            onSave={views.saveView}
            onDelete={(id) => setDeletingViewId(id)}
            onToggleDefault={views.toggleDefaultView}
          />

          <div className="view-content">
            <Async state={list} empty={{ title: t('programmes.noMatch') }}>
              {(rows, meta) => (
                <>
                  <div className="t-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">{t('programmes.table.programme')}</th>
                          {has('code') && <th scope="col">{t('programmes.table.code')}</th>}
                          {has('academicLevel') && <th scope="col">{t('programmes.table.level')}</th>}
                          {has('status') && <th scope="col">{t('programmes.table.status')}</th>}
                          {has('active') && <th scope="col">{t('views.fields.programme.active')}</th>}
                          {has('department') && <th scope="col">{t('views.fields.programme.department')}</th>}
                          {has('tuitionFee') && <th scope="col">{t('programmes.table.fee')}</th>}
                          {has('intakeCount') && <th scope="col">{t('programmes.table.intakes')}</th>}
                          {has('enrolmentCount') && <th scope="col">{t('programmes.table.enrolments')}</th>}
                          {has('applicationCount') && <th scope="col">{t('views.fields.programme.applicationCount')}</th>}
                          <th scope="col">{t('programmes.table.lmsCourse')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((p) => (
                          <tr key={p.id}>
                            <td><Link to={`/programmes/${p.id}`}>{p.name}</Link></td>
                            {has('code') && <td className="mono">{p.code || <span className="muted">—</span>}</td>}
                            {has('academicLevel') && <td>{p.academicLevel || <span className="muted">—</span>}</td>}
                            {has('status') && (
                              <td>
                                <Pill value={p.status} />
                                {!p.active && <span className="pill mute">{t('programmes.inactiveBadge')}</span>}
                              </td>
                            )}
                            {has('active') && <td>{p.active ? t('views.booleanTrue') : t('views.booleanFalse')}</td>}
                            {has('department') && <td>{p.department || <span className="muted">—</span>}</td>}
                            {has('tuitionFee') && <td className="mono">{fmtMoney(p.tuitionFee)}</td>}
                            {has('intakeCount') && <td className="mono">{p.counts.intakes}</td>}
                            {has('enrolmentCount') && <td className="mono">{p.counts.enrolments}</td>}
                            {has('applicationCount') && <td className="mono">{p.counts.applications}</td>}
                            <td>
                              {p.lmsCourse
                                ? <Link to={`/learning/courses/${p.lmsCourse.id}`}>{p.lmsCourse.name}</Link>
                                : <span className="muted">{t('programmes.notMapped')}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {meta.lmsDemonstrationDataset && (
                    <p className="note">
                      {t('programmes.lmsNote')}
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
        <NewProgrammeDialog
          onClose={() => setCreating(false)}
          onDone={async () => { await list.reload(); }}
        />
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
