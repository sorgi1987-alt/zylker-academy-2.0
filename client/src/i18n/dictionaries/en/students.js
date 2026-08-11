export default {
  students: {
    pageTitle: 'Students',
    pageIntro: 'Student records held in Zoho CRM, with their current application and enrolment.',
    allStudents: 'All students',
    addStudent: 'Add student',
    searchLabel: 'Search',
    searchPlaceholder: 'Name, email or student ID',
    statusLabel: 'Status',
    allStatuses: 'All statuses',
    empty: {
      title: 'No students match',
      filtered: 'Try a different search term or clear the filters.',
      default: 'No student records were returned from CRM.'
    },
    table: {
      name: 'Name',
      studentId: 'Student ID',
      email: 'Email',
      status: 'Status',
      programme: 'Programme',
      enrolment: 'Enrolment',
      added: 'Added'
    },
    unnamed: 'Unnamed',
    showingRecent: 'Showing the most recent {total} records. Narrow the search to see older ones.'
  },
  student360: {
    notFound: 'Student not found',
    unnamedStudent: 'Unnamed student',
    linkCopied: 'Link copied.',
    linkCopyFailed: 'Could not copy. Use the address bar instead.',
    edit: 'Edit',
    archiveAction: 'Archive',
    newApplication: 'New application',
    newEnrolment: 'New enrolment',
    addNote: 'Add note',
    copyLink: 'Copy link',
    openInCrm: 'Open in Zoho CRM',
    deleteAction: 'Delete',
    actionFailedTitle: 'That action could not be completed',
    tabsLabel: 'Student record sections',
    tabs: {
      overview: 'Overview',
      applications: 'Applications',
      enrolments: 'Enrolments',
      learning: 'Learning',
      finance: 'Finance',
      support: 'Support',
      activity: 'Activity'
    },
    archive: {
      title: 'Archive this student?',
      message: 'The student will be marked as Withdrawn in Zoho CRM. Their applications and enrolments are kept.',
      confirmLabel: 'Archive student',
      toast: 'Student archived.'
    },
    delete: {
      title: 'Delete this student permanently?',
      message: 'This cannot be undone. Deletion is refused if any application or enrolment still points at this student.',
      confirmLabel: 'Delete permanently',
      toast: 'Student deleted.'
    },
    overview: {
      identity: 'Identity',
      fullName: 'Full name',
      email: 'Email',
      studentId: 'Student ID',
      status: 'Status',
      externalReference: 'External reference',
      added: 'Added',
      lastModified: 'Last modified',
      whereTheyAre: 'Where they are',
      currentProgramme: 'Current programme',
      appliedFor: '(applied for)',
      none: 'None',
      currentIntake: 'Current intake',
      latestApplication: 'Latest application',
      activeEnrolment: 'Active enrolment',
      learningProgress: 'Learning progress',
      averageProgress: 'Average progress',
      records: 'Records',
      completed: 'Completed',
      seeLearningRecords: 'See learning records',
      noLearningRecords: 'No external learning records are mapped to this student, so no progress can be reported here.',
      finance: 'Finance',
      outstandingBalance: 'Outstanding balance',
      invoices: 'Invoices',
      seeInvoices: 'See invoices',
      noBooksCustomer: 'No Zoho Books customer is linked to this student, so no balance can be shown.',
      support: 'Support',
      openTickets: 'Open tickets',
      tickets: 'Tickets',
      seeTickets: 'See tickets',
      noDeskContact: 'No Zoho Desk contact is linked to this student, so no tickets can be shown.',
      recentActivity: 'Recent activity',
      allActivity: 'All activity'
    },
    applications: {
      title: 'Applications',
      table: {
        application: 'Application',
        stage: 'Stage',
        programme: 'Programme',
        intake: 'Intake',
        applied: 'Applied'
      },
      empty: 'This student has no applications.'
    },
    enrolments: {
      title: 'Enrolments',
      table: {
        enrolment: 'Enrolment',
        status: 'Status',
        programme: 'Programme',
        intake: 'Intake',
        enrolled: 'Enrolled',
        progress: 'Progress'
      },
      empty: 'This student has no enrolments.',
      programmesTitle: 'Programmes',
      noProgrammes: 'No programmes are linked to this student.'
    },
    learning: {
      title: 'Learning',
      learningHub: 'Learning Hub',
      table: {
        course: 'Course',
        provider: 'Provider',
        status: 'Status',
        progress: 'Progress',
        score: 'Score',
        certificate: 'Certificate',
        lastActivity: 'Last activity'
      },
      viewCertificate: 'View',
      noRecords: 'No external learning records are mapped to this student. A record exists in the connector only once it has been matched to this CRM contact.',
      identifiersTitle: 'Learner platform identifiers',
      provider: 'Provider',
      lmsUserId: 'LMS user id',
      notLinked: 'Not linked',
      lastSync: 'Last sync',
      identifiersNote: 'These three fields live on the CRM Contact and are set by hand. The learning records above come from the external LMS connector and are a separate source — the two can disagree.'
    },
    activity: {
      title: 'Activity'
    },
    invoices: {
      title: 'Invoices',
      noAccess: 'Your role does not include access to finance data.',
      ambiguousTitle: 'The Zoho Books link is ambiguous',
      ambiguousNote: 'No invoices are shown until one customer is linked, so that this student is never shown another customer’s finances.',
      noCustomerLinked: 'No Zoho Books customer is linked to this student.',
      matchedOnField: 'stored Books customer id ({field})',
      matchedOnEmail: 'exact email match',
      linkedBefore: 'Linked to Zoho Books customer',
      linkedAfter: 'by {matchedOn}. Accounting changes are made in Zoho Books.',
      outstandingBalance: 'Outstanding balance',
      table: {
        invoice: 'Invoice',
        date: 'Date',
        due: 'Due',
        status: 'Status',
        total: 'Total',
        balance: 'Balance'
      },
      noInvoices: 'This customer has no invoices.',
      moreNote: 'Only the most recent invoices are shown here.',
      seeAllFinance: 'See all in Finance'
    },
    tickets: {
      title: 'Tickets',
      noAccess: 'Your role does not include access to support data.',
      ambiguousTitle: 'The Zoho Desk link is ambiguous',
      ambiguousNote: 'No tickets are shown until one contact is linked, so that this student is never shown another contact’s support history.',
      noContactLinked: 'No Zoho Desk contact is linked to this student.',
      matchedOnField: 'stored Desk contact id ({field})',
      matchedOnEmail: 'exact email match',
      linkedBefore: 'Linked to Zoho Desk contact',
      linkedAfter: 'by {matchedOn}. Tickets are replied to and closed in Zoho Desk.',
      openTickets: 'Open tickets',
      table: {
        ticket: 'Ticket',
        subject: 'Subject',
        status: 'Status',
        created: 'Created',
        due: 'Due'
      },
      overdue: 'Overdue',
      noTickets: 'This contact has no tickets.',
      moreNote: 'Only the most recent tickets are shown here.',
      seeAllSupport: 'See all in Support'
    }
  },
  studentForm: {
    editTitle: 'Edit student',
    addTitle: 'Add student',
    editIntro: 'Changes are written to the linked Zoho CRM contact record.',
    addIntro: 'Creates a contact record in Zoho CRM. Email addresses must be unique.',
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email',
    emailHint: 'Used to detect duplicate students and to match Zoho Books invoices.',
    status: 'Status',
    lastNameRequired: 'A last name is required.',
    emailInvalid: 'Enter a valid email address.',
    saveChanges: 'Save changes',
    createStudent: 'Create student',
    loadingStudent: 'Loading student',
    toastUpdated: 'Student updated.',
    toastCreated: 'Student created.'
  }
};
