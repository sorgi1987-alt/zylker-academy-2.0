import React, { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/I18nContext.jsx';
import { Field } from './Form.jsx';

/**
 * "Custom views" for a list page — named, saved combinations of filter
 * conditions (AND-combined), visible columns and sort, closest in spirit to
 * Zoho CRM's own list views. The editor lives in a persistent panel beside
 * the record table (ViewFilterPanel), not a dialog: picking a field/operator/
 * value applies live, and "Save view" only matters once you want to keep it.
 *
 * Storage follows the same localStorage, per-device, best-effort pattern
 * already established for the Applications Kanban/List toggle
 * (VIEW_STORAGE_KEY in Applications.jsx) and the dashboard's KPI layout
 * (KpiGrid.jsx) — no server round trip, and reading/writing can throw
 * (private browsing, storage disabled) without losing the page.
 */

const readStore = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && Array.isArray(parsed.views) ? parsed : fallback;
  } catch {
    return fallback;
  }
};
const writeStore = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* best-effort */ }
};

let uidCounter = 0;
const newViewId = () => `v${Date.now()}_${(uidCounter += 1)}`;

/**
 * Manages the saved-views list and which one is active for `storageKey`.
 * `activeViewId: null` always means the built-in "All records" view — no
 * conditions, default columns, no custom sort.
 */
export function useViews(storageKey) {
  const [store, setStore] = useState(() => readStore(storageKey, { views: [], activeViewId: null, defaultViewId: null }));
  const appliedDefault = useRef(false);

  useEffect(() => { writeStore(storageKey, store); }, [storageKey, store]);

  // A default view opens automatically on first load of the page, mirroring
  // Zoho CRM. Only on mount, and only once — reselecting "All records" later
  // in the same session must stick, not keep snapping back to the default.
  useEffect(() => {
    if (appliedDefault.current) return;
    appliedDefault.current = true;
    if (store.defaultViewId && !store.activeViewId) {
      setStore((s) => ({ ...s, activeViewId: s.defaultViewId }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeView = store.views.find((v) => v.id === store.activeViewId) || null;

  const selectView = (id) => setStore((s) => ({ ...s, activeViewId: id || null }));

  const saveView = ({ id, name, conditions, columns, sort }) => {
    let savedId = id;
    setStore((s) => {
      if (id) {
        return { ...s, views: s.views.map((v) => (v.id === id ? { ...v, name, conditions, columns, sort } : v)) };
      }
      const created = { id: newViewId(), name, conditions, columns, sort };
      savedId = created.id;
      return { ...s, views: [...s.views, created], activeViewId: created.id };
    });
    return savedId;
  };

  const deleteView = (id) => setStore((s) => ({
    ...s,
    views: s.views.filter((v) => v.id !== id),
    activeViewId: s.activeViewId === id ? null : s.activeViewId,
    defaultViewId: s.defaultViewId === id ? null : s.defaultViewId
  }));

  const toggleDefaultView = (id) => setStore((s) => ({ ...s, defaultViewId: s.defaultViewId === id ? null : id }));

  return {
    views: store.views,
    activeView,
    activeViewId: store.activeViewId,
    defaultViewId: store.defaultViewId,
    selectView,
    saveView,
    deleteView,
    toggleDefaultView
  };
}

/** An unsaved-or-saved view's live editing state — see useViewDraft below. */
export const blankDraft = (columns) => ({ id: null, name: '', conditions: [], columns, sort: null });

/**
 * Tracks the panel's working copy of the active view (or a fresh blank draft
 * for "All records"), reseeded whenever a different saved view is picked so
 * in-progress edits to view A don't leak into view B — but NOT reseeded on
 * every store change, so editing the currently-open view doesn't fight the
 * user's own typing.
 */
export function useViewDraft(activeView, defaultColumns) {
  const [draft, setDraft] = useState(() => (
    activeView
      ? { id: activeView.id, name: activeView.name, conditions: activeView.conditions, columns: activeView.columns, sort: activeView.sort }
      : blankDraft(defaultColumns)
  ));
  const seededFor = useRef(activeView ? activeView.id : null);

  useEffect(() => {
    const id = activeView ? activeView.id : null;
    if (seededFor.current === id) return;
    seededFor.current = id;
    setDraft(activeView
      ? { id: activeView.id, name: activeView.name, conditions: activeView.conditions, columns: activeView.columns, sort: activeView.sort }
      : blankDraft(defaultColumns));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView]);

  return [draft, setDraft];
}

const OPERATORS_BY_TYPE = {
  text: ['contains', 'not_contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
  enum: ['equals', 'not_equals', 'is_empty', 'is_not_empty'],
  number: ['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty'],
  date: ['before', 'after', 'is_empty', 'is_not_empty'],
  boolean: ['equals']
};
export const NO_VALUE_OPERATORS = new Set(['is_empty', 'is_not_empty']);

const fieldByKey = (fields, key) => fields.find((f) => f.key === key) || fields[0];

const emptyCondition = (fields) => {
  const f = fields[0];
  return { field: f.key, operator: OPERATORS_BY_TYPE[f.type][0], value: '' };
};

/**
 * The conditions a draft would actually apply — an operator that needs a
 * value but has none yet (someone is mid-edit) is dropped rather than sent
 * to the server as a broken filter.
 */
export const liveConditions = (conditions) =>
  conditions.filter((c) => NO_VALUE_OPERATORS.has(c.operator) || String(c.value ?? '').trim() !== '');

/** One condition row: field, operator, and (when the operator needs one) a value input shaped by the field's type. */
function ConditionRow({ condition, fields, onChange, onRemove }) {
  const t = useT();
  const field = fieldByKey(fields, condition.field);
  const ops = OPERATORS_BY_TYPE[field.type];
  const needsValue = !NO_VALUE_OPERATORS.has(condition.operator);

  return (
    <div className="view-condition-row">
      <select
        aria-label={t('views.conditionField')}
        value={condition.field}
        onChange={(e) => {
          const nf = fieldByKey(fields, e.target.value);
          onChange({ field: nf.key, operator: OPERATORS_BY_TYPE[nf.type][0], value: '' });
        }}
      >
        {fields.map((f) => <option key={f.key} value={f.key}>{t(f.labelKey)}</option>)}
      </select>
      <select
        aria-label={t('views.conditionOperator')}
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value, value: NO_VALUE_OPERATORS.has(e.target.value) ? '' : condition.value })}
      >
        {ops.map((op) => <option key={op} value={op}>{t(`views.operators.${op}`)}</option>)}
      </select>
      {needsValue && field.type === 'enum' && (
        <select aria-label={t('views.conditionValue')} value={condition.value} onChange={(e) => onChange({ ...condition, value: e.target.value })}>
          <option value="">{t('common.all')}</option>
          {(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {needsValue && field.type === 'boolean' && (
        <select aria-label={t('views.conditionValue')} value={condition.value} onChange={(e) => onChange({ ...condition, value: e.target.value })}>
          <option value="">—</option>
          <option value="true">{t('views.booleanTrue')}</option>
          <option value="false">{t('views.booleanFalse')}</option>
        </select>
      )}
      {needsValue && field.type === 'date' && (
        <input aria-label={t('views.conditionValue')} type="date" value={condition.value} onChange={(e) => onChange({ ...condition, value: e.target.value })} />
      )}
      {needsValue && field.type === 'number' && (
        <input aria-label={t('views.conditionValue')} type="number" value={condition.value} onChange={(e) => onChange({ ...condition, value: e.target.value })} />
      )}
      {needsValue && field.type === 'text' && (
        <input aria-label={t('views.conditionValue')} type="text" value={condition.value} onChange={(e) => onChange({ ...condition, value: e.target.value })} />
      )}
      <button type="button" className="btn view-condition-remove" onClick={onRemove} aria-label={t('views.removeCondition')}>×</button>
    </div>
  );
}

/**
 * The persistent left-hand panel beside the record table: view switcher,
 * live filter/column/sort builder, and save/default/delete for the current
 * draft — matching the reference (Zoho CRM's own view tabs + "Filter by"
 * panel sitting beside the list, not above it or behind a dialog).
 *
 * `fields` is one of the registries in viewFields.js (or a copy with
 * `options` overridden for a dynamic enum, e.g. live application stages).
 * `draft`/`onDraftChange` is the working copy (see useViewDraft) — every
 * edit here calls back immediately so the page can apply it live.
 */
export function ViewFilterPanel({
  fields, views, activeViewId, defaultViewId, draft, onDraftChange, onSelectView, onSave, onDelete, onToggleDefault
}) {
  const t = useT();
  const hideable = fields.filter((f) => !f.primary);
  const primary = fields.find((f) => f.primary);
  const [touched, setTouched] = useState(false);
  const nameError = !draft.name.trim() ? t('views.nameRequired') : null;

  const updateCondition = (i, next) => onDraftChange({ ...draft, conditions: draft.conditions.map((c, idx) => (idx === i ? next : c)) });
  const removeCondition = (i) => onDraftChange({ ...draft, conditions: draft.conditions.filter((_, idx) => idx !== i) });
  const addCondition = () => onDraftChange({ ...draft, conditions: [...draft.conditions, emptyCondition(fields)] });
  const toggleColumn = (key) => onDraftChange({
    ...draft,
    columns: draft.columns.includes(key) ? draft.columns.filter((c) => c !== key) : [...draft.columns, key]
  });
  const setSortField = (field) => onDraftChange({ ...draft, sort: field ? { field, direction: (draft.sort && draft.sort.direction) || 'asc' } : null });
  const setSortDir = (direction) => onDraftChange({ ...draft, sort: draft.sort ? { ...draft.sort, direction } : null });

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (nameError) return;
    onSave({ ...draft, name: draft.name.trim(), conditions: liveConditions(draft.conditions) });
  };

  return (
    <form className="view-panel" onSubmit={submit} noValidate>
      <div className="view-panel-section">
        <h3>{t('views.viewLabel')}</h3>
        <select aria-label={t('views.viewLabel')} value={activeViewId || ''} onChange={(e) => onSelectView(e.target.value)}>
          <option value="">{t('views.allRecords')}</option>
          {views.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}{v.id === defaultViewId ? ` — ${t('views.defaultTag')}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="view-panel-section">
        <h3>{t('views.filtersHeading')}</h3>
        {draft.conditions.length === 0 && <p className="muted small">{t('views.noConditions')}</p>}
        {draft.conditions.map((cond, i) => (
          <ConditionRow
            key={i}
            condition={cond}
            fields={fields}
            onChange={(next) => updateCondition(i, next)}
            onRemove={() => removeCondition(i)}
          />
        ))}
        <button type="button" className="btn" onClick={addCondition}>{t('views.addCondition')}</button>
      </div>

      <div className="view-panel-section">
        <h3>{t('views.columnsHeading')}</h3>
        <div className="view-columns-picker">
          {primary && (
            <label className="view-col-check">
              <input type="checkbox" checked disabled />
              {t(primary.labelKey)} <span className="muted small">({t('views.alwaysShown')})</span>
            </label>
          )}
          {hideable.map((f) => (
            <label className="view-col-check" key={f.key}>
              <input type="checkbox" checked={draft.columns.includes(f.key)} onChange={() => toggleColumn(f.key)} />
              {t(f.labelKey)}
            </label>
          ))}
        </div>
      </div>

      <div className="view-panel-section">
        <h3>{t('views.sortHeading')}</h3>
        <div className="view-sort-row">
          <select value={(draft.sort && draft.sort.field) || ''} onChange={(e) => setSortField(e.target.value)}>
            <option value="">{t('views.noSort')}</option>
            {fields.map((f) => <option key={f.key} value={f.key}>{t(f.labelKey)}</option>)}
          </select>
          <select value={(draft.sort && draft.sort.direction) || 'asc'} onChange={(e) => setSortDir(e.target.value)} disabled={!draft.sort}>
            <option value="asc">{t('views.sortAsc')}</option>
            <option value="desc">{t('views.sortDesc')}</option>
          </select>
        </div>
      </div>

      <div className="view-panel-section">
        <Field id="view-panel-name" label={t('views.nameLabel')} error={touched ? nameError : null}>
          <input value={draft.name} onChange={(e) => onDraftChange({ ...draft, name: e.target.value })} />
        </Field>
      </div>

      <div className="view-panel-actions">
        <button type="submit" className="btn primary">
          {draft.id ? t('views.saveView') : t('views.saveAsNewView')}
        </button>
        {draft.id && (
          <>
            <button type="button" className="btn" onClick={() => onToggleDefault(draft.id)}>
              {draft.id === defaultViewId ? t('views.unsetDefault') : t('views.setDefault')}
            </button>
            <button type="button" className="btn danger" onClick={() => onDelete(draft.id)}>{t('views.deleteView')}</button>
          </>
        )}
      </div>
    </form>
  );
}
