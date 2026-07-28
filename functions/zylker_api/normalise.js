'use strict';
const cfg = require('./config');
const refs = require('./references');

/**
 * Every record carries its server-minted external reference and the module it
 * came from. Whether the record may be EDITED is no longer a property of the
 * record — it is a property of the caller's role, resolved by permissions.js
 * and returned once per session on /api/me. The UI reads it from there, so the
 * button state and the API's answer can never disagree.
 */
const meta = (module_, r) => ({
  module: module_,
  reference: refs.referenceOf(module_, r),
  source: 'crm'
});

/** Zoho lookups arrive as { id, name } - flatten them for the client. */
const lookup = (v) => (v && v.id ? { id: v.id, name: v.name || null } : null);
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const str = (v) => (v === null || v === undefined || v === '' ? null : String(v));

function student(r) {
  return {
    id: r.id,
    studentId: str(r.Student_ID),
    firstName: str(r.First_Name),
    lastName: str(r.Last_Name),
    fullName: [r.First_Name, r.Last_Name].filter(Boolean).join(' ') || null,
    email: str(r.Email),
    status: str(r.Student_Status),
    externalReference: str(r.External_Student_Ref),
    lms: {
      provider: str(r.LMS_Provider),
      userId: str(r.LMS_User_ID),
      lastSync: str(r.Last_LMS_Sync)
    },
    createdTime: str(r.Created_Time),
    modifiedTime: str(r.Modified_Time),
    meta: meta(cfg.modules.students, r)
  };
}

function application(r) {
  return {
    id: r.id,
    applicationId: str(r.Application_ID),
    name: str(r.Deal_Name),
    externalReference: str(r.External_Application_Ref),
    stage: str(r.Stage),
    pipeline: str(r.Pipeline),
    student: lookup(r.Contact_Name),
    programme: lookup(r.Programme),
    intake: lookup(r.Intake),
    applicationDate: str(r.Application_Date),
    expectedDecisionDate: str(r.Closing_Date),
    decisionDate: str(r.Decision_Date),
    tuitionFee: num(r.Amount),
    documentsStatus: str(r.Documents_Status),
    studyMode: str(r.Preferred_Study_Mode),
    modifiedTime: str(r.Modified_Time),
    meta: meta(cfg.modules.applications, r)
  };
}

function programme(r) {
  return {
    id: r.id,
    name: str(r.Product_Name),
    code: str(r.Product_Code),
    status: str(r.Programme_Status),
    academicLevel: str(r.Academic_Level),
    department: str(r.Department),
    durationValue: num(r.Duration_Value),
    durationUnit: str(r.Duration_Unit),
    deliveryMode: Array.isArray(r.Delivery_Mode) ? r.Delivery_Mode : (r.Delivery_Mode ? [r.Delivery_Mode] : []),
    tuitionFee: num(r.Unit_Price),
    award: str(r.Award_or_Certificate),
    active: r.Product_Active === true,
    lms: {
      provider: str(r.LMS_Provider),
      courseId: str(r.LMS_Course_ID),
      courseUrl: str(r.LMS_Course_URL)
    },
    modifiedTime: str(r.Modified_Time),
    meta: meta(cfg.modules.programmes, r)
  };
}

function intake(r) {
  return {
    id: r.id,
    name: str(r.Name),
    intakeId: str(r.Intake_ID),
    externalReference: str(r.External_Intake_Reference),
    programme: lookup(r.Programme),
    academicYear: str(r.Academic_Year),
    status: str(r.Intake_Status),
    applicationOpenDate: str(r.Application_Open_Date),
    applicationDeadline: str(r.Application_Deadline),
    startDate: str(r.Start_Date),
    endDate: str(r.End_Date),
    capacity: num(r.Capacity),
    deliveryMode: str(r.Delivery_Mode),
    location: str(r.Campus_or_Location),
    lmsCohortId: str(r.LMS_Cohort_or_Group_ID),
    modifiedTime: str(r.Modified_Time),
    meta: meta(cfg.modules.intakes, r)
  };
}

function enrolment(r) {
  return {
    id: r.id,
    reference: str(r.Name),
    externalReference: str(r.External_Enrolment_Ref),
    student: lookup(r.Student),
    programme: lookup(r.Programme),
    intake: lookup(r.Intake),
    application: lookup(r.Application),
    status: str(r.Enrolment_Status),
    enrolmentDate: str(r.Enrolment_Date),
    startDate: str(r.Start_Date),
    completionDate: str(r.Completion_Date),
    financeStatus: str(r.Finance_Status),
    certificateIssued: r.Certificate_Issued === true,
    lms: {
      provider: str(r.LMS_Provider),
      enrolmentId: str(r.LMS_Enrolment_ID),
      progressPercentage: num(r.Progress_Percentage),
      lastSync: str(r.Last_LMS_Sync),
      // Manually maintained in CRM - the UI must label it as such.
      syncStatus: str(r.External_Sync_Status)
    },
    modifiedTime: str(r.Modified_Time),
    meta: meta(cfg.modules.enrolments, r)
  };
}

/** Builds a public Learn course URL from the configured template. */
function courseUrl(slug) {
  if (!slug) return null;
  return cfg.learn.courseUrlTemplate
    .replace('{portal}', String(cfg.learn.portalUrl).replace(/\/+$/, ''))
    .replace('{hub}', cfg.learn.hubUrl)
    .replace('{slug}', slug);
}

function course(c) {
  const slug = str(c.url);
  return {
    id: str(c.id),
    name: str(c.name),
    description: str(c.description),
    slug,
    // Absolute link built from the configured, verified URL template.
    url: courseUrl(slug),
    status: str(c.status),
    published: String(c.status || '').toUpperCase() === 'ACTIVE',
    durationText: str(c.durationText),
    lessonCount: num(c.lessonCount),
    enrollmentType: str(c.enrollmentType),
    bannerUrl: str(c.bannerUrl)
  };
}

/** Normalises a course/programme title for last-resort comparison. */
function normName(v) {
  return String(v || '')
    .replace(/^\s*\[[^\]]*\]\s*/, '')   // drop a [CODE] prefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Matches a CRM programme to a Learn course.
 * Identifier matches (Learn Course ID, then stored course URL) are authoritative.
 * A normalised-name match is only used when no identifier resolves, and is
 * flagged as inferred so the UI can say so.
 */
function matchCourse(programme, courses) {
  const none = { course: null, inferred: false, matchedOn: null };
  if (!programme || !Array.isArray(courses) || !courses.length) return none;

  const id = programme.lms && programme.lms.courseId;
  if (id) {
    const hit = courses.find((c) => c.id && String(c.id) === String(id));
    if (hit) return { course: hit, inferred: false, matchedOn: 'courseId' };
  }

  const storedUrl = programme.lms && programme.lms.courseUrl;
  if (storedUrl) {
    const slug = String(storedUrl).split('?')[0].split('/').filter(Boolean).pop();
    const hit = courses.find((c) => c.slug && c.slug === slug);
    if (hit) return { course: hit, inferred: false, matchedOn: 'courseUrl' };
  }

  const target = normName(programme.name);
  if (target) {
    const hits = courses.filter((c) => normName(c.name) === target);
    if (hits.length === 1) return { course: hits[0], inferred: true, matchedOn: 'name' };
  }
  return none;
}

/** Derives the programme code from a "[CODE] Name" Learn course title. */
function codeFromCourseName(name) {
  const m = /^\s*\[([^\]]+)\]/.exec(name || '');
  return m ? m[1].trim() : null;
}

module.exports = { student, application, programme, intake, enrolment, course, courseUrl, codeFromCourseName, normName, matchCourse };
