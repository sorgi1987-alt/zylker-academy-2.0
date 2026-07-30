'use strict';
/**
 * Zylker Academy API — authenticated education management.
 *
 * Route table shape: every route below is registered with `requireAuth` first
 * and, for writes, a named permission. There is deliberately no route that
 * skips `requireAuth` other than /api/health, which returns a constant and
 * touches no data. If you add a route, add it to one of the arrays below rather
 * than calling app.get/app.post directly — that is what keeps "every endpoint
 * is protected" checkable by reading one file.
 */
const express = require('express');
const cfg = require('./config');
const z = require('./zoho');
const n = require('./normalise');
const auth = require('./auth');
const perms = require('./permissions');
const identity = require('./identity');
const writes = require('./writes');
const books = require('./books');
const lms = require('./lms');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));   // request-size limit
app.use(auth.requestId);

/* --------------------------- response helpers -------------------------- */

const ok = (res, data, meta = {}) =>
  res.status(200).json({ data, meta: { retrievedAt: new Date().toISOString(), ...meta } });

const fail = (res, status, code, message, service) =>
  res.status(status).json({ error: { code, message, service: service || null } });

/** Unauthenticated liveness probe. Returns a constant; reads nothing. */
app.get('/api/health', (req, res) => ok(res, { ok: true }));

/**
 * Authentication diagnostics — the ONLY other unauthenticated route.
 *
 * It exists because the authenticated diagnostics endpoint cannot help when the
 * problem is that authentication itself will not resolve: `/api/diag` would
 * answer 401 for exactly the reason being investigated.
 *
 * Guard rails, because this is reachable without signing in:
 *   - Disabled unless AUTH_DIAG=true is set in the environment. Off by default,
 *     404 otherwise, so it does not exist on a normal deployment.
 *   - Returns header NAMES and cookie NAMES only, never their values. A session
 *     cookie value is a credential and would be a login if leaked.
 *   - Returns no user record, no email, no CRM data — only whether resolution
 *     succeeded and, when it failed, a redacted reason.
 *
 * Turn it on, read it, turn it off again.
 */
app.get('/api/auth-diag', async (req, res) => {
  if (process.env.AUTH_DIAG !== 'true') {
    return fail(res, 404, 'NO_ROUTE', 'Unknown endpoint.');
  }

  const cookieHeader = String((req.headers && req.headers.cookie) || '');
  const cookieNames = cookieHeader
    ? cookieHeader.split(';').map((c) => c.split('=')[0].trim()).filter(Boolean)
    : [];

  const { user, attempts } = await identity.resolveUser(req);

  return ok(res, {
    resolved: Boolean(user),
    // Which strategy answered, and what each of the others did. This is the
    // whole point of the endpoint.
    resolvedBy: user ? user.resolvedBy : null,
    attempts,
    request: {
      // Names only. No values.
      headerNames: Object.keys(req.headers || {}).sort(),
      cookieNames,
      hasCookieHeader: cookieNames.length > 0,
      // Our own hostname, used to address the platform API. Not a secret — it
      // is in the browser's address bar.
      host: (req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || null,
      derivedPlatformBaseUrl: cfg.auth.platformBaseUrl
        || identity._internals.platformBaseUrlFrom(req)
        || null,
      platformBaseUrlFromEnv: Boolean(cfg.auth.platformBaseUrl)
    },
    config: {
      projectId: cfg.auth.projectId,
      mode: cfg.auth.mode
    },
    note: 'Set AUTH_DIAG=false (or remove it) once this has been read.'
  });
});

/* ---------------------------- read plumbing ---------------------------- */

const tag = (p, service) => p.catch((e) => { e.__service = service; throw e; });

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    if (err instanceof writes.AppError) return fail(res, err.status, err.code, err.message);
    if (err instanceof lms.LmsError) return fail(res, err.status, err.code, err.message, 'lms');
    if (err instanceof books.BooksNotConfigured) return fail(res, 503, err.code, err.message, 'books');
    const s = z.safeError(err, err.__service || 'zoho');
    // Never surface the upstream body — it can echo tokens or CRM metadata.
    return fail(res, s.status >= 400 && s.status < 600 ? s.status : 502,
      'UPSTREAM_ERROR', s.detail, s.service);
  });

/* ------------------------------ CRM reads ------------------------------ */

const F = {
  students: 'id, First_Name, Last_Name, Email, Phone, Student_ID, Student_Status, External_Student_Ref, LMS_Provider, LMS_User_ID, Last_LMS_Sync, Created_Time, Modified_Time',
  applications: 'id, Deal_Name, Application_ID, External_Application_Ref, Stage, Pipeline, Contact_Name, Programme, Intake, Application_Date, Closing_Date, Decision_Date, Amount, Documents_Status, Preferred_Study_Mode, Modified_Time',
  programmes: 'id, Product_Name, Product_Code, Programme_Status, Academic_Level, Department, Duration_Value, Duration_Unit, Delivery_Mode, Unit_Price, Award_or_Certificate, Product_Active, LMS_Provider, LMS_Course_ID, LMS_Course_URL, Modified_Time',
  intakes: 'id, Name, Intake_ID, External_Intake_Reference, Programme, Academic_Year, Intake_Status, Application_Open_Date, Application_Deadline, Start_Date, End_Date, Capacity, Delivery_Mode, Campus_or_Location, LMS_Cohort_or_Group_ID, Modified_Time',
  enrolments: 'id, Name, External_Enrolment_Ref, Student, Programme, Intake, Application, Enrolment_Status, Enrolment_Date, Start_Date, Completion_Date, Finance_Status, Certificate_Issued, LMS_Provider, LMS_Enrolment_ID, Progress_Percentage, Last_LMS_Sync, External_Sync_Status, Modified_Time'
};

// COQL requires a WHERE clause; Created_Time is always populated.
const ALL = 'Created_Time is not null';
const MAX_ROWS = 200;

const q = (req, fields, module_, where = ALL, limit = MAX_ROWS, order = '') =>
  tag(z.crmQuery(req, `select ${fields} from ${module_} where ${where}${order} limit ${limit}`), 'crm');

const listStudents = (req, where = ALL) => q(req, F.students, cfg.modules.students, where, MAX_ROWS, ' order by Created_Time desc');
const listApplications = (req, where = ALL) => q(req, F.applications, cfg.modules.applications, where);
const listProgrammes = (req, where = ALL) => q(req, F.programmes, cfg.modules.programmes, where);
const listIntakes = (req, where = ALL) => q(req, F.intakes, cfg.modules.intakes, where, MAX_ROWS, ' order by Start_Date asc');
const listEnrolments = (req, where = ALL) => q(req, F.enrolments, cfg.modules.enrolments, where);

const groupBy = (rows, key) => rows.reduce((acc, r) => {
  const k = key(r) || 'Unspecified';
  acc[k] = (acc[k] || 0) + 1;
  return acc;
}, {});

/**
 * Page a normalised array for the client.
 *
 * CRM rows are fetched in bulk (COQL, capped at MAX_ROWS) and paged here rather
 * than pushed down into COQL OFFSET, because most list views also need
 * cross-entity enrichment — counting a programme's enrolments, resolving an
 * applicant's email — which cannot be expressed in one COQL statement. The
 * `capped` flag tells the UI honestly when the result was truncated at the
 * source, instead of implying the list is complete.
 */
function paginate(rows, req, extraMeta = {}) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(Math.max(1, Number(req.query.perPage) || 25), 100);
  const start = (page - 1) * perPage;
  return {
    items: rows.slice(start, start + perPage),
    meta: {
      page,
      perPage,
      total: rows.length,
      totalPages: Math.max(1, Math.ceil(rows.length / perPage)),
      capped: rows.length >= MAX_ROWS,
      ...extraMeta
    }
  };
}

/**
 * Names the deployment the request arrived on.
 *
 * Read from the host rather than hard-coded, so the same build reports
 * "Development" on the development gateway and "Production" on the production
 * one without a second configuration. ZYLKER_ENVIRONMENT overrides it for a
 * deployment whose hostname does not follow the Catalyst convention.
 */
function environmentOf(req) {
  const override = String(process.env.ZYLKER_ENVIRONMENT || '').trim();
  if (override) return { name: override.toLowerCase(), label: override };
  const host = String((req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '');
  if (/\.development\./i.test(host)) return { name: 'development', label: 'Development' };
  if (host) return { name: 'production', label: 'Production' };
  return { name: 'unknown', label: 'Unknown environment' };
}

/** Case-insensitive substring match over the named fields of a record. */
const matches = (row, term, fields) => {
  if (!term) return true;
  const t = String(term).toLowerCase();
  return fields.some((f) => {
    const v = f.split('.').reduce((o, k) => (o == null ? null : o[k]), row);
    return v != null && String(v).toLowerCase().includes(t);
  });
};

/* ---------------------- student to Books matching ---------------------- */

/**
 * Resolves the Zoho Books customer for a student, following the required
 * priority. Each step is reported in the result so the UI can state HOW the
 * link was made rather than presenting a guess as fact.
 *
 *   1. A Books customer id stored on the CRM record.
 *   2. A verified CRM-to-Books integration identifier.
 *   3. An exact, normalised email match.
 *   4. No match.
 *
 * Name matching is deliberately absent: two students called "J. Murphy" would
 * otherwise be shown each other's invoices. A multi-hit email match is reported
 * as ambiguous and resolves to no invoices — an unresolved link is recoverable,
 * showing the wrong person's finances is not.
 */
const BOOKS_ID_FIELDS = ['Zoho_Books_Customer_ID', 'Books_Customer_ID', 'Books_Contact_ID'];

async function resolveBooksCustomer(req, studentRaw, student) {
  // 1 + 2. A stored identifier, if the CRM org has such a field. Probed from
  // the record that was actually returned, so this costs nothing and starts
  // working by itself the day the field is added.
  for (const f of BOOKS_ID_FIELDS) {
    const v = studentRaw && studentRaw[f];
    if (v) {
      return { customerId: String(v), matchedOn: 'crm-field', field: f, ambiguous: false, candidates: [] };
    }
  }

  // 3. Exact normalised email.
  if (!student.email) {
    return { customerId: null, matchedOn: null, ambiguous: false, candidates: [], reason: 'The student record has no email address.' };
  }
  const found = await books.findCustomersByEmail(z, req, student.email);
  if (found.length === 1) {
    return { customerId: found[0].id, matchedOn: 'email', ambiguous: false, candidates: found };
  }
  if (found.length > 1) {
    return {
      customerId: null, matchedOn: null, ambiguous: true, candidates: found,
      reason: `${found.length} Zoho Books customers share this email address. Link the correct one in CRM before invoices can be shown.`
    };
  }
  // 4. No match.
  return { customerId: null, matchedOn: null, ambiguous: false, candidates: [], reason: 'No Zoho Books customer matches this email address.' };
}

/** Books section for a student. Never throws: an outage must not break the page. */
async function studentInvoices(req, studentRaw, student) {
  if (!cfg.books.organizationId) {
    return { status: 'not_configured', match: null, invoices: [], outstandingBalance: null,
      detail: 'Zoho Books is not configured for this deployment.' };
  }
  try {
    const match = await resolveBooksCustomer(req, studentRaw, student);
    if (!match.customerId) {
      return { status: match.ambiguous ? 'ambiguous' : 'unmatched', match, invoices: [], outstandingBalance: null, detail: match.reason || null };
    }
    const r = await books.listInvoices(z, req, { customerId: match.customerId, perPage: 50 });
    const outstanding = r.invoices
      .filter((i) => i.outstanding)
      .reduce((sum, i) => sum + Number(i.balance || 0), 0);
    return {
      status: 'matched',
      match,
      invoices: r.invoices,
      outstandingBalance: Math.round(outstanding * 100) / 100,
      currency: r.invoices.length ? r.invoices[0].currency : null,
      hasMore: r.hasMore,
      detail: null
    };
  } catch (err) {
    return { status: 'unavailable', match: null, invoices: [], outstandingBalance: null,
      detail: z.safeError(err, 'books').detail };
  }
}

/* ================================ ROUTES =============================== */
/*
 * Read routes: [path, permission, handler]
 * Write routes: [method, path, permission, handler]
 * Both arrays are registered below with requireAuth applied to every entry.
 */

/* ------------------------------- identity ------------------------------ */

const readRoutes = [];
const R = (path, permission, handler) => readRoutes.push([path, permission, handler]);

/**
 * The signed-in principal, their role and their permission list. The client
 * calls this once after login and uses it to decide which controls to render —
 * a convenience, not a control; the server re-checks on every request.
 */
R('/api/me', null, async (req, res) => {
  ok(res, {
    authenticated: true,
    user: req.principal,
    roles: perms.ROLE_LABEL,
    resolvedBy: req.user.resolvedBy,
    // Which deployment answered. The header badges this so nobody mistakes the
    // development gateway for the live one while making changes.
    environment: environmentOf(req)
  });
});

/* ----------------------------- global search --------------------------- */

/**
 * Search across the CRM entities the CALLER may read.
 *
 * The permission check is per entity and happens here, not in the client: a
 * viewer who cannot read invoices never receives an invoice in a search
 * response, whatever the browser asks for. The route itself declares no single
 * permission because the set it covers depends on the role.
 *
 * Matching is done on normalised records so a search hits the same fields the
 * user can see on screen — including the server-minted external references,
 * which are how staff actually refer to records to each other.
 */
const SEARCH_MIN = 2;
const SEARCH_PER_ENTITY = 5;

R('/api/search', null, async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (query.length < SEARCH_MIN) {
    return ok(res, { query, groups: [], total: 0 }, { minQueryLength: SEARCH_MIN, tooShort: true });
  }

  const may = (permission) => perms.can(req.principal && req.principal.role, permission);

  // Only the modules this role may read are fetched at all, so an unauthorised
  // module is never even retrieved, let alone filtered out afterwards.
  const [students, applications, enrolments, programmes, intakes] = await Promise.all([
    may(perms.P.STUDENT_READ) ? listStudents(req) : Promise.resolve([]),
    may(perms.P.APPLICATION_READ) ? listApplications(req) : Promise.resolve([]),
    may(perms.P.ENROLMENT_READ) ? listEnrolments(req) : Promise.resolve([]),
    may(perms.P.PROGRAMME_READ) ? listProgrammes(req) : Promise.resolve([]),
    may(perms.P.INTAKE_READ) ? listIntakes(req) : Promise.resolve([])
  ]);

  const take = (rows, fields, shape) => {
    const hits = rows.filter((r) => matches(r, query, fields));
    return { items: hits.slice(0, SEARCH_PER_ENTITY).map(shape), total: hits.length };
  };

  const groups = [];
  const add = (entity, label, permission, result) => {
    if (!may(permission) || !result.items.length) return;
    groups.push({ entity, label, total: result.total, items: result.items });
  };

  add('student', 'Students', perms.P.STUDENT_READ, take(
    students.map(n.student),
    ['fullName', 'email', 'studentId', 'externalReference', 'meta.reference'],
    (s) => ({
      id: s.id,
      label: s.fullName || s.email || `Student ${s.id}`,
      secondary: [s.email, s.status].filter(Boolean).join(' · ') || null,
      reference: s.studentId || s.meta.reference || null,
      to: `/students/${s.id}`
    })
  ));

  add('application', 'Applications', perms.P.APPLICATION_READ, take(
    applications.map(n.application),
    ['name', 'applicationId', 'externalReference', 'meta.reference', 'student.name', 'programme.name'],
    (a) => ({
      id: a.id,
      label: a.name || a.applicationId || `Application ${a.id}`,
      secondary: [a.student && a.student.name, a.stage].filter(Boolean).join(' · ') || null,
      reference: a.applicationId || a.meta.reference || null,
      to: `/applications/${a.id}`
    })
  ));

  add('enrolment', 'Enrolments', perms.P.ENROLMENT_READ, take(
    enrolments.map(n.enrolment),
    ['reference', 'externalReference', 'meta.reference', 'student.name', 'programme.name'],
    (e) => ({
      id: e.id,
      label: e.reference || `Enrolment ${e.id}`,
      secondary: [e.student && e.student.name, e.programme && e.programme.name, e.status]
        .filter(Boolean).join(' · ') || null,
      reference: e.externalReference || e.meta.reference || null,
      to: `/enrolments/${e.id}`
    })
  ));

  add('programme', 'Programmes', perms.P.PROGRAMME_READ, take(
    programmes.map(n.programme),
    ['name', 'code', 'meta.reference'],
    (p) => ({
      id: p.id,
      label: p.name || `Programme ${p.id}`,
      secondary: [p.code, p.academicLevel, p.status].filter(Boolean).join(' · ') || null,
      reference: p.code || p.meta.reference || null,
      to: `/programmes/${p.id}`
    })
  ));

  add('intake', 'Intakes', perms.P.INTAKE_READ, take(
    intakes.map(n.intake),
    ['name', 'intakeId', 'externalReference', 'meta.reference', 'programme.name'],
    (i) => ({
      id: i.id,
      label: i.name || `Intake ${i.id}`,
      secondary: [i.programme && i.programme.name, i.academicYear, i.status]
        .filter(Boolean).join(' · ') || null,
      reference: i.intakeId || i.meta.reference || null,
      to: `/intakes/${i.id}`
    })
  ));

  ok(res,
    { query, groups, total: groups.reduce((sum, g) => sum + g.total, 0) },
    { source: 'crm', perEntityLimit: SEARCH_PER_ENTITY, minQueryLength: SEARCH_MIN });
});

/* ------------------------------- dashboard ----------------------------- */

R('/api/dashboard', perms.P.DASHBOARD_READ, async (req, res) => {
  // CRM first and on its own: an LMS or Books failure must not stop these.
  const [students, applications, programmes, intakes, enrolments] = await Promise.all([
    listStudents(req), listApplications(req), listProgrammes(req), listIntakes(req), listEnrolments(req)
  ]);

  const P = programmes.map(n.programme);
  const I = intakes.map(n.intake);
  const E = enrolments.map(n.enrolment);
  const A = applications.map(n.application);
  const S = students.map(n.student);
  const today = new Date().toISOString().slice(0, 10);

  const closedStages = new Set([writes.STAGE.ENROLLED, writes.STAGE.REJECTED, writes.STAGE.WITHDRAWN]);

  // The LMS connector and Books are settled independently and never rejected,
  // so a failure in either degrades one card instead of the whole dashboard.
  const [lmsStatus, booksTotals, booksHealth] = await Promise.all([
    lms.status(req),
    cfg.books.organizationId
      ? books.invoiceTotals(z, req).catch((err) => ({ error: z.safeError(err, 'books') }))
      : Promise.resolve(null),
    books.health(z, req).catch(() => ({ status: 'unavailable', label: 'Unavailable', detail: null }))
  ]);

  const booksOk = booksTotals && !booksTotals.error;
  const lmsOk = lmsStatus && lmsStatus.status === 'connected' && lmsStatus.counts;

  ok(res, {
    // Each KPI declares where it came from, so the UI can badge it and a null
    // reads as "this source is unavailable" rather than "the number is zero".
    kpis: {
      totalStudents: { value: S.length, source: 'crm' },
      openApplications: { value: A.filter((a) => !closedStages.has(a.stage)).length, source: 'crm' },
      activeProgrammes: { value: P.filter((p) => p.active && p.status !== 'Archived').length, source: 'crm' },
      upcomingIntakes: { value: I.filter((i) => (i.startDate || '') >= today).length, source: 'crm' },
      activeEnrolments: { value: E.filter((e) => e.status === writes.ENROLMENT_STATUS.ACTIVE).length, source: 'crm' },
      lmsCourses: {
        value: lmsOk ? lmsStatus.counts.activeCourses : null,
        source: 'lms', unavailable: !lmsOk
      },
      averageProgress: {
        value: lmsOk ? lmsStatus.averageProgress : null,
        source: 'lms', unavailable: !lmsOk, suffix: '%'
      },
      completedCourses: {
        value: lmsOk ? lmsStatus.counts.completed : null,
        source: 'lms', unavailable: !lmsOk
      },
      certificatesIssued: {
        value: lmsOk ? lmsStatus.counts.certificatesIssued : null,
        source: 'lms', unavailable: !lmsOk
      },
      unmappedLmsRecords: {
        value: lmsOk ? lmsStatus.counts.coursesUnmapped + lmsStatus.counts.enrolmentsUnmapped : null,
        source: 'lms', unavailable: !lmsOk
      },
      failedSyncs: {
        value: lmsOk ? lmsStatus.counts.failedSyncs : null,
        source: 'lms', unavailable: !lmsOk
      },
      outstandingInvoices: {
        value: booksOk ? booksTotals.outstandingCount : null,
        source: 'books', unavailable: !booksOk
      },
      overdueInvoices: {
        value: booksOk ? booksTotals.overdueCount : null,
        source: 'books', unavailable: !booksOk
      },
      outstandingBalance: {
        value: booksOk ? booksTotals.outstandingBalance : null,
        currency: booksOk ? booksTotals.currency : null,
        source: 'books', unavailable: !booksOk,
        partial: booksOk ? booksTotals.truncated === true : false
      }
    },
    applicationsByStage: groupBy(A, (a) => a.stage),
    enrolmentsByStatus: groupBy(E, (e) => e.status),
    lmsCoursesByProvider: lmsOk ? lmsStatus.coursesByProvider : null,
    learnersByLmsStatus: lmsOk ? lmsStatus.learnersByStatus : null,
    recentApplications: [...A]
      .sort((x, y) => String(y.applicationDate || '').localeCompare(String(x.applicationDate || '')))
      .slice(0, 6),
    upcomingIntakes: I.filter((i) => (i.startDate || '') >= today).slice(0, 6),
    recentStudents: S.slice(0, 6),
    connections: {
      crm: { status: 'connected', label: 'Connected' },
      lms: { status: lmsStatus.status, label: lmsStatus.label, detail: lmsStatus.detail || null, demonstrationDataset: true },
      books: booksHealth
    }
  });
});

/* -------------------------------- students ----------------------------- */

R('/api/students', perms.P.STUDENT_READ, async (req, res) => {
  const [rows, apps, enrols] = await Promise.all([listStudents(req), listApplications(req), listEnrolments(req)]);
  const A = apps.map(n.application);
  const E = enrols.map(n.enrolment);

  let students = rows.map(n.student).map((s) => {
    const a = A.find((x) => x.student && x.student.id === s.id) || null;
    const e = E.find((x) => x.student && x.student.id === s.id) || null;
    return {
      ...s,
      programme: (e && e.programme) || (a && a.programme) || null,
      intake: (e && e.intake) || (a && a.intake) || null,
      enrolmentStatus: e ? e.status : null,
      applicationStage: a ? a.stage : null
    };
  });

  const status = req.query.status;
  if (status) students = students.filter((s) => s.status === status);
  students = students.filter((s) => matches(s, req.query.search, ['fullName', 'email', 'studentId', 'externalReference']));

  const { items, meta } = paginate(students, req, {
    byStatus: groupBy(students, (s) => s.status),
    source: 'crm'
  });
  ok(res, items, meta);
});

/**
 * Student 360. Every integration section is resolved independently and is
 * allowed to fail on its own — the CRM half of the page renders whether or not
 * the LMS connector and Books answer.
 */
R('/api/students/:id', perms.P.STUDENT_READ, async (req, res) => {
  const id = String(req.params.id).replace(/[^0-9]/g, '');
  if (!id) return fail(res, 400, 'INVALID_ID', 'A numeric record id is required.');

  const rows = await listStudents(req, `id = ${id}`);
  if (!rows.length) return fail(res, 404, 'NOT_FOUND', 'No student matches that id.');
  const raw = rows[0];
  const student = n.student(raw);

  const [apps, enrols] = await Promise.all([
    listApplications(req, `Contact_Name = ${id}`),
    listEnrolments(req, `Student = ${id}`)
  ]);
  const applications = apps.map(n.application);
  const enrolments = enrols.map(n.enrolment);

  const programmeIds = [...new Set(enrolments.concat(applications)
    .map((r) => r.programme && r.programme.id).filter(Boolean))];
  const intakeIds = [...new Set(enrolments.concat(applications)
    .map((r) => r.intake && r.intake.id).filter(Boolean))];

  const [progRows, intakeRows, lmsLearning, invoices, activity] = await Promise.all([
    programmeIds.length ? listProgrammes(req, `id in (${programmeIds.join(',')})`) : Promise.resolve([]),
    intakeIds.length ? listIntakes(req, `id in (${intakeIds.join(',')})`) : Promise.resolve([]),
    lms.enrolmentsForStudent(req, id).catch(() => []),
    studentInvoices(req, raw, student),
    auth.readActivity(req, { entityType: 'student', recordId: id, limit: 15 }).catch(() => [])
  ]);

  const programmes = progRows.map(n.programme);

  // Attach each LMS record's course so the Learning section can name it without
  // a second round trip. Courses are few, so one list is cheaper than N reads.
  const lmsCourses = await lms.listCourses(req).catch(() => []);
  const learning = lmsLearning.map((e) => ({
    ...e,
    course: lmsCourses.find((c) => c.provider === e.provider && c.externalCourseId === e.externalCourseId) || null
  }));

  ok(res, {
    student,
    applications,
    enrolments,
    programmes,
    intakes: intakeRows.map(n.intake),
    invoices,
    activity,
    learning,
    lmsDemonstrationDataset: true
  });
});

/* ------------------------------ applications --------------------------- */

R('/api/applications', perms.P.APPLICATION_READ, async (req, res) => {
  const [appRows, studRows] = await Promise.all([listApplications(req), listStudents(req)]);
  const S = studRows.map(n.student);
  let data = appRows.map(n.application).map((a) => {
    const st = a.student ? S.find((s) => s.id === a.student.id) : null;
    return {
      ...a,
      applicantEmail: st ? st.email : null,
      applicantName: st ? st.fullName : (a.student && a.student.name) || null
    };
  });

  const byStage = groupBy(data, (a) => a.stage);
  if (req.query.stage) data = data.filter((a) => a.stage === req.query.stage);
  data = data.filter((a) => matches(a, req.query.search, ['name', 'applicationId', 'applicantName', 'applicantEmail', 'externalReference']));

  const { items, meta } = paginate(data, req, { byStage, stages: [...writes.ALL_STAGES], source: 'crm' });
  ok(res, items, meta);
});

R('/api/applications/:id', perms.P.APPLICATION_READ, async (req, res) => {
  const id = String(req.params.id).replace(/[^0-9]/g, '');
  if (!id) return fail(res, 400, 'INVALID_ID', 'A numeric record id is required.');

  const rows = await listApplications(req, `id = ${id}`);
  if (!rows.length) return fail(res, 404, 'NOT_FOUND', 'No application matches that id.');
  const application = n.application(rows[0]);

  const [enrolRows, studRows, progRows, intakeRows, activity] = await Promise.all([
    listEnrolments(req, `Application = ${id}`),
    application.student ? listStudents(req, `id = ${application.student.id}`) : Promise.resolve([]),
    application.programme ? listProgrammes(req, `id = ${application.programme.id}`) : Promise.resolve([]),
    application.intake ? listIntakes(req, `id = ${application.intake.id}`) : Promise.resolve([]),
    auth.readActivity(req, { entityType: 'application', recordId: id, limit: 15 }).catch(() => [])
  ]);

  const programme = progRows.length ? n.programme(progRows[0]) : null;

  ok(res, {
    application,
    student: studRows.length ? n.student(studRows[0]) : null,
    enrolment: enrolRows.length ? n.enrolment(enrolRows[0]) : null,
    programme,
    intake: intakeRows.length ? n.intake(intakeRows[0]) : null,
    // Only the transitions the backend will actually accept, so the UI cannot
    // offer a button that is guaranteed to 422.
    allowedTransitions: writes.TRANSITIONS[application.stage] || [],
    activity
  });
});

/* ------------------------------- programmes ---------------------------- */

R('/api/programmes', perms.P.PROGRAMME_READ, async (req, res) => {
  const [rows, enrols, apps, intakes] = await Promise.all([
    listProgrammes(req), listEnrolments(req), listApplications(req), listIntakes(req)
  ]);
  const E = enrols.map(n.enrolment);
  const A = apps.map(n.application);
  const I = intakes.map(n.intake);
  // Courses come from the Catalyst connector and are matched by CRM id, so the
  // name-based guessing the previous integration needed is gone entirely.
  const lmsCourses = await lms.listCourses(req).catch(() => []);

  let data = rows.map(n.programme).map((p) => {
    const lmsCourse = lmsCourses.find((c) => String(c.crmProgrammeId) === String(p.id)) || null;
    return {
      ...p,
      lmsCourse,
      counts: {
        intakes: I.filter((i) => i.programme && i.programme.id === p.id).length,
        applications: A.filter((a) => a.programme && a.programme.id === p.id).length,
        enrolments: E.filter((e) => e.programme && e.programme.id === p.id).length
      }
    };
  });

  if (req.query.active === 'true') data = data.filter((p) => p.active);
  if (req.query.active === 'false') data = data.filter((p) => !p.active);
  data = data.filter((p) => matches(p, req.query.search, ['name', 'code', 'department', 'academicLevel']));

  const { items, meta } = paginate(data, req, { source: 'crm', lmsDemonstrationDataset: true });
  ok(res, items, meta);
});

R('/api/programmes/:id', perms.P.PROGRAMME_READ, async (req, res) => {
  const id = String(req.params.id).replace(/[^0-9]/g, '');
  if (!id) return fail(res, 400, 'INVALID_ID', 'A numeric record id is required.');

  const rows = await listProgrammes(req, `id = ${id}`);
  if (!rows.length) return fail(res, 404, 'NOT_FOUND', 'No programme matches that id.');
  const programme = n.programme(rows[0]);

  const [ints, enrols, apps] = await Promise.all([
    listIntakes(req, `Programme = ${id}`),
    listEnrolments(req, `Programme = ${id}`),
    listApplications(req, `Programme = ${id}`)
  ]);
  const intakes = ints.map(n.intake);
  const enrolments = enrols.map(n.enrolment);
  const lmsCourses = await lms.listCourses(req).catch(() => []);
  const lmsCourse = lmsCourses.find((c) => String(c.crmProgrammeId) === String(programme.id)) || null;

  ok(res, {
    programme,
    lmsCourse,
    intakes: intakes.map((i) => ({
      ...i,
      enrolledStudents: enrolments.filter((e) => e.intake && e.intake.id === i.id && e.status === writes.ENROLMENT_STATUS.ACTIVE).length
    })),
    applications: apps.map(n.application),
    enrolments,
    lmsDemonstrationDataset: true
  });
});

/* --------------------------------- intakes ----------------------------- */

R('/api/intakes', perms.P.INTAKE_READ, async (req, res) => {
  const [rows, enrols, apps] = await Promise.all([listIntakes(req), listEnrolments(req), listApplications(req)]);
  const E = enrols.map(n.enrolment);
  const A = apps.map(n.application);

  let data = rows.map(n.intake).map((i) => {
    const active = E.filter((e) => e.intake && e.intake.id === i.id && e.status === writes.ENROLMENT_STATUS.ACTIVE).length;
    return {
      ...i,
      counts: {
        applications: A.filter((a) => a.intake && a.intake.id === i.id).length,
        enrolments: E.filter((e) => e.intake && e.intake.id === i.id).length,
        activeEnrolments: active
      },
      // Null capacity means "not limited" — reported as such rather than as 0.
      placesRemaining: i.capacity == null ? null : Math.max(0, i.capacity - active),
      full: i.capacity != null && active >= i.capacity
    };
  });

  if (req.query.status) data = data.filter((i) => i.status === req.query.status);
  if (req.query.programmeId) data = data.filter((i) => i.programme && String(i.programme.id) === String(req.query.programmeId));
  data = data.filter((i) => matches(i, req.query.search, ['name', 'intakeId', 'academicYear', 'location']));

  const { items, meta } = paginate(data, req, {
    byStatus: groupBy(data, (i) => i.status),
    statuses: writes.INTAKE_STATUS,
    source: 'crm'
  });
  ok(res, items, meta);
});

R('/api/intakes/:id', perms.P.INTAKE_READ, async (req, res) => {
  const id = String(req.params.id).replace(/[^0-9]/g, '');
  if (!id) return fail(res, 400, 'INVALID_ID', 'A numeric record id is required.');

  const rows = await listIntakes(req, `id = ${id}`);
  if (!rows.length) return fail(res, 404, 'NOT_FOUND', 'No intake matches that id.');
  const intake = n.intake(rows[0]);

  const [apps, enrols, progRows] = await Promise.all([
    listApplications(req, `Intake = ${id}`),
    listEnrolments(req, `Intake = ${id}`),
    intake.programme ? listProgrammes(req, `id = ${intake.programme.id}`) : Promise.resolve([])
  ]);
  const enrolments = enrols.map(n.enrolment);
  const active = enrolments.filter((e) => e.status === writes.ENROLMENT_STATUS.ACTIVE).length;

  ok(res, {
    intake: {
      ...intake,
      placesRemaining: intake.capacity == null ? null : Math.max(0, intake.capacity - active),
      full: intake.capacity != null && active >= intake.capacity
    },
    programme: progRows.length ? n.programme(progRows[0]) : null,
    applications: apps.map(n.application),
    enrolments,
    activeEnrolments: active
  });
});

/* ------------------------------- enrolments ---------------------------- */

R('/api/enrolments', perms.P.ENROLMENT_READ, async (req, res) => {
  const [rows, studRows] = await Promise.all([listEnrolments(req), listStudents(req)]);
  const S = studRows.map(n.student);

  let data = rows.map(n.enrolment).map((e) => {
    const st = e.student ? S.find((s) => s.id === e.student.id) : null;
    return { ...e, studentName: st ? st.fullName : (e.student && e.student.name) || null, studentEmail: st ? st.email : null };
  });

  const byStatus = groupBy(data, (e) => e.status);
  if (req.query.status) data = data.filter((e) => e.status === req.query.status);
  if (req.query.programmeId) data = data.filter((e) => e.programme && String(e.programme.id) === String(req.query.programmeId));
  if (req.query.intakeId) data = data.filter((e) => e.intake && String(e.intake.id) === String(req.query.intakeId));
  data = data.filter((e) => matches(e, req.query.search, ['reference', 'externalReference', 'studentName', 'studentEmail']));

  const { items, meta } = paginate(data, req, {
    byStatus, statuses: Object.values(writes.ENROLMENT_STATUS), source: 'crm'
  });
  ok(res, items, meta);
});

R('/api/enrolments/:id', perms.P.ENROLMENT_READ, async (req, res) => {
  const id = String(req.params.id).replace(/[^0-9]/g, '');
  if (!id) return fail(res, 400, 'INVALID_ID', 'A numeric record id is required.');

  const rows = await listEnrolments(req, `id = ${id}`);
  if (!rows.length) return fail(res, 404, 'NOT_FOUND', 'No enrolment matches that id.');
  const enrolment = n.enrolment(rows[0]);

  const [studRows, progRows, intakeRows, appRows, activity] = await Promise.all([
    enrolment.student ? listStudents(req, `id = ${enrolment.student.id}`) : Promise.resolve([]),
    enrolment.programme ? listProgrammes(req, `id = ${enrolment.programme.id}`) : Promise.resolve([]),
    enrolment.intake ? listIntakes(req, `id = ${enrolment.intake.id}`) : Promise.resolve([]),
    enrolment.application ? listApplications(req, `id = ${enrolment.application.id}`) : Promise.resolve([]),
    auth.readActivity(req, { entityType: 'enrolment', recordId: id, limit: 15 }).catch(() => [])
  ]);

  const programme = progRows.length ? n.programme(progRows[0]) : null;

  // The External LMS panel: records linked to THIS CRM enrolment, each with its
  // course. Never rejected — an LMS outage must not break the CRM page.
  const [lmsLinked, lmsCourses] = await Promise.all([
    lms.enrolmentsForCrmEnrolment(req, id).catch(() => []),
    lms.listCourses(req).catch(() => [])
  ]);
  const learning = lmsLinked.map((e) => ({
    ...e,
    course: lmsCourses.find((c) => c.provider === e.provider && c.externalCourseId === e.externalCourseId) || null
  }));

  /*
   * Finance_Status on the enrolment is a CRM picklist that a person sets by
   * hand. Nothing syncs it from Zoho Books, so it can say "Not Invoiced" long
   * after an invoice was raised and paid.
   *
   * Rather than let those two quietly disagree, the live Books position for
   * this student is fetched alongside it and the UI shows both. Only for a
   * principal allowed to see invoices at all.
   */
  const invoices = (studRows.length && auth.hasPermission(req, perms.P.INVOICE_READ))
    ? await studentInvoices(req, studRows[0], n.student(studRows[0]))
    : null;

  ok(res, {
    enrolment,
    student: studRows.length ? n.student(studRows[0]) : null,
    programme,
    intake: intakeRows.length ? n.intake(intakeRows[0]) : null,
    application: appRows.length ? n.application(appRows[0]) : null,
    learning,
    lmsCourse: programme
      ? lmsCourses.find((c) => String(c.crmProgrammeId) === String(programme.id)) || null
      : null,
    lmsDemonstrationDataset: true,
    invoices,
    // States plainly whether the manual CRM field agrees with Books, so the
    // drift is visible instead of being something the reader has to notice.
    financeStatusSource: 'crm-manual',
    activity
  });
});

/* ------------------ External LMS Connector (Catalyst) ------------------ */
/*
 * The dataset lives in the Catalyst Data Store. Provider names are simulated
 * source labels; there is no outbound call to Moodle, Canvas, TrainerCentral or
 * any SCORM host, and every response says so via `demonstrationDataset`.
 */

R('/api/lms/courses', perms.P.LMS_READ, async (req, res) => {
  const [courses, progRows] = await Promise.all([
    lms.listCourses(req, { includeArchived: req.query.includeArchived === 'true' }),
    listProgrammes(req).catch(() => [])
  ]);
  const P_ = progRows.map(n.programme);

  let data = courses.map((c) => ({
    ...c,
    crmProgramme: c.crmProgrammeId
      ? P_.find((p) => String(p.id) === String(c.crmProgrammeId)) || null
      : null
  }));

  if (req.query.provider) data = data.filter((c) => c.provider === req.query.provider);
  if (req.query.mappingStatus) data = data.filter((c) => c.mappingStatus === req.query.mappingStatus);
  if (req.query.syncStatus) data = data.filter((c) => c.syncStatus === req.query.syncStatus);
  data = data.filter((c) => matches(c, req.query.search, ['name', 'externalCourseId', 'provider', 'instructor', 'category']));

  const { items, meta } = paginate(data, req, {
    source: 'catalyst-lms',
    demonstrationDataset: true,
    providers: lms.PROVIDERS,
    deliveryTypes: lms.DELIVERY_TYPES,
    publicationStatuses: lms.PUBLICATION_STATUSES,
    mappingStatuses: lms.MAPPING_STATUSES,
    syncStatuses: lms.SYNC_STATUSES
  });
  ok(res, items, meta);
});

R('/api/lms/courses/:id', perms.P.LMS_READ, async (req, res) => {
  const course = await lms.getCourse(req, req.params.id);
  if (!course) return fail(res, 404, 'NOT_FOUND', 'No LMS course matches that id.');

  const [progRows, enrolments, log] = await Promise.all([
    course.crmProgrammeId ? listProgrammes(req, `id = ${String(course.crmProgrammeId).replace(/[^0-9]/g, '')}`).catch(() => []) : Promise.resolve([]),
    lms.listEnrolments(req).catch(() => []),
    lms.listSyncLog(req, { limit: 15, entityType: 'Course' }).catch(() => [])
  ]);

  ok(res, {
    course,
    crmProgramme: progRows.length ? n.programme(progRows[0]) : null,
    enrolments: enrolments.filter((e) => e.provider === course.provider && e.externalCourseId === course.externalCourseId),
    syncLog: log.filter((l) => l.externalRecordId === course.externalCourseId),
    crmFieldsWritten: Object.keys(lms.PROGRAMME_SYNC_FIELDS),
    demonstrationDataset: true
  });
});

R('/api/lms/enrolments', perms.P.LMS_READ, async (req, res) => {
  const [enrolments, courses, studRows] = await Promise.all([
    lms.listEnrolments(req),
    lms.listCourses(req, { includeArchived: true }).catch(() => []),
    listStudents(req).catch(() => [])
  ]);
  const S = studRows.map(n.student);

  let data = enrolments.map((e) => ({
    ...e,
    course: courses.find((c) => c.provider === e.provider && c.externalCourseId === e.externalCourseId) || null,
    crmStudent: e.crmStudentId ? S.find((st) => String(st.id) === String(e.crmStudentId)) || null : null
  }));

  if (req.query.provider) data = data.filter((e) => e.provider === req.query.provider);
  if (req.query.lmsStatus) data = data.filter((e) => e.lmsStatus === req.query.lmsStatus);
  if (req.query.mappingStatus) data = data.filter((e) => e.mappingStatus === req.query.mappingStatus);
  if (req.query.syncStatus) data = data.filter((e) => e.syncStatus === req.query.syncStatus);
  data = data.filter((e) => matches(e, req.query.search,
    ['externalEnrolmentId', 'externalLearnerId', 'provider', 'crmStudentReference', 'crmStudent.fullName', 'course.name']));

  const { items, meta } = paginate(data, req, {
    source: 'catalyst-lms',
    demonstrationDataset: true,
    providers: lms.PROVIDERS,
    lmsStatuses: lms.LMS_STATUSES,
    certificateStatuses: lms.CERTIFICATE_STATUSES,
    mappingStatuses: lms.MAPPING_STATUSES,
    syncStatuses: lms.SYNC_STATUSES
  });
  ok(res, items, meta);
});

R('/api/lms/enrolments/:id', perms.P.LMS_READ, async (req, res) => {
  const record = await lms.getEnrolment(req, req.params.id);
  if (!record) return fail(res, 404, 'NOT_FOUND', 'No LMS enrolment matches that id.');

  const numericId = (v) => String(v || '').replace(/[^0-9]/g, '');
  const [course, studRows, crmEnrolRows, log] = await Promise.all([
    record.externalCourseId
      ? lms.findCourseByExternalId(req, record.provider, record.externalCourseId).catch(() => null)
      : Promise.resolve(null),
    record.crmStudentId ? listStudents(req, `id = ${numericId(record.crmStudentId)}`).catch(() => []) : Promise.resolve([]),
    record.crmEnrolmentId ? listEnrolments(req, `id = ${numericId(record.crmEnrolmentId)}`).catch(() => []) : Promise.resolve([]),
    lms.listSyncLog(req, { limit: 15, entityType: 'Enrolment' }).catch(() => [])
  ]);

  ok(res, {
    enrolment: record,
    course,
    crmStudent: studRows.length ? n.student(studRows[0]) : null,
    crmEnrolment: crmEnrolRows.length ? n.enrolment(crmEnrolRows[0]) : null,
    syncLog: log.filter((l) => l.externalRecordId === record.externalEnrolmentId),
    crmFieldsWritten: Object.keys(lms.ENROLMENT_SYNC_FIELDS),
    fieldsHeldInCatalyst: lms.RECOMMENDED_CRM_FIELDS,
    demonstrationDataset: true
  });
});

R('/api/lms/sync-log', perms.P.LMS_READ, async (req, res) => {
  const rows = await lms.listSyncLog(req, {
    limit: req.query.limit, entityType: req.query.entityType, result: req.query.result
  });
  ok(res, rows, { count: rows.length, source: 'catalyst-lms' });
});

/** Learning records for one student, for the Student 360 Learning section. */
R('/api/students/:id/learning', perms.P.LMS_READ, async (req, res) => {
  const id = String(req.params.id).replace(/[^0-9]/g, '');
  if (!id) return fail(res, 400, 'INVALID_ID', 'A numeric record id is required.');
  const [records, courses] = await Promise.all([
    lms.enrolmentsForStudent(req, id),
    lms.listCourses(req, { includeArchived: true }).catch(() => [])
  ]);
  ok(res, records.map((e) => ({
    ...e,
    course: courses.find((c) => c.provider === e.provider && c.externalCourseId === e.externalCourseId) || null
  })), { source: 'catalyst-lms', demonstrationDataset: true });
});

/** Learning records linked to one CRM enrolment. */
R('/api/enrolments/:id/learning', perms.P.LMS_READ, async (req, res) => {
  const id = String(req.params.id).replace(/[^0-9]/g, '');
  if (!id) return fail(res, 400, 'INVALID_ID', 'A numeric record id is required.');
  const [records, courses] = await Promise.all([
    lms.enrolmentsForCrmEnrolment(req, id),
    lms.listCourses(req, { includeArchived: true }).catch(() => [])
  ]);
  ok(res, records.map((e) => ({
    ...e,
    course: courses.find((c) => c.provider === e.provider && c.externalCourseId === e.externalCourseId) || null
  })), { source: 'catalyst-lms', demonstrationDataset: true });
});

/* --------------------------- Zoho Books (read) ------------------------- */

R('/api/invoices', perms.P.INVOICE_READ, async (req, res) => {
  const r = await books.listInvoices(z, req, {
    page: req.query.page,
    perPage: req.query.perPage,
    status: req.query.status,
    customerId: req.query.customerId,
    search: req.query.search,
    dateStart: req.query.dateStart,
    dateEnd: req.query.dateEnd
  });
  ok(res, r.invoices, {
    page: r.page,
    perPage: r.perPage,
    // Books does not return a total count, so the client is told whether there
    // is another page rather than being given an invented total.
    hasMore: r.hasMore,
    statuses: Object.entries(books.STATUS_LABEL).map(([value, label]) => ({ value, label })),
    source: 'books',
    readOnly: true
  });
});

R('/api/invoices/:id', perms.P.INVOICE_READ, async (req, res) => {
  const invoice = await books.getInvoice(z, req, req.params.id);
  if (!invoice) return fail(res, 404, 'NOT_FOUND', 'No invoice matches that id.');
  ok(res, invoice, { source: 'books', readOnly: true });
});

R('/api/students/:id/invoices', perms.P.INVOICE_READ, async (req, res) => {
  const id = String(req.params.id).replace(/[^0-9]/g, '');
  if (!id) return fail(res, 400, 'INVALID_ID', 'A numeric record id is required.');
  const rows = await listStudents(req, `id = ${id}`);
  if (!rows.length) return fail(res, 404, 'NOT_FOUND', 'No student matches that id.');
  const result = await studentInvoices(req, rows[0], n.student(rows[0]));
  ok(res, result, { source: 'books', readOnly: true });
});

/* --------------------------- integration status ------------------------ */

R('/api/integration-status', perms.P.INTEGRATION_READ, async (req, res) => {
  let crmStatus = { status: 'connected', detail: null };
  let programmes = [];
  try {
    programmes = (await listProgrammes(req)).map(n.programme);
  } catch (err) {
    crmStatus = { status: 'unavailable', detail: z.safeError(err, 'crm').detail };
  }

  const [lmsStatus, booksHealth] = await Promise.all([
    lms.status(req),
    books.health(z, req).catch(() => ({ status: 'unavailable', label: 'Unavailable', detail: null }))
  ]);

  let students = [];
  let enrolments = [];
  if (crmStatus.status === 'connected') {
    [students, enrolments] = await Promise.all([
      listStudents(req).then((r) => r.map(n.student)),
      listEnrolments(req).then((r) => r.map(n.enrolment))
    ]);
  }

  const lmsCourses = lmsStatus.status === 'connected' ? await lms.listCourses(req).catch(() => []) : [];
  const mappedProgrammeIds = new Set(lmsCourses.map((c) => String(c.crmProgrammeId)).filter(Boolean));

  ok(res, {
    auth: {
      ...identity.authConfig(),
      resolvedBy: req.user.resolvedBy,
      role: req.principal.role,
      roleSource: 'ZYLKER_ROLE_MAP / Catalyst role'
    },
    connections: {
      crm: { ...crmStatus, label: crmStatus.status === 'connected' ? 'Connected' : 'Unavailable', writable: true },
      lms: {
        status: lmsStatus.status,
        label: cfg.lms.label,
        detail: lmsStatus.detail || null,
        // Stated explicitly so nobody reads this as a live Moodle or Canvas
        // connection. The providers are source labels on Catalyst rows.
        demonstrationDataset: true,
        tables: lmsStatus.tables || cfg.lms
      },
      books: { ...booksHealth, readOnly: true }
    },
    lms: lmsStatus,
    booksConfig: {
      organizationId: cfg.books.organizationId,
      baseUrl: cfg.books.baseUrl,
      configured: Boolean(cfg.books.organizationId)
    },
    counts: {
      programmes: programmes.length,
      students: students.length,
      enrolments: enrolments.length,
      lmsCourses: lmsStatus.counts ? lmsStatus.counts.courses : null,
      lmsEnrolments: lmsStatus.counts ? lmsStatus.counts.enrolments : null
    },
    unmappedProgrammes: programmes
      .filter((p) => !mappedProgrammeIds.has(String(p.id)))
      .map((p) => ({ id: p.id, code: p.code, name: p.name, reason: 'No LMS course is mapped to this programme' })),
    recommendedCrmFields: lms.RECOMMENDED_CRM_FIELDS,
    legacyCrmFields: [
      { module: 'Products', apiName: 'LMS_Provider', note: 'Provider-neutral name; now written by the LMS connector' },
      { module: 'Products', apiName: 'LMS_Course_ID', note: 'Now holds the external course id from the connector' },
      { module: 'Products', apiName: 'LMS_Course_URL', note: 'Now holds the simulated provider course URL' },
      { module: 'Enrolments', apiName: 'LMS_Provider' },
      { module: 'Enrolments', apiName: 'LMS_Enrolment_ID' },
      { module: 'Enrolments', apiName: 'Progress_Percentage' },
      { module: 'Enrolments', apiName: 'Last_LMS_Sync' },
      { module: 'Enrolments', apiName: 'External_Sync_Status' },
      { module: 'Contacts', apiName: 'LMS_Provider' },
      { module: 'Contacts', apiName: 'LMS_User_ID' },
      { module: 'Contacts', apiName: 'Last_LMS_Sync' }
    ],
    notes: [
      'External LMS information is a normalized demonstration dataset stored in Zoho Catalyst. No connection is made to any LMS product.',
      'Zoho Books is read-only in this phase: invoices cannot be created, edited, paid or deleted from this application.',
      'Six LMS fields have no equivalent on the CRM Enrolments module, so their values are held in Catalyst and shown from there. See recommendedCrmFields.'
    ]
  });
});

/* -------------------------------- activity ----------------------------- */

R('/api/activity', perms.P.ACTIVITY_READ, async (req, res) => {
  const entityType = String(req.query.entityType || '').replace(/[^a-z]/gi, '') || null;
  const recordId = String(req.query.recordId || '').replace(/[^0-9]/g, '') || null;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  let rows = [];
  let unavailable = null;
  try {
    rows = await auth.readActivity(req, { entityType, recordId, limit });
  } catch (err) {
    // A missing or uninitialised audit table must not break the page.
    unavailable = z.redact(err && err.message);
  }
  ok(res, rows, { count: rows.length, unavailable });
});

/* ------------------------------ diagnostics ---------------------------- */

/**
 * Deployment diagnostics. Administrator-only, and reports booleans, states and
 * redacted messages — never a credential, a token or a stack trace.
 *
 * The `auth` block is the live view of identity resolution: which strategy
 * answered, and what each of the others did. That is what makes the open
 * Catalyst getCurrentUser() question debuggable against a real deployment.
 */
R('/api/diag', perms.P.INTEGRATION_READ, async (req, res) => {
  const out = {
    auth: {
      resolvedBy: req.user.resolvedBy,
      attempts: req.__zylkerAuthAttempts || [],
      principal: { id: req.principal.id, email: req.principal.email, role: req.principal.role }
    },
    connections: null, crmProbe: null, lmsProbe: null, booksProbe: null
  };
  try { out.connections = await z.probe(req); }
  catch (err) { out.connections = { error: z.redact(err && err.message) }; }

  try {
    const rows = await z.crmQuery(req, `select id from ${cfg.modules.programmes} where ${ALL} limit 1`);
    out.crmProbe = { ok: true, rowsReturned: rows.length };
  } catch (err) { out.crmProbe = { ok: false, ...z.safeError(err, 'crm') }; }

  try {
    const st = await lms.status(req);
    out.lmsProbe = {
      ok: st.status === 'connected',
      tables: st.tables || null,
      courses: st.counts ? st.counts.courses : null,
      enrolments: st.counts ? st.counts.enrolments : null,
      demonstrationDataset: true,
      detail: st.detail || null
    };
  } catch (err) { out.lmsProbe = { ok: false, detail: z.redact(err && err.message) }; }

  out.booksProbe = await books.health(z, req).catch((err) => ({ status: 'unavailable', detail: z.redact(err && err.message) }));

  out.config = {
    crmBaseUrl: cfg.crm.baseUrl,
    booksBaseUrl: cfg.books.baseUrl,
    booksOrgConfigured: Boolean(cfg.books.organizationId),
    connections: { crm: cfg.crm.connection, books: cfg.books.connection },
    lmsTables: cfg.lms
  };
  return ok(res, out);
});

/* ------------------------------ write routes --------------------------- */

const P = perms.P;

/**
 * [method, path, permission, handler]. Ordering matters only for express path
 * matching; the permission column is the authorization contract.
 */
const WRITE_ROUTES = [
  ['post', '/api/students', P.STUDENT_WRITE, writes.studentCreate],
  ['patch', '/api/students/:id', P.STUDENT_WRITE, writes.studentUpdate],
  ['post', '/api/students/:id/archive', P.STUDENT_WRITE, writes.studentArchive],
  ['delete', '/api/students/:id', P.STUDENT_DELETE, writes.studentDelete],

  ['post', '/api/applications', P.APPLICATION_WRITE, writes.applicationCreate],
  ['patch', '/api/applications/:id', P.APPLICATION_WRITE, writes.applicationUpdate],
  ['post', '/api/applications/:id/transition', P.APPLICATION_TRANSITION, writes.applicationTransition],
  ['post', '/api/applications/:id/archive', P.APPLICATION_WRITE, writes.applicationArchive],
  ['delete', '/api/applications/:id', P.APPLICATION_DELETE, writes.applicationDelete],

  ['post', '/api/programmes', P.PROGRAMME_WRITE, writes.programmeCreate],
  ['patch', '/api/programmes/:id', P.PROGRAMME_WRITE, writes.programmeUpdate],
  ['post', '/api/programmes/:id/active', P.PROGRAMME_WRITE, writes.programmeSetActive],
  ['delete', '/api/programmes/:id', P.PROGRAMME_DELETE, writes.programmeDelete],

  ['post', '/api/intakes', P.INTAKE_WRITE, writes.intakeCreate],
  ['patch', '/api/intakes/:id', P.INTAKE_WRITE, writes.intakeUpdate],
  ['post', '/api/intakes/:id/status', P.INTAKE_WRITE, writes.intakeSetStatus],
  ['delete', '/api/intakes/:id', P.INTAKE_DELETE, writes.intakeDelete],

  ['post', '/api/enrolments', P.ENROLMENT_WRITE, writes.enrolmentCreate],
  ['patch', '/api/enrolments/:id', P.ENROLMENT_WRITE, writes.enrolmentUpdate],
  ['post', '/api/enrolments/:id/archive', P.ENROLMENT_WRITE, writes.enrolmentArchive],
  ['post', '/api/enrolments/:id/complete', P.ENROLMENT_WRITE, writes.enrolmentComplete],
  ['delete', '/api/enrolments/:id', P.ENROLMENT_DELETE, writes.enrolmentDelete]
];

/**
 * External LMS Connector writes.
 *
 * Separate from WRITE_ROUTES because these handlers take (deps, req) and return
 * the record directly rather than the { data, meta, audit } envelope the CRM
 * handlers use. Same middleware chain, same permission enforcement.
 */
const LMS_WRITE_ROUTES = [
  ['post', '/api/lms/courses', P.LMS_WRITE, (d, req) => lms.createCourse(req, req.body)],
  ['patch', '/api/lms/courses/:id', P.LMS_WRITE, (d, req) => lms.updateCourse(req, req.params.id, req.body)],
  ['post', '/api/lms/courses/:id/archive', P.LMS_WRITE, (d, req) => lms.archiveCourse(req, req.params.id)],
  ['post', '/api/lms/courses/:id/map', P.LMS_MAP, (d, req) => lms.mapCourse(d, req, req.params.id, (req.body || {}).programmeId)],
  ['post', '/api/lms/courses/:id/sync', P.LMS_SYNC, (d, req) => lms.syncCourseToCrm(d, req, req.params.id)],
  ['post', '/api/lms/courses/bulk-sync', P.LMS_BULK_SYNC, (d, req) => lms.bulkSyncCourses(d, req)],

  ['post', '/api/lms/enrolments', P.LMS_WRITE, (d, req) => lms.createEnrolment(d, req, req.body)],
  ['patch', '/api/lms/enrolments/:id', P.LMS_WRITE, (d, req) => lms.updateEnrolment(req, req.params.id, req.body)],
  ['post', '/api/lms/enrolments/:id/map', P.LMS_MAP, (d, req) => {
    const b = req.body || {};
    // One endpoint, two mappings: student and CRM enrolment. Which one runs is
    // decided by what the caller supplied, so the UI needs only one action.
    if (b.crmEnrolmentId !== undefined) return lms.mapEnrolmentToCrmEnrolment(d, req, req.params.id, b.crmEnrolmentId);
    return lms.mapEnrolmentStudent(d, req, req.params.id, b);
  }],
  ['post', '/api/lms/enrolments/:id/sync', P.LMS_SYNC, (d, req) => lms.syncEnrolmentToCrm(d, req, req.params.id)],
  ['post', '/api/lms/enrolments/:id/create-crm-enrolment', P.LMS_CREATE_CRM_ENROLMENT,
    (d, req) => lms.createCrmEnrolmentFor(d, req, req.params.id, req.body)]
];

// `deps` is injected so the same handlers can be unit-tested against a mocked
// Zoho layer without a live Catalyst session.
const deps = { zoho: z };

const wrapWrite = (handler) => async (req, res) => {
  try {
    // Replay of an Idempotency-Key returns the first response, so a retried
    // create or transition cannot act twice.
    const replayed = auth.idempotencyLookup(req);
    if (replayed) return res.status(200).json({ ...replayed, meta: { ...(replayed.meta || {}), idempotentReplay: true } });

    // A capacity override is a request, not an instruction: the handler only
    // honours it when the PRINCIPAL holds the permission, decided here.
    req.canOverrideCapacity = auth.hasPermission(req, P.CAPACITY_OVERRIDE);

    const result = await handler(deps, req);
    await auth.audit(req, result.audit || { action: 'unknown', entityType: null, result: 'success' });
    const body = { data: result.data, meta: { retrievedAt: new Date().toISOString(), ...(result.meta || {}) } };
    auth.idempotencyStore(req, body);
    return res.status(200).json(body);
  } catch (err) {
    if (err instanceof lms.LmsError) {
      await auth.audit(req, {
        action: `${req.method} ${req.path}`, entityType: 'lms',
        recordId: req.params && req.params.id ? String(req.params.id) : null,
        changedFields: [], result: `error:${err.code}`
      });
      return fail(res, err.status, err.code, err.message, 'lms');
    }
    if (err instanceof writes.AppError) {
      await auth.audit(req, {
        action: `${req.method} ${req.path}`, entityType: null,
        recordId: req.params && req.params.id ? String(req.params.id) : null,
        changedFields: [], result: `error:${err.code}`
      });
      return fail(res, err.status, err.code, err.message);
    }
    // Unexpected/upstream error: never surface the raw body (it can echo tokens).
    const s = z.safeError(err, err.__service || 'zoho');
    await auth.audit(req, { action: `${req.method} ${req.path}`, entityType: null, changedFields: [], result: 'error:upstream' });
    return fail(res, s.status >= 400 && s.status < 600 ? s.status : 502,
      err.__crmCode || 'UPSTREAM_ERROR', s.detail, s.service);
  }
};

/* ---------------------------- registration ----------------------------- */
/*
 * Single place where middleware order is decided:
 *   reads : requireAuth -> requirePermission -> handler
 *   writes: requireAuth -> checkOrigin -> rateLimit -> requireJson
 *           -> requirePermission -> handler
 *
 * requireAuth comes FIRST on writes so that rate limiting is keyed to a user
 * and an anonymous caller is refused before any other work happens.
 */
readRoutes.forEach(([path, permission, handler]) => {
  const chain = [auth.requireAuth];
  if (permission) chain.push(auth.requirePermission(permission));
  app.get(path, ...chain, wrap(handler));
});

WRITE_ROUTES.forEach(([method, path, permission, handler]) => {
  app[method](path,
    auth.requireAuth, auth.checkOrigin, auth.rateLimit, auth.requireJson,
    auth.requirePermission(permission),
    wrapWrite(handler));
});

/**
 * LMS writes use the same middleware chain, so authentication, origin, rate
 * limiting, JSON and permission checks are identical. Only the response shaping
 * differs: these handlers return the record itself.
 */
const wrapLmsWrite = (handler) => async (req, res) => {
  try {
    const replayed = auth.idempotencyLookup(req);
    if (replayed) return res.status(200).json({ ...replayed, meta: { ...(replayed.meta || {}), idempotentReplay: true } });

    const data = await handler(deps, req);
    const body = { data, meta: { retrievedAt: new Date().toISOString(), source: 'catalyst-lms', demonstrationDataset: true } };
    auth.idempotencyStore(req, body);
    return res.status(200).json(body);
  } catch (err) {
    if (err instanceof lms.LmsError) return fail(res, err.status, err.code, err.message, 'lms');
    if (err instanceof writes.AppError) return fail(res, err.status, err.code, err.message);
    const s2 = z.safeError(err, err.__service || 'zoho');
    return fail(res, s2.status >= 400 && s2.status < 600 ? s2.status : 502,
      err.__crmCode || 'UPSTREAM_ERROR', s2.detail, s2.service);
  }
};

LMS_WRITE_ROUTES.forEach(([method, path, permission, handler]) => {
  app[method](path,
    auth.requireAuth, auth.checkOrigin, auth.rateLimit, auth.requireJson,
    auth.requirePermission(permission),
    wrapLmsWrite(handler));
});

app.use((req, res) => fail(res, 404, 'NO_ROUTE', 'Unknown endpoint.'));

module.exports = app;
