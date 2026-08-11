import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import stringsEn from './strings.en.js';
import stringsEs from './strings.es.js';

/**
 * Translation dictionaries and the active language, kept in sync at module
 * scope as well as in React state.
 *
 * The module-level copy exists so that plain functions which are not React
 * components or hooks — `friendlyError()` in Form.jsx, `fmtDate`/`fmtMoney`
 * in Ui.jsx — can read the current language without every caller threading a
 * `t` argument through. `setLanguage` below updates the module copy BEFORE
 * the React state update, so by the time a re-render runs, every plain
 * function call already sees the new language — no stale read.
 */
const DICTIONARIES = { en: stringsEn, es: stringsEs };
const STORAGE_KEY = 'zylker_lang';
const LOCALE = { en: 'en-GB', es: 'es-ES' };

let currentLanguage = 'en';

function readStoredLanguage() {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'es' ? 'es' : 'en';
  } catch {
    // Storage can be unavailable (private browsing, disabled cookies); the
    // app must still run, just without a remembered preference.
    return 'en';
  }
}

/** Dot-path lookup into the active dictionary, e.g. 'common.previous'. */
function lookup(key) {
  const dict = DICTIONARIES[currentLanguage] || DICTIONARIES.en;
  const parts = key.split('.');
  let node = dict;
  for (const p of parts) {
    node = node && typeof node === 'object' ? node[p] : undefined;
    if (node === undefined) break;
  }
  if (typeof node === 'string') return node;
  // A missing key renders the key itself — visible, not blank — so a gap in
  // the translation pass is obvious on screen rather than a silent omission.
  return key;
}

/** Replaces {name} placeholders with values from `vars`. */
function interpolate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

/**
 * Translates `key`, usable outside React (helper functions, not just
 * components). Components should prefer `useT()` so they re-render when the
 * language changes; `translate` is for the few plain-function call sites
 * that are invoked fresh on every render already (so they pick up the
 * current language naturally) and don't need a hook.
 */
export function translate(key, vars) {
  return interpolate(lookup(key), vars);
}

/** `'en-GB'` / `'es-ES'`, for the Intl-based formatters in Ui.jsx. */
export function getLocale() {
  return LOCALE[currentLanguage] || LOCALE.en;
}

const I18nCtx = createContext({ language: 'en', setLanguage: () => {} });

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    const initial = readStoredLanguage();
    currentLanguage = initial;
    return initial;
  });

  const setLanguage = (lang) => {
    const next = lang === 'es' ? 'es' : 'en';
    currentLanguage = next; // synchronous — plain-function readers see it immediately
    setLanguageState(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* best effort */ }
  };

  // Keeps the module-level copy correct even if language state is ever set
  // by a source other than setLanguage (defensive; there isn't one today).
  useEffect(() => { currentLanguage = language; }, [language]);

  const value = useMemo(() => ({ language, setLanguage }), [language]);

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

/** `t(key, vars?)` — re-renders the calling component when the language changes. */
export function useT() {
  const { language } = useContext(I18nCtx);
  return useMemo(() => (key, vars) => translate(key, vars), [language]);
}

export function useLanguage() {
  const { language, setLanguage } = useContext(I18nCtx);
  return [language, setLanguage];
}
