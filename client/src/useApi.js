import { useEffect, useState, useCallback, useRef, useMemo } from 'react';

/** Standard loading / empty / error lifecycle for every page. */
export function useApi(fn, deps = []) {
  const [state, setState] = useState({ status: 'loading', data: null, meta: null, error: null });

  const run = useCallback(() => {
    const ctrl = new AbortController();
    setState((s) => ({ ...s, status: 'loading', error: null }));
    fn({ signal: ctrl.signal })
      .then((res) => setState({ status: 'ready', data: res.data, meta: res.meta || {}, error: res.error || null }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState({ status: 'error', data: null, meta: null, error: err });
      });
    return () => ctrl.abort();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(run, [run]);
  return { ...state, reload: run };
}

/** Debounces a value, so typing in a search box does not fire a request a letter. */
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * A paginated, searchable, filterable list backed by one API function.
 *
 * Filtering and searching happen on the server, so a list longer than one page
 * still filters correctly — filtering the current page in the browser would
 * silently ignore every record not yet fetched.
 *
 * Changing a filter resets to page 1. Staying on page 7 of a result set that
 * now has two pages shows an empty screen and looks like a bug.
 */
export function usePagedList(fetcher, { perPage = 25, initialFilters = {} } = {}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const debouncedSearch = useDebounced(search, 350);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    setPage(1);
  }, [debouncedSearch, filters]);

  const params = useMemo(
    () => ({ page, perPage, search: debouncedSearch || undefined, ...filters }),
    [page, perPage, debouncedSearch, filters]
  );

  const state = useApi((o) => fetcher(params, o), [params]);

  const setFilter = useCallback((key, value) => {
    setFilters((f) => ({ ...f, [key]: value || undefined }));
  }, []);

  return { ...state, page, setPage, search, setSearch, filters, setFilter, params };
}

/**
 * Runs a mutation with busy state and error capture, so every action button
 * behaves the same: disabled while in flight, error shown in place, and the
 * caller told whether to reload.
 */
export function useAction(onDone) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async (fn) => {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (onDone) await onDone(result);
      return result;
    } catch (err) {
      setError(err);
      return null;
    } finally {
      setBusy(false);
    }
  }, [onDone]);

  return { busy, error, run, clearError: () => setError(null) };
}
