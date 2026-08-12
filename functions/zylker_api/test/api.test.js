'use strict';
/**
 * Offline verification suite.
 *
 * Runs the real express app and the real write handlers against a stubbed Zoho
 * layer, so the rules that matter — authentication, authorization, stage
 * transitions, duplicate prevention, idempotency, capacity, relationship
 * integrity — are exercised without touching the live CRM org.
 *
 * This does NOT replace verification against the deployed application. It
 * proves the logic is correct; only a deployment can prove Catalyst resolves an
 * identity and that the Zoho connections carry the right scopes.
 *
 * Run with:  node --test functions/zylker_api/test/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

/* ---------------------------- request helper ---------------------------- */

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => resolve(server));
  });
}

function request(server, method, path, { body, headers = {} } = {}) {
  const payload = body === undefined ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: server.address().port,
      method,
      path,
      headers: {
        Accept: 'application/json',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers
      }
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = raw; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/* --------------------------- unauthenticated ---------------------------- */

test('every route except /api/health rejects an unauthenticated caller', async (t) => {
  // No bypass: identity.js cannot resolve a user outside Catalyst, so this is
  // exactly the anonymous case.
  delete process.env.ZYLKER_AUTH_BYPASS;
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  const app = require('../index.js');
  const server = await listen(app);
  t.after(() => server.close());

  const health = await request(server, 'GET', '/api/health');
  assert.equal(health.status, 200, '/api/health is a liveness probe and stays open');

  // The diagnostics route must not exist unless it is explicitly switched on.
  const diagOff = await request(server, 'GET', '/api/auth-diag');
  assert.equal(diagOff.status, 404, '/api/auth-diag is 404 unless AUTH_DIAG=true');

  const protectedRoutes = [
    ['GET', '/api/me'], ['GET', '/api/dashboard'], ['GET', '/api/attention'], ['GET', '/api/students'],
    ['GET', '/api/students/123'], ['GET', '/api/applications'], ['GET', '/api/programmes'],
    ['GET', '/api/intakes'], ['GET', '/api/enrolments'],
    ['GET', '/api/invoices'], ['GET', '/api/invoices/1'], ['GET', '/api/students/1/invoices'],
    ['GET', '/api/tickets'], ['GET', '/api/tickets/1'], ['GET', '/api/students/1/tickets'],
    ['GET', '/api/integration-status'], ['GET', '/api/activity'], ['GET', '/api/diag'],
    // Global search reads the same CRM modules as the list pages and is no less
    // protected than they are.
    ['GET', '/api/search?q=murphy'],
    // External LMS Connector — the Catalyst dataset is no less protected than
    // the CRM data it maps to.
    ['GET', '/api/lms/courses'], ['GET', '/api/lms/courses/1'],
    ['GET', '/api/lms/enrolments'], ['GET', '/api/lms/enrolments/1'],
    ['GET', '/api/lms/sync-log'],
    ['GET', '/api/students/1/learning'], ['GET', '/api/enrolments/1/learning']
  ];
  for (const [method, path] of protectedRoutes) {
    const res = await request(server, method, path);
    assert.equal(res.status, 401, `${method} ${path} must be 401 when unauthenticated`);
    assert.equal(res.body.error.code, 'UNAUTHENTICATED');
  }

  const writeRoutes = [
    ['POST', '/api/students', { lastName: 'Test' }],
    ['PATCH', '/api/students/1', { lastName: 'Test' }],
    ['DELETE', '/api/students/1', undefined],
    ['POST', '/api/applications', { programmeId: '1' }],
    ['POST', '/api/applications/1/transition', { toStage: 'Enrolled' }],
    ['DELETE', '/api/applications/1', undefined],
    ['POST', '/api/programmes', { name: 'X' }],
    ['DELETE', '/api/programmes/1', undefined],
    ['POST', '/api/intakes', { name: 'X', programmeId: '1' }],
    ['DELETE', '/api/intakes/1', undefined],
    ['POST', '/api/enrolments', { studentId: '1' }],
    ['POST', '/api/enrolments/1/complete', {}],
    ['POST', '/api/notes', { entityType: 'student', recordId: '1', note: 'x' }],
    ['DELETE', '/api/enrolments/1', undefined],
    ['POST', '/api/lms/courses', { provider: 'Moodle', externalCourseId: 'X', name: 'X' }],
    ['PATCH', '/api/lms/courses/1', { name: 'X' }],
    ['POST', '/api/lms/courses/1/map', { programmeId: '1' }],
    ['POST', '/api/lms/courses/1/sync', {}],
    ['POST', '/api/lms/courses/bulk-sync', {}],
    ['POST', '/api/lms/enrolments', { provider: 'Moodle', externalEnrolmentId: 'X' }],
    ['PATCH', '/api/lms/enrolments/1', { progressPercentage: 10 }],
    ['POST', '/api/lms/enrolments/1/map', {}],
    ['POST', '/api/lms/enrolments/1/sync', {}],
    ['POST', '/api/lms/enrolments/1/create-crm-enrolment', { intakeId: '1' }],
    ['POST', '/api/admin/bootstrap-sync', {}]
  ];
  for (const [method, path, body] of writeRoutes) {
    const res = await request(server, method, path, { body });
    assert.equal(res.status, 401, `${method} ${path} must be 401 when unauthenticated`);
  }
});

/* ------------------------------ permissions ----------------------------- */

test('the permission matrix grants only what each role should hold', () => {
  const perms = require('../permissions.js');
  const { ROLES, P, can } = perms;

  // Administrator holds everything, including the capacity override.
  Object.values(P).forEach((p) => {
    assert.equal(can(ROLES.ADMINISTRATOR, p), true, `administrator should hold ${p}`);
  });

  // Viewer reads but never writes.
  assert.equal(can(ROLES.VIEWER, P.STUDENT_READ), true);
  assert.equal(can(ROLES.VIEWER, P.STUDENT_WRITE), false);
  assert.equal(can(ROLES.VIEWER, P.APPLICATION_TRANSITION), false);
  assert.equal(can(ROLES.VIEWER, P.INVOICE_READ), false, 'viewer has no finance access');
  assert.equal(can(ROLES.VIEWER, P.TICKET_READ), true, 'unlike invoices, ticket data is not finance-restricted');

  // Admissions owns students and applications, not the delivery structure.
  assert.equal(can(ROLES.ADMISSIONS, P.STUDENT_WRITE), true);
  assert.equal(can(ROLES.ADMISSIONS, P.APPLICATION_TRANSITION), true);
  assert.equal(can(ROLES.ADMISSIONS, P.PROGRAMME_WRITE), false);
  assert.equal(can(ROLES.ADMISSIONS, P.INTAKE_WRITE), false);

  // Academic owns the delivery structure, not applicants.
  assert.equal(can(ROLES.ACADEMIC, P.PROGRAMME_WRITE), true);
  assert.equal(can(ROLES.ACADEMIC, P.INTAKE_WRITE), true);
  assert.equal(can(ROLES.ACADEMIC, P.ENROLMENT_WRITE), true);
  assert.equal(can(ROLES.ACADEMIC, P.STUDENT_WRITE), false);

  // Finance reads invoices and writes nothing at all.
  assert.equal(can(ROLES.FINANCE, P.INVOICE_READ), true);
  assert.equal(can(ROLES.FINANCE, P.STUDENT_READ), true);
  assert.equal(can(ROLES.FINANCE, P.STUDENT_WRITE), false);

  // Nobody but an administrator may override an intake capacity.
  [ROLES.ADMISSIONS, ROLES.ACADEMIC, ROLES.FINANCE, ROLES.VIEWER].forEach((r) => {
    assert.equal(can(r, P.CAPACITY_OVERRIDE), false, `${r} must not override capacity`);
  });

  // An unknown role grants nothing — failing closed.
  assert.equal(can('superuser', P.STUDENT_READ), false);
  assert.equal(can(null, P.STUDENT_READ), false);
});

test('roles resolve from ZYLKER_ROLE_MAP, then the Catalyst role, then the default', () => {
  const path = require.resolve('../permissions.js');
  delete require.cache[path];
  process.env.ZYLKER_ROLE_MAP = JSON.stringify({
    'ADMISSIONS@zylker.com': 'admissions',
    'bad@zylker.com': 'not-a-role'
  });
  process.env.ZYLKER_DEFAULT_ROLE = 'viewer';
  const perms = require('../permissions.js');

  // Email lookup wins, and is case-insensitive.
  assert.equal(perms.roleFor({ email: 'admissions@zylker.com', catalystRole: 'App User' }), 'admissions');
  // An invalid role in the map is ignored rather than applied.
  assert.equal(perms.roleFor({ email: 'bad@zylker.com', catalystRole: 'App User' }), 'viewer');
  // Catalyst App Administrator maps to administrator.
  assert.equal(perms.roleFor({ email: 'someone@zylker.com', catalystRole: 'App Administrator' }), 'administrator');
  // Everyone else falls to the configured default.
  assert.equal(perms.roleFor({ email: 'other@zylker.com', catalystRole: 'App User' }), 'viewer');

  delete process.env.ZYLKER_ROLE_MAP;
  delete process.env.ZYLKER_DEFAULT_ROLE;
  delete require.cache[path];
});

test('identity never derives a user from request headers', () => {
  const identity = require('../identity.js');
  // A forged gateway header must not produce a user. normaliseUser only accepts
  // an object the SDK returned; the header value is a string and is rejected.
  assert.equal(identity.normaliseUser('11922000000014079', 'forged'), null);
  assert.equal(identity.normaliseUser({ 'x-zc-user-id': '999' }, 'forged'), null);
  assert.equal(identity.normaliseUser(null, 'forged'), null);
  // A genuine SDK payload does resolve.
  const u = identity.normaliseUser(
    { user_id: '1', email_id: 'a@b.com', first_name: 'A', last_name: 'B', role_details: { role_name: 'App Administrator' } },
    'sdk_user_scope'
  );
  assert.equal(u.id, '1');
  assert.equal(u.catalystRole, 'App Administrator');
  assert.equal(u.resolvedBy, 'sdk_user_scope');

  // The source file must contain no header-trusting fallback.
  const src = require('node:fs').readFileSync(require.resolve('../identity.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');   // strip comments
  assert.ok(!/x-zc-user-id/.test(code), 'identity.js must not read x-zc-user-id outside comments');
  assert.ok(!/x-zc-user-type/.test(code), 'identity.js must not read x-zc-user-type outside comments');
});

test('forwarded-session validation refuses to act without a credential', async () => {
  const identity = require('../identity.js');
  const strategy = identity.STRATEGIES.find((s) => s.name === 'catalyst_session_forwarded');
  assert.ok(strategy, 'the forwarded-session strategy should exist');

  // No cookie means no credential. The strategy rejects rather than calling
  // out, so the reason is recorded instead of looking like "not signed in".
  await assert.rejects(() => strategy.run({ headers: {} }), /no cookie header/);

  // An identity header on its own is not a credential and must never resolve.
  await assert.rejects(
    () => strategy.run({ headers: { 'x-zc-user-id': '11922000000014079' } }),
    /no cookie header/,
    'an identity header alone must never authenticate anyone'
  );

  // And resolveUser turns that rejection into "unauthenticated", not a crash.
  const { user, attempts } = await identity.resolveUser({ headers: {} });
  assert.equal(user, null);
  const forwarded = attempts.find((a) => a.strategy === 'catalyst_session_forwarded');
  assert.equal(forwarded.resolvedUser, false);
  assert.match(forwarded.error, /no cookie header/);
});

test('the cookie-credential strategy withholds headers rather than adding any', async () => {
  const identity = require('../identity.js');
  const strategy = identity.STRATEGIES.find((s) => s.name === 'sdk_cookie_credential');
  assert.ok(strategy, 'the cookie-credential strategy should exist');

  // Without the gateway's cookie header there is nothing to fall back to, and
  // it must say so rather than inventing a credential.
  await assert.rejects(
    () => strategy.run({ headers: { 'x-zc-user-cred-type': 'token', 'x-zc-user-cred-token': 'abc' } }),
    /no x-zc-cookie header/
  );

  // The request object itself is never mutated — the next strategy must still
  // see the original headers.
  const req = {
    headers: {
      'x-zc-user-cred-type': 'token',
      'x-zc-user-cred-token': 'abc',
      'x-zc-project-id': '1'
    }
  };
  await strategy.run(req).catch(() => {});
  assert.equal(req.headers['x-zc-user-cred-type'], 'token', 'the original request must be untouched');
  assert.equal(req.headers['x-zc-user-cred-token'], 'abc');

  // And the strategy adds nothing: its header set is a strict subset of the
  // request's, minus exactly the two credential-selection headers.
  const src = require('node:fs').readFileSync(require.resolve('../identity.js'), 'utf8');
  const body = src.slice(src.indexOf("name: 'sdk_cookie_credential'"));
  const fn = body.slice(0, body.indexOf('\n  },'));
  assert.ok(/delete headers\['x-zc-user-cred-type'\]/.test(fn));
  assert.ok(/delete headers\['x-zc-user-cred-token'\]/.test(fn));
  assert.ok(!/headers\[[^\]]+\]\s*=/.test(fn), 'the strategy must not set any header');
});

test('session validation is only ever addressed to a Catalyst host', () => {
  const { platformBaseUrlFrom } = require('../identity.js')._internals;

  // The real gateway is accepted.
  assert.equal(
    platformBaseUrlFrom({ headers: { host: 'zylker-academy-20117369913.development.catalystserverless.eu' } }),
    'https://zylker-academy-20117369913.development.catalystserverless.eu'
  );

  // Catalyst's own project-domain header wins over Host, because the gateway
  // may rewrite Host to something internal.
  assert.equal(
    platformBaseUrlFrom({
      headers: {
        'x-zc-project-domain': 'zylker-academy-20117369913.development.catalystserverless.eu',
        host: 'internal-gateway.local'
      }
    }),
    'https://zylker-academy-20117369913.development.catalystserverless.eu'
  );

  // A scheme or trailing path on that header is tolerated.
  assert.equal(
    platformBaseUrlFrom({ headers: { 'x-zc-project-domain': 'https://zylker.catalystserverless.eu/' } }),
    'https://zylker.catalystserverless.eu'
  );

  // An unusable project-domain header falls through to Host rather than giving up.
  assert.equal(
    platformBaseUrlFrom({
      headers: { 'x-zc-project-domain': '', host: 'zylker.catalystserverless.eu' }
    }),
    'https://zylker.catalystserverless.eu'
  );

  // A spoofed Host must not redirect validation to someone else's server —
  // that server would happily answer "yes, they're an administrator".
  const hostile = [
    'evil.example.com',
    'catalystserverless.eu.evil.com',
    'zylker.catalystserverless.eu.attacker.net',
    'localhost:3000',
    ''
  ];
  hostile.forEach((host) => {
    assert.equal(platformBaseUrlFrom({ headers: { host } }), null, `${host} must be rejected`);
  });

  // A comma-joined header (the gateway appends rather than replaces) uses the
  // first value and still has to pass the check.
  assert.equal(
    platformBaseUrlFrom({ headers: { host: 'evil.com, zylker.catalystserverless.eu' } }),
    null
  );
});

/* ---------------------------- global search ----------------------------- */

/**
 * Search is exercised against a stubbed CRM so the shape of the response, the
 * minimum-query rule and the fields it matches on can be asserted without
 * touching the live org.
 */
test('global search groups results by entity, matches references, and refuses a short query', async (t) => {
  const zohoPath = require.resolve('../zoho.js');
  for (const k of Object.keys(require.cache)) delete require.cache[k];

  const queries = [];
  const rows = {
    Contacts: [{ id: '1', First_Name: 'Aoife', Last_Name: 'Murphy', Email: 'aoife@example.com',
      Student_ID: 'STU-0001', Student_Status: 'Active', Created_Time: 'T' }],
    Deals: [{ id: '30', Deal_Name: 'Murphy — MSc Data', Application_ID: 'APP-0030',
      Stage: 'Submitted', Contact_Name: { id: '1', name: 'Aoife Murphy' }, Created_Time: 'T' }],
    Enrolments: [{ id: '50', Name: 'ENR-0050', Student: { id: '1', name: 'Aoife Murphy' },
      Enrolment_Status: 'Active', Created_Time: 'T' }],
    Products: [{ id: '70', Product_Name: 'MSc Data Science', Product_Code: 'MSC-DS', Created_Time: 'T' }],
    Intakes: [{ id: '90', Name: 'September 2026', Intake_ID: 'INT-0090', Created_Time: 'T' }]
  };

  // Substituting the module wholesale is the smallest stub that still runs the
  // real route, the real permission check and the real normalisers.
  require.cache[zohoPath] = {
    id: zohoPath,
    filename: zohoPath,
    loaded: true,
    exports: {
      async crmQuery(req, q) {
        queries.push(q);
        const m = /from\s+(\w+)/.exec(q);
        return rows[m && m[1]] || [];
      },
      safeError: (err) => ({ status: 502, detail: 'stub', service: 'crm' })
    }
  };

  process.env.ZYLKER_AUTH_BYPASS = 'true';
  const app = require('../index.js');
  const server = await listen(app);
  t.after(() => {
    server.close();
    delete process.env.ZYLKER_AUTH_BYPASS;
    for (const k of Object.keys(require.cache)) delete require.cache[k];
  });

  // Below the minimum length: answered without touching the CRM at all.
  const short = await request(server, 'GET', '/api/search?q=m');
  assert.equal(short.status, 200);
  assert.equal(short.body.meta.tooShort, true);
  assert.deepEqual(short.body.data.groups, []);
  assert.equal(queries.length, 0, 'a too-short query must not reach the CRM');

  // A name that appears on a student and on an application groups under both.
  const byName = await request(server, 'GET', '/api/search?q=murphy');
  assert.equal(byName.status, 200);
  const entities = byName.body.data.groups.map((g) => g.entity);
  assert.ok(entities.includes('student'), 'the student should match on name');
  assert.ok(entities.includes('application'), 'the application should match on its title');
  assert.ok(entities.includes('enrolment'), 'the enrolment should match on its student name');

  const student = byName.body.data.groups.find((g) => g.entity === 'student').items[0];
  assert.equal(student.label, 'Aoife Murphy');
  assert.equal(student.to, '/students/1', 'every result links straight to its record');
  assert.equal(student.reference, 'STU-0001');

  // Staff quote references to each other, so references have to be searchable.
  const byRef = await request(server, 'GET', '/api/search?q=INT-0090');
  assert.deepEqual(byRef.body.data.groups.map((g) => g.entity), ['intake']);
  assert.equal(byRef.body.data.groups[0].items[0].to, '/intakes/90');

  // A term nobody holds returns an empty result, not an error.
  const none = await request(server, 'GET', '/api/search?q=zzzznotarecord');
  assert.equal(none.status, 200);
  assert.equal(none.body.data.total, 0);
  assert.deepEqual(none.body.data.groups, []);
});

/* --------------------------- reconciliation gate ------------------------- */

/**
 * /api/admin/reconcile-sync is invoked by a Catalyst Cron Job, not a signed-in
 * user — it has no Catalyst session to check, so it is authorized by a shared
 * secret instead of requireAuth. This is the one route the "every route
 * rejects an unauthenticated caller" test above cannot cover, since it never
 * carries a Catalyst identity in the first place, authenticated or not.
 */
test('reconcile-sync is gated by a shared secret, not a Catalyst session', async (t) => {
  delete process.env.RECONCILE_SECRET;
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  const app = require('../index.js');
  const server = await listen(app);
  t.after(() => { server.close(); delete process.env.RECONCILE_SECRET; });

  // No secret configured on the deployment at all: refused outright, even
  // with a header supplied, so a misconfigured deployment fails closed.
  const noSecretConfigured = await request(server, 'POST', '/api/admin/reconcile-sync',
    { body: {}, headers: { 'x-reconcile-secret': 'anything' } });
  assert.equal(noSecretConfigured.status, 401);

  process.env.RECONCILE_SECRET = 'test-secret';
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  const app2 = require('../index.js');
  const server2 = await listen(app2);
  t.after(() => server2.close());

  const missingHeader = await request(server2, 'POST', '/api/admin/reconcile-sync', { body: {} });
  assert.equal(missingHeader.status, 401);

  const wrongSecret = await request(server2, 'POST', '/api/admin/reconcile-sync',
    { body: {}, headers: { 'x-reconcile-secret': 'wrong' } });
  assert.equal(wrongSecret.status, 401);

  // A bad entity list is refused before anything reaches the CRM.
  const badEntities = await request(server2, 'POST', '/api/admin/reconcile-sync',
    { body: { entities: ['not-a-real-entity'] }, headers: { 'x-reconcile-secret': 'test-secret' } });
  assert.equal(badEntities.status, 400);
  assert.equal(badEntities.body.error.code, 'INVALID_ENTITIES');
});
