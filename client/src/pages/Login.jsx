import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../AuthContext.jsx';
import * as catalystAuth from '../catalystAuth.js';
import { useT } from '../i18n/I18nContext.jsx';
import LanguageToggle from '../i18n/LanguageToggle.jsx';
import Logo from '../components/Logo.jsx';

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
  const t = useT();
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
        <LanguageToggle />
        <header className="login-head">
          <Logo size={38} />
          <div>
            <p className="brand">Zylker Academy</p>
            <p className="brand-sub">{t('login.brandSub')}</p>
          </div>
        </header>

        {phase === PHASE.SERVER_REFUSED ? (
          <>
            <p className="login-intro">
              {t('login.serverRefused.before')}{' '}
              <strong>{browserUser?.email_id || browserUser?.email || t('login.serverRefused.thisAccount')}</strong>
              {t('login.serverRefused.after')}
            </p>
            <div className="state err" role="alert">
              <h3>{t('login.serverRefused.title')}</h3>
              <p>{t('login.serverRefused.body')}</p>
              <div className="head-actions">
                <button type="button" className="btn primary" onClick={recheck}>{t('common.tryAgain')}</button>
                <button type="button" className="btn" onClick={signOut}>{t('common.signOut')}</button>
              </div>
            </div>
            <p className="note">{t('login.serverRefused.note')}</p>
          </>
        ) : (
          <>
            <p className="login-intro">{t('login.intro')}</p>

            {/* Catalyst renders its sign-in form into this element. */}
            <div id={SIGNIN_ELEMENT_ID} className="login-embed" aria-live="polite" />

            {phase === PHASE.CHECKING && (
              <p className="muted login-status" role="status">{t('login.checkingSession')}</p>
            )}

            {phase === PHASE.FORM_FAILED && (
              <div className="state err" role="alert">
                <h3>{t('login.formFailed.title')}</h3>
                <p>{detail || t('login.formFailed.fallbackDetail')}</p>
                <button type="button" className="btn" onClick={() => window.location.reload()}>
                  {t('login.formFailed.reload')}
                </button>
              </div>
            )}

            {phase === PHASE.SDK_UNAVAILABLE && (
              <div className="state err" role="alert">
                <h3>{t('login.sdkUnavailable.title')}</h3>
                <p>{t('login.sdkUnavailable.body')}</p>
                <button type="button" className="btn" onClick={() => window.location.reload()}>
                  {t('login.formFailed.reload')}
                </button>
              </div>
            )}

            {/* An unreachable backend is a different problem from a bad password,
                and says so rather than implying the credentials were wrong. */}
            {status === STATUS.UNAVAILABLE && (
              <div className="state err" role="alert">
                <h3>{t('login.serviceUnavailable.title')}</h3>
                <p>{sessionError?.message || t('login.serviceUnavailable.fallbackDetail')}</p>
                <button type="button" className="btn" onClick={recheck}>{t('common.tryAgain')}</button>
              </div>
            )}
          </>
        )}

        <footer className="login-foot">
          <p className="muted">{t('login.footer')}</p>
        </footer>
      </main>
    </div>
  );
}
