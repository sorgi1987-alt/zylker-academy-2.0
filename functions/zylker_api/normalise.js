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
/**
 * Anything that does not parse to a finite number is absent, not zero and not
 * NaN. A `NaN` survives a `=== null` check in the client and renders as "NaN%"
 * on a student's record, which reads as a fault in the data rather than in the
 * conversion.
 */
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
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
      // Written onto the CRM record by the LMS connector's last sync. It is a
      // snapshot, not the connector's current position, and the UI says so.
      syncStatus: str(r.External_Sync_Status)
    },
    modifiedTime: str(r.Modified_Time),
    meta: meta(cfg.modules.enrolments, r)
  };
}

module.exports = { student, application, programme, intake, enrolment };
