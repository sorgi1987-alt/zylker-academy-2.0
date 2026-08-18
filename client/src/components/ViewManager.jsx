import React, { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/I18nContext.jsx';
import { Modal } from './Ui.jsx';
import { Field, FormActions } from './Form.jsx';

/**
 * "Custom views" for a list page — named, saved combinations of filter
 * conditions (AND-combined), visible columns and sort, closest in spirit to
 * Zoho CRM's own list views.
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
    setStore((s) => {
      if (id) {
        return { ...s, views: s.views.map((v) => (v.id === id ? { ...v, name, conditions, columns, sort } : v)) };
      }
      const created = { id: newViewId(), name, conditions, columns, sort };
      return { ...s, views: [...s.views, created], activeViewId: created.id };
    });
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

/** View selector + new/edit/delete/default controls, sits in the page toolbar. */
export function ViewBar({ views, activeViewId, defaultViewId, onSelect, onNew, onEdit, onDelete, onToggleDefault }) {
  const t = useT();
  const activeView = views.find((v) => v.id === activeViewId) || null;
  return (
    <div className="view-bar">
      <div className="field">
        <label htmlFor="view-select">{t('views.viewLabel')}</label>
        <select id="view-select" value={activeViewId || ''} onChange={(e) => onSelect(e.target.value)}>
          <option value="">{t('views.allRecords')}</option>
          {views.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}{v.id === defaultViewId ? ` — ${t('views.defaultTag')}` : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="view-bar-actions">
        <button type="button" className="btn" onClick={onNew}>{t('views.newView')}</button>
        {activeView && (
          <>
            <button type="button" className="btn" onClick={() => onEdit(activeView)}>{t('views.editView')}</button>
            <button type="button" className="btn" onClick={() => onToggleDefault(activeView.id)}>
              {activeView.id === defaultViewId ? t('views.unsetDefault') : t('views.setDefault')}
            </button>
            <button type="button" className="btn danger" onClick={() => onDelete(activeView.id)}>{t('views.deleteView')}</button>
          </>
        )}
      </div>
    </div>
  );
}

const OPERATORS_BY_TYPE = {
  text: ['contains', 'not_contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
  enum: ['equals', 'not_equals', 'is_empty', 'is_not_empty'],
  number: ['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty'],
  date: ['before', 'after', 'is_empty', 'is_not_empty'],
  boolean: ['equals']
};
const NO_VALUE_OPERATORS = new Set(['is_empty', 'is_not_empty']);

const fieldByKey = (fields, key) => fields.find((f) => f.key === key) || fields[0];

const emptyCondition = (fields) => {
  const f = fields[0];
  return { field: f.key, operator: OPERATORS_BY_TYPE[f.type][0], value: '' };
};

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
 * Create/edit a saved view: name, filter conditions, column visibility, and
 * sort. `fields` is one of the registries in viewFields.js (or a copy with
 * `options` overridden for a dynamic enum, e.g. live application stages).
 */
export function ViewEditorModal({ fields, initial, onClose, onSave }) {
  const t = useT();
  const hideable = fields.filter((f) => !f.primary);
  const primary = fields.find((f) => f.primary);

  const [name, setName] = useState((initial && initial.name) || '');
  const [conditions, setConditions] = useState((initial && initial.conditions) || []);
  const [visibleColumns, setVisibleColumns] = useState(
    (initial && initial.columns) || hideable.map((f) => f.key)
  );
  const [sortField, setSortField] = useState((initial && initial.sort && initial.sort.field) || '');
  const [sortDir, setSortDir] = useState((initial && initial.sort && initial.sort.direction) || 'asc');
  const [touched, setTouched] = useState(false);

  const nameError = !name.trim() ? t('views.nameRequired') : null;

  const updateCondition = (i, next) => setConditions((c) => c.map((cond, idx) => (idx === i ? next : cond)));
  const removeCondition = (i) => setConditions((c) => c.filter((_, idx) => idx !== i));
  const toggleColumn = (key) => setVisibleColumns((cols) => (
    cols.includes(key) ? cols.filter((c) => c !== key) : [...cols, key]
  ));

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (nameError) return;
    onSave({
      id: initial && initial.id,
      name: name.trim(),
      conditions: conditions.filter((c) => NO_VALUE_OPERATORS.has(c.operator) || String(c.value ?? '').trim() !== ''),
      columns: visibleColumns,
      sort: sortField ? { field: sortField, direction: sortDir } : null
    });
    onClose();
  };

  return (
    <Modal title={initial ? t('views.editViewTitle') : t('views.newViewTitle')} onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <Field id="view-name" label={t('views.nameLabel')} required error={touched ? nameError : null}>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <h3 className="view-editor-h">{t('views.filtersHeading')}</h3>
        {conditions.length === 0 && <p className="muted small">{t('views.noConditions')}</p>}
        {conditions.map((cond, i) => (
          <ConditionRow
            key={i}
            condition={cond}
            fields={fields}
            onChange={(next) => updateCondition(i, next)}
            onRemove={() => removeCondition(i)}
          />
        ))}
        <button type="button" className="btn" onClick={() => setConditions((c) => [...c, emptyCondition(fields)])}>
          {t('views.addCondition')}
        </button>

        <h3 className="view-editor-h">{t('views.columnsHeading')}</h3>
        <div className="view-columns-picker">
          {primary && (
            <label className="view-col-check">
              <input type="checkbox" checked disabled />
              {t(primary.labelKey)} <span className="muted small">({t('views.alwaysShown')})</span>
            </label>
          )}
          {hideable.map((f) => (
            <label className="view-col-check" key={f.key}>
              <input type="checkbox" checked={visibleColumns.includes(f.key)} onChange={() => toggleColumn(f.key)} />
              {t(f.labelKey)}
            </label>
          ))}
        </div>

        <h3 className="view-editor-h">{t('views.sortHeading')}</h3>
        <div className="view-sort-row">
          <select value={sortField} onChange={(e) => setSortField(e.target.value)}>
            <option value="">{t('views.noSort')}</option>
            {fields.map((f) => <option key={f.key} value={f.key}>{t(f.labelKey)}</option>)}
          </select>
          <select value={sortDir} onChange={(e) => setSortDir(e.target.value)} disabled={!sortField}>
            <option value="asc">{t('views.sortAsc')}</option>
            <option value="desc">{t('views.sortDesc')}</option>
          </select>
        </div>

        <FormActions busy={false} submitLabel={t('views.saveView')} onCancel={onClose} />
      </form>
    </Modal>
  );
}
