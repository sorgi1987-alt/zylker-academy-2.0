import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import * as catalystAuth from './catalystAuth.js';

/**
 * Authentication state for the whole client.
 *
 * The authority on "am I signed in, and what may I do" is the SERVER's
 * `GET /api/me`, not the Web SDK. The SDK tells us whether the browser holds a
 * session; only the backend can say whether the Catalyst function can resolve
 * that session into a user and a role. Those two can disagree — a browser
 * session that the function cannot resolve is not a usable login — and when
 * they do, the backend wins and the user is shown the sign-in screen.
 *
 * Consequently NO application data is requested until `status === 'authenticated'`.
 * The provider renders neither routes nor pages before then, so there is no
 * path on which a CRM, LMS or Books call can be issued by an unauthenticated
 * visitor.
 */

const AuthCtx = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
};

/** Permission check for rendering controls. The server re-checks every call. */
export function useCan() {
  const { user } = useAuth();
  return useCallback(
    (permission) => Boolean(user && user.permissions && user.permissions.includes(permission)),
    [user]
  );
}

const STATUS = {
  CHECKING: 'checking',
  ANONYMOUS: 'anonymous',
  AUTHENTICATED: 'authenticated',
  UNAVAILABLE: 'unavailable'
};

export function AuthProvider({ children }) {
  const [status, setStatus] = useState(STATUS.CHECKING);
  const [user, setUser] = useState(null);
  const [environment, setEnvironment] = useState(null);
  const [error, setError] = useState(null);

  /**
   * The route the visitor asked for before being sent to sign-in. Held in a ref
   * rather than state so that capturing it never triggers a re-render, and in
   * memory rather than storage so a stale intent cannot survive a browser
   * restart and redirect someone unexpectedly.
   */
  const intendedRoute = useRef(null);

  const captureIntendedRoute = useCallback(() => {
    const hash = window.location.hash || '';
    const route = hash.startsWith('#') ? hash.slice(1) : hash;
    if (route && route !== '/' && !route.startsWith('/login')) intendedRoute.current = route;
  }, []);

  const takeIntendedRoute = useCallback(() => {
    const r = intendedRoute.current;
    intendedRoute.current = null;
    return r;
  }, []);

  /**
   * Establishes the session. Asks the server, not the SDK — see the note above.
   * A 401 is the normal "not signed in" answer and is not an error state.
   */
  const check = useCallback(async () => {
    setError(null);
    try {
      const res = await api.me();
      setUser(res.data.user);
      // Which deployment answered. Reported by the server rather than inferred
      // from the browser URL, so it names the backend actually being used.
      setEnvironment(res.data.environment || null);
      setStatus(STATUS.AUTHENTICATED);
      return true;
    } catch (err) {
      setUser(null);
      if (err.status === 401 || err.status === 403) {
        setStatus(STATUS.ANONYMOUS);
      } else {
        // A network failure or a 5xx is NOT a sign-out. Saying "you are signed
        // out" when the service is merely unreachable sends people to re-enter
        // a password that was never the problem.
        setError(err);
        setStatus(STATUS.UNAVAILABLE);
      }
      return false;
    }
  }, []);

  useEffect(() => {
    captureIntendedRoute();
    check();
  }, [check, captureIntendedRoute]);

  const signOut = useCallback(async () => {
    try {
      // Full page load, so nothing previously fetched survives in memory.
      await catalystAuth.signOut(`${window.location.origin}${window.location.pathname}`);
    } catch {
      // If the SDK cannot complete the round trip, still drop local state and
      // reload; leaving a signed-out user looking at loaded records is worse.
      window.location.reload();
    }
  }, []);

  const value = {
    status,
    user,
    environment,
    error,
    isAuthenticated: status === STATUS.AUTHENTICATED,
    recheck: check,
    signOut,
    takeIntendedRoute,
    STATUS
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export { STATUS };
