// Filled in by the Enrolments / EnrolmentDetail / NewEnrolment translation batch.
export default {
  enrolments: {
    pageTitle: 'Enrolments',
    allEnrolments: 'All enrolments',
    newEnrolment: 'New enrolment',
    searchPlaceholder: 'Student name, email or reference',
    status: 'Status',
    lmsMapping: 'LMS mapping',
    mappedOptions: {
      no: 'Not mapped to the LMS',
      yes: 'Mapped to the LMS'
    },
    any: 'Any',
    allStatuses: 'All statuses',
    lastSync: 'Last sync',
    noMatch: 'No enrolments match',
    table: {
      reference: 'Reference',
      student: 'Student',
      programme: 'Programme',
      intake: 'Intake',
      status: 'Status',
      enrolled: 'Enrolled',
      progress: 'Progress',
      lmsSync: 'LMS sync'
    },
    syncNote: 'Progress and sync status are the values the external LMS connector last wrote onto each CRM enrolment. Open the Learning Hub to see the current position held by the connector, which may be newer.'
  },
  enrolmentDetail: {
    editDialog: {
      title: 'Edit enrolment',
      financeStatus: 'Finance status',
      startDate: 'Start date',
      completionDate: 'Completion date',
      certificateIssued: 'Certificate issued',
      note: 'Progress and the LMS identifiers are not editable here. They are written onto this record by the external LMS connector, and a value typed in by hand would be overwritten by the next synchronisation.',
      saveChanges: 'Save changes',
      updated: 'Enrolment updated.'
    },
    finance: {
      cardTitle: 'Finance',
      booksUnreachable: 'Zoho Books could not be reached.',
      ambiguousNote: 'No invoices are shown while the Zoho Books link is ambiguous, so this student is never shown another customer’s finances.',
      noCustomerLinked: 'No Zoho Books customer is linked to this student.',
      disagreeTitle: 'CRM and Zoho Books disagree',
      disagreeMessageOne: 'The enrolment’s finance status in CRM reads “{financeStatus}”, but Zoho Books holds 1 invoice for this student{paidNote}. That CRM field is maintained by hand and nothing updates it from Books — edit the enrolment to bring it into line.',
      disagreeMessageOther: 'The enrolment’s finance status in CRM reads “{financeStatus}”, but Zoho Books holds {count} invoices for this student{paidNote}. That CRM field is maintained by hand and nothing updates it from Books — edit the enrolment to bring it into line.',
      paidNote: ', {count} of them paid',
      outstandingBalance: 'Outstanding balance',
      invoices: 'Invoices',
      outstandingCount: '({count} outstanding)',
      table: {
        invoice: 'Invoice',
        date: 'Date',
        status: 'Status',
        total: 'Total',
        balance: 'Balance'
      },
      noInvoices: 'This customer has no invoices in Zoho Books.',
      note: 'Invoices in Zoho Books belong to a customer, not to an individual enrolment, so these are all invoices for this student.'
    },
    notFound: 'Enrolment not found',
    fallbackTitle: 'Enrolment',
    edit: 'Edit',
    complete: 'Complete',
    cancelEnrolment: 'Cancel enrolment',
    reactivate: 'Reactivate',
    addNote: 'Add note',
    invoicesLink: 'Invoices',
    delete: 'Delete',
    actionFailedTitle: 'That action could not be completed',
    confirm: {
      completeTitle: 'Mark this enrolment complete?',
      completeMessage: 'The status becomes Completed and a completion date is recorded. If this is the student’s only active enrolment, they become an alumnus.',
      completeConfirmLabel: 'Complete enrolment',
      completedToast: 'Enrolment completed.',
      cancelTitle: 'Cancel this enrolment?',
      cancelMessage: 'The status becomes Cancelled in Zoho CRM. The record is kept and its place is released.',
      cancelConfirmLabel: 'Cancel enrolment',
      cancelledToast: 'Enrolment cancelled.',
      reactivateTitle: 'Reactivate this enrolment?',
      reactivateMessage: 'The status returns to Active in Zoho CRM. This consumes a place on the intake again.',
      reactivateConfirmLabel: 'Reactivate',
      reactivatedToast: 'Enrolment reactivated.',
      deleteTitle: 'Delete this enrolment permanently?',
      deleteMessage: 'This cannot be undone. Consider cancelling instead, which keeps the record.',
      deleteConfirmLabel: 'Delete permanently',
      deletedToast: 'Enrolment deleted.'
    },
    details: {
      cardTitle: 'Enrolment details',
      reference: 'Reference',
      status: 'Status',
      enrolled: 'Enrolled',
      startDate: 'Start date',
      completionDate: 'Completion date',
      financeStatus: 'Finance status',
      financeStatusHint: 'Set by hand in CRM — not from Zoho Books.',
      certificateIssued: 'Certificate issued',
      yes: 'Yes',
      no: 'No',
      lastModified: 'Last modified'
    },
    related: {
      cardTitle: 'Related records',
      student: 'Student',
      programme: 'Programme',
      intake: 'Intake',
      application: 'Application',
      notLinked: 'Not linked'
    },
    lms: {
      cardTitle: 'External LMS',
      learningHub: 'Learning Hub',
      mappedCourse: 'Mapped course',
      noCourseMappedToProgramme: 'No LMS course is mapped to this programme',
      noCourseMappedGeneric: 'No LMS course is mapped to a programme for this enrolment',
      table: {
        externalEnrolment: 'External enrolment',
        course: 'Course',
        status: 'Status',
        progress: 'Progress',
        certificate: 'Certificate',
        sync: 'Sync',
        lastSync: 'Last sync'
      },
      never: 'Never',
      noRecordLinked: 'No external learning record is linked to this enrolment. Link one from the Learning Hub, where the record can also be mapped to the student first.',
      valuesHeldTitle: 'Values held on this CRM record',
      lmsEnrolmentId: 'LMS enrolment id',
      progress: 'Progress',
      syncStatus: 'Sync status',
      lastSync: 'Last sync',
      note: 'The CRM fields above are what the connector last wrote here. If they differ from the table, this enrolment has not been synchronised since the LMS record changed — the two are shown separately rather than merged so that the drift is visible.'
    },
    activityCardTitle: 'Activity'
  },
  newEnrolment: {
    pageTitle: 'New enrolment',
    pageIntro: 'Creates an enrolment in Zoho CRM and sets the student to Active.',
    student: 'Student',
    chooseStudent: 'Choose a student…',
    unnamed: 'Unnamed',
    programme: 'Programme',
    chooseProgramme: 'Choose a programme…',
    intake: 'Intake',
    chooseIntake: 'Choose an intake…',
    intakeHintFiltered: 'Only intakes for the chosen programme are listed.',
    intakeHintNoProgramme: 'Choose a programme first.',
    full: 'full',
    placesLeft: '{count} places left',
    enrolmentDate: 'Enrolment date',
    enrolmentDateHint: 'Defaults to today.',
    startDate: 'Start date',
    errors: {
      chooseStudent: 'Choose a student.',
      chooseProgramme: 'Choose a programme.',
      chooseIntake: 'Choose an intake.'
    },
    fullIntake: {
      title: 'This intake is full',
      placesTaken: '{used} of {capacity} places are taken.',
      overrideLabel: 'I confirm this enrolment should exceed the intake capacity.',
      cannotOverride: 'Your role cannot override a capacity limit. Ask an administrator, or increase the capacity on the intake.'
    },
    createEnrolment: 'Create enrolment',
    createdToast: 'Enrolment created.',
    loadingForm: 'Loading form data'
  }
};
