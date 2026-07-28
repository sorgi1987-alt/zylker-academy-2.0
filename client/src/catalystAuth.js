/**
 * Thin wrapper over the Catalyst Web SDK's authentication surface.
 *
 * Everything the browser knows about the session lives behind this module, so
 * the rest of the client never touches `window.catalyst` directly. That matters
 * for two reasons:
 *
 *  1. The SDK is loaded from a <script> tag in index.html, so it may not exist
 *     yet when React mounts. `ready()` resolves that race in one place instead
 *     of every caller guarding for it.
 *
 *  2. The browser's view of the session is a CONVENIENCE, never a permission.
 *     It decides which screen to show. It never decides what data may be read
 *     or written — the Catalyst function re-derives identity and role from a
 *     validated credential on every single request.
 */

const SDK_TIMEOUT_MS = 10000;

/** Resolves the SDK once the <script> tags have executed, or throws. */
let readyPromise;
export function ready() {
  if (readyPromise) return readyPromise;
  readyPromise = new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const c = typeof window !== 'undefined' ? window.catalyst : null;
      if (c && c.auth) return resolve(c);
      if (Date.now() - started > SDK_TIMEOUT_MS) {
        return reject(new Error(
          'The sign-in service could not be loaded. Check your connection and reload the page.'));
      }
      return setTimeout(tick, 100);
    };
    tick();
  });
  return readyPromise;
}

/**
 * Returns the signed-in user according to the browser, or null.
 *
 * The SDK rejects rather than resolving null when there is no session, so a
 * rejection here means "not signed in" and is not surfaced as an error.
 */
export async function currentUser() {
  const c = await ready();
  try {
    const res = await c.auth.isUserAuthenticated();
    // The SDK has returned both the bare profile and a { content } envelope
    // across versions; accept either rather than assuming one.
    const u = res && (res.content || res.data || res);
    return u && (u.user_id || u.email_id) ? u : null;
  } catch {
    return null;
  }
}

/**
 * Renders Catalyst's embedded sign-in form into the given element id.
 *
 * The form itself is served by Catalyst, so email/password handling, error
 * messages and the forgotten-password link are all Catalyst's — this
 * application never sees or transports a password. `signIn` is idempotent per
 * element; calling it twice would stack two iframes, so the caller guards.
 */
export async function renderSignIn(elementId) {
  const c = await ready();
  return c.auth.signIn(elementId);
}

/**
 * Ends the session and returns the browser to `redirectUrl`.
 *
 * A full page load rather than a client-side route change is deliberate: it
 * discards all in-memory state, so no previously-loaded student or invoice data
 * can remain on screen after sign-out.
 */
export async function signOut(redirectUrl) {
  const c = await ready();
  const target = redirectUrl || `${window.location.origin}${window.location.pathname}`;
  return c.auth.signOut(target);
}

/**
 * Whether the SDK loaded at all. Used to tell "you are signed out" apart from
 * "sign-in is unavailable", which are very different things for the user.
 */
export async function sdkAvailable() {
  try {
    await ready();
    return true;
  } catch {
    return false;
  }
}
