# Catalyst Advanced I/O — `getCurrentUser()` returns null for a valid signed-in project user

**Prepared for:** Zoho Catalyst support
**Date:** 27 July 2026
**Severity:** Blocking — application cannot resolve the signed-in user server-side, so no authenticated action can be gated by identity.

## Environment

- Org `20117369913`, project `Zylker-Academy` id `11922000000014048`, EU data centre, Development environment.
- Advanced I/O function `zylker_api` (`node18`), served at `https://zylker-academy-20117369913.development.catalystserverless.eu/server/zylker_api/`.
- Client served from `/app/index.html`, using the Catalyst Web SDK `4.6.2` embedded authentication.
- SDK: `zcatalyst-sdk-node@3.4.0` (latest published at time of writing).
- Project authentication: **embedded** is enabled.

## Summary

A user signs in through the Web SDK. The browser holds a valid Catalyst session — the SDK's own `catalyst.auth.isUserAuthenticated()` returns HTTP 200 with the full user profile (App Administrator, `user_id 11922000000014079`, confirmed). The gateway forwards the session to the Advanced I/O function correctly: the IAM session cookies arrive, and the platform injects a valid user credential token.

Despite this, inside the function:

```js
const app = catalyst.initialize(req, { scope: 'user' });
const user = await app.userManagement().getCurrentUser();
// user === null
```

`getCurrentUser()` resolves to `null` rather than throwing. The underlying call to `GET /project-user/current` returns **HTTP 200, `application/json`, body `{"status":"success","data":null}`** — the credential is accepted, but no user record is returned.

## What the gateway actually delivers to the function

Captured from a diagnostic route that reports header/cookie **names** and structural facts only (no values):

- IAM session cookies present: `_iamadt_client_30042543308`, `_iambdt_client_30042543308`, `__Secure-iamsdt_client_30042543308`, `_z_identity`.
- Platform-injected headers present: `x-zc-user-cred-token` (length 70), `x-zc-user-cred-type: token`, `x-zc-user-id: 11922000000014079`, `x-zc-user-type: project-user`, plus the admin cred headers.
- Catalyst Connections resolve and work in the same request: a CRM COQL probe returns rows and a Zoho Learn listing returns courses. So the function's outbound platform auth is healthy; only the *inbound user identity* fails to resolve.

So the credential the SDK needs is present and, per the endpoint's own `status: "success"`, valid.

## Reproduction

1. Deploy an Advanced I/O function; enable embedded authentication on the project.
2. Sign in through the Web SDK so the browser holds a Catalyst session (`isUserAuthenticated()` returns the profile).
3. In the function, call `catalyst.initialize(req, { scope: 'user' }).userManagement().getCurrentUser()`.
4. Observe it resolves `null`. Issuing the same authorized `GET /project-user/current` through the SDK's HTTP client returns `200 application/json {"status":"success","data":null}`.

## Evidence chain (chronological)

1. **Before embedded auth** — `initialize(req,{scope:'user'})` threw `no user credentials present for catalyst app initialized in user scope`. Traced to the SDK (`lib/utils/credential.js`, strict-scope branch) rejecting a session whose `x-zc-user-type` was `admin`.
2. **After enabling embedded auth and a fresh sign-out/sign-in** — `x-zc-user-type` changed from `admin` to `project-user`, and a 70-character `x-zc-user-cred-token` is now injected. The strict-scope exception no longer fires.
3. **Current state** — `getCurrentUser()` resolves `null`; `GET /project-user/current` returns `200 {"status":"success","data":null}`.

The user `11922000000014079` is a confirmed App Administrator project user (verified via the project-users listing). The gateway identifies this exact user in `x-zc-user-id`, yet `/project-user/current` returns an empty record for the same session.

## ROOT CAUSE FOUND — 28 July 2026

The SDK is not at fault. It is being handed a credential the platform will not resolve.

`CatalystCredential` (`lib/utils/credential.js`, v3.4.0) selects the user credential by switching on the `x-zc-user-cred-type` request header:

```
'token'   -> AccessTokenCredential(x-zc-user-cred-token)
'ticket'  -> TicketCredential(x-zc-user-cred-token)
default   -> CookieCredential(x-zc-cookie)
```

On this project the gateway sets `x-zc-user-cred-type: token` and injects a 70-character `x-zc-user-cred-token`. The SDK therefore authenticates to `/project-user/current` with **that token**, and the platform answers `{"status":"success","data":null}` for it.

The same session, presented as **cookies**, resolves perfectly. Measured against the live deployment from the browser:

| Credential presented to `/baas/v1/project/11922000000014048/project-user/current` | Result |
|---|---|
| IAM session cookies | **200** — full user record (`user_id 11922000000014079`, App Administrator) |
| IAM session cookies, no CSRF header | **200** — full user record |
| none | **401** — no record |
| `x-zc-user-cred-token` (what the SDK uses) | **200** with `data: null` |

A second Catalyst application in the same estate (`crm_api`, project `CRM-2`) calls `catalyst.initialize(req).userManagement().getCurrentUser()` and works. The difference is not the code — it is identical — but that its gateway does not inject a user credential token, so the SDK falls through to the cookie credential.

**So the question below narrows to one thing:** why does the gateway on this project mint an `x-zc-user-cred-token` that `/project-user/current` will not resolve, when the cookie for the same session resolves fine?

### Workaround adopted

`identity.js` tries `initialize(req)` first, and if that yields nothing, re-initialises with `x-zc-user-cred-type` and `x-zc-user-cred-token` **withheld**, so the SDK falls through to the cookie credential the gateway also supplied.

This is credential *selection*, not forgery: nothing is added to the request, two headers are withheld, and both credentials are issued and validated by Catalyst. A caller with no genuine session still authenticates as nobody.

## Questions for support

1. Under what conditions does `GET /project-user/current` return `{"status":"success","data":null}` for a session that the Web SDK reports as fully authenticated, and whose `x-zc-user-cred-token` the gateway injects into the function?
2. Does `/project-user/current` require the caller to have signed in through a specific flow (e.g. the Catalyst-managed embedded signup) rather than being added as a project user / org admin, in order to be resolvable?
3. Is there a mapping step (project-user record vs. IAM identity) that must be completed for `getCurrentUser()` to resolve, given the user is already confirmed with role App Administrator?

## Security note — the platform `x-zc-*` identity headers are client-injectable

While diagnosing, a request was sent from the browser with a forged `x-zc-user-id` and `x-zc-user-type`. The function received **both** the gateway's value and the client's, concatenated (e.g. `x-zc-user-id: 11922000000014079, 999999999999999`). The Catalyst gateway does **not** strip or override client-supplied `x-zc-*` headers on the way in.

Implication for any Catalyst application: server-side authorization must **never** read identity from `x-zc-user-id` / `x-zc-user-type` directly, because a caller can inject them. Identity must come only from the SDK's validated credential resolution (which verifies the signed `x-zc-user-cred-token`). This application does exactly that — the single security boundary is `requirePermission()` in `auth.js`, which relies on the SDK, not on raw headers — and no workaround that trusts these headers will be adopted, even though it would make the demo "work" today.

## Application status

> **Update, 28 July 2026.** The paragraphs below described the previous build,
> in which the identity layer had been removed. That is no longer the case — the
> application has been rewritten as an authenticated portal. This section is
> retained because it is the context in which the question above was raised.

### Previous posture (superseded)

Because `getCurrentUser()` could not be made to resolve, the identity layer was removed from the application entirely rather than shipped as a login that cannot succeed. As it stood: no authentication and no authorisation; every endpoint, including create/update/delete against the live CRM org, reachable anonymously by anyone who knew the function URL. Correctness controls were retained (field allow-listing, stage-transition rules against the real picklist, optimistic concurrency, read-after-write confirmation, request-size limit, JSON content-type check, correlation ids, redacted upstream errors, audit logging with null actor columns).

### Current posture

- **Every route requires authentication**, enforced by `requireAuth` in `functions/zylker_api/auth.js`. The only exception is `/api/health`, which returns a constant and reads nothing. Verified by an offline test that walks the route table and asserts `401` on each.
- **Every write route additionally names a required permission**, enforced by `requirePermission` against the role matrix in `permissions.js`.
- **Identity resolution has been made pluggable.** `identity.js` tries four strategies in order — `initialize(req,{scope:'user'}).userManagement().getCurrentUser()`, the same under default scope, the SDK's `authentication()` namespace where present, and a direct authorized call to `/project-user/current` through the SDK's own requester. Each is independently safe; the first that returns a user wins. `GET /api/diag` reports what every strategy did on the current request, which is the evidence this report was asking for.
- **There is deliberately no header-trusting fallback**, and there must not be one. The finding in the section above — that the gateway does not strip client-supplied `x-zc-*` headers — means any authorization derived from them is bypassable. A test asserts that `identity.js` contains no reference to those headers outside comments.
- **The application fails closed.** If no strategy resolves a user, every request is `401` and the app is unusable rather than open. That is the intended behaviour while the question below is outstanding.

**The question in this report therefore still stands, and is now the single blocker to the application being usable at all** rather than a blocker to it being safe.
