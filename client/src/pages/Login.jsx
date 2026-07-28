import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../AuthContext.jsx';
import * as catalystAuth from '../catalystAuth.js';

const SIGNIN_ELEMENT_ID = 'catalyst-signin';

/**
 * Branded sign-in screen.
 *
 * The credential form is rendered by Catalyst into `#catalyst-signin`. That is
 * deliberate rather than a shortcut: this application never renders a password
 * input, never holds a password in React state, and never transports one.
 * Validation, lockout and the forgotten-password flow are Catalyst's, so they
 * behave exactly as configured for the project.
 *
 * ── Why this checks for an existing session first ──────────────────────────
 * `catalyst.auth.signIn()` is not "show a form". When the browser ALREADY holds
 * a valid Catalyst session it takes the post-login path immediately and
 * redirects back to the app. If the server then cannot resolve that session,
 * this screen renders again, calls signIn() again, and the page reloads
 * forever — which is exactly what happened on the first deployment.
 *
 * So the browser session is checked before the form is mounted, and the three
 * possible states are handled separately:
 *
 *   no browser session      -> render the sign-in form (the normal path)
 *   session, server agrees  -> AuthProvider has already swapped this screen out
 *   session, server refuses -> say so plainly and stop. Never call signIn(),
 *                              because that is the redirect loop.
 */
const PHASE = {
  CHECKING: 'checking',
  FORM: 'form',
  FORM_FAILED: 'form-failed',
  SERVER_REFUSED: 'server-refused',
  SDK_UNAVAILABLE: 'sdk-unavailable'
};

export default function Login() {
  const { recheck, signOut, error: sessionError, status, STATUS } = useAuth();
  const [phase, setPhase] = useState(PHASE.CHECKING);
  const [detail, setDetail] = useState(null);
  const [browserUser, setBrowserUser] = useState(null);
  const started = useRef(false);

  useEffect(() => {
    // Guard against a second render mounting a second sign-in iframe.
    if (started.current) return undefined;
    started.current = true;

    let cancelled = false;

    (async () => {
      if (!(await catalystAuth.sdkAvailable())) {
        if (!cancelled) setPhase(PHASE.SDK_UNAVAILABLE);
        return;
      }

      const user = await catalystAuth.currentUser();
      if (cancelled) return;

      if (user) {
        // The browser is signed in but this screen is still showing, which
        // means /api/me refused. Calling signIn() now would redirect and loop.
        setBrowserUser(user);
        setPhase(PHASE.SERVER_REFUSED);
        return;
      }

      try {
        await catalystAuth.renderSignIn(SIGNIN_ELEMENT_ID);
        if (!cancelled) setPhase(PHASE.FORM);
      } catch (err) {
        if (!cancelled) {
          setDetail(err && err.message);
          setPhase(PHASE.FORM_FAILED);
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  /**
   * Catalyst completes sign-in inside its own iframe and does not call back
   * into React, so the server is re-asked when the tab regains focus — which is
   * when the embedded flow, or a return from a password reset, has finished.
   *
   * Polling runs ONLY while the form is on screen. In the refused state it
   * would be a request every few seconds that can never succeed.
   */
  useEffect(() => {
    if (phase !== PHASE.FORM) return undefined;
    const onFocus = () => { recheck(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const poll = setInterval(recheck, 4000);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      clearInterval(poll);
    };
  }, [phase, recheck]);

  return (
    <div className="login-shell">
      <main className="login-card">
        <header className="login-head">
          <p className="brand">Zylker Academy</p>
          <p className="brand-sub">Education Management Portal</p>
        </header>

        {phase === PHASE.SERVER_REFUSED ? (
          <>
            <p className="login-intro">
              You are signed in to Catalyst as{' '}
              <strong>{browserUser?.email_id || browserUser?.email || 'this account'}</strong>,
              but the application could not verify that session.
            </p>
            <div className="state err" role="alert">
              <h3>Your session could not be verified</h3>
              <p>
                The sign-in itself worked. The server rejected the session when the
                application asked it to identify you, so no data has been loaded.
              </p>
              <div className="head-actions">
                <button type="button" className="btn primary" onClick={recheck}>Try again</button>
                <button type="button" className="btn" onClick={signOut}>Sign out</button>
              </div>
            </div>
            <p className="note">
              If this persists, it is a server-side configuration problem rather than
              anything to do with your account or password.
            </p>
          </>
        ) : (
          <>
            <p className="login-intro">
              Manage students, applications, programmes, intakes and enrolments.
              Sign in with your Zylker Academy staff account to continue.
            </p>

            {/* Catalyst renders its sign-in form into this element. */}
            <div id={SIGNIN_ELEMENT_ID} className="login-embed" aria-live="polite" />

            {phase === PHASE.CHECKING && (
              <p className="muted login-status" role="status">Checking your session…</p>
            )}

            {phase === PHASE.FORM_FAILED && (
              <div className="state err" role="alert">
                <h3>The sign-in form could not be loaded</h3>
                <p>{detail || 'The sign-in service did not respond.'}</p>
                <button type="button" className="btn" onClick={() => window.location.reload()}>
                  Reload the page
                </button>
              </div>
            )}

            {phase === PHASE.SDK_UNAVAILABLE && (
              <div className="state err" role="alert">
                <h3>Sign-in is unavailable</h3>
                <p>
                  The Catalyst sign-in service could not be loaded. Check your connection
                  and reload the page.
                </p>
                <button type="button" className="btn" onClick={() => window.location.reload()}>
                  Reload the page
                </button>
              </div>
            )}

            {/* An unreachable backend is a different problem from a bad password,
                and says so rather than implying the credentials were wrong. */}
            {status === STATUS.UNAVAILABLE && (
              <div className="state err" role="alert">
                <h3>The service could not be reached</h3>
                <p>
                  {sessionError?.message
                    || 'Your sign-in could not be verified because the service did not respond.'}
                </p>
                <button type="button" className="btn" onClick={recheck}>Try again</button>
              </div>
            )}
          </>
        )}

        <footer className="login-foot">
          <p className="muted">
            Student, application and finance data is read live from Zoho CRM, Zoho Learn
            and Zoho Books. Access is restricted to authorised staff.
          </p>
        </footer>
      </main>
    </div>
  );
}
