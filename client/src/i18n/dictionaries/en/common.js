/**
 * Strings reused across many pages via shared components (Ui.jsx, Form.jsx)
 * and the app shell (App.jsx route guard / 404). Kept separate from
 * page-specific dictionaries because every page depends on this one.
 */
export default {
  common: {
    previous: 'Previous',
    next: 'Next',
    cancel: 'Cancel',
    confirm: 'Confirm',
    working: 'Working…',
    saving: 'Saving…',
    tryAgain: 'Try again',
    close: 'Close',
    closeDialog: 'Close dialog',
    dismissNotification: 'Dismiss notification',
    notAvailable: 'Not available',
    notAvailableTitle: 'This source could not be reached',
    partial: 'Partial — more records than could be totalled',
    readOnly: 'Read-only',
    readOnlyTitle: '{system} is read-only in this application',
    demoDataset: 'Demonstration dataset',
    demoDatasetTitle: 'Provider names are source labels on rows in the Catalyst Data Store. No request is made to any LMS product.',
    loading: 'Loading',
    nothingToShowYet: 'Nothing to show yet',
    loadError: 'This information could not be loaded',
    unexpectedError: 'An unexpected problem occurred.',
    pagination: 'Pagination',
    pageOf: 'Page {page} of {totalPages}',
    pageOnly: 'Page {page}',
    recordsCount: '{total} records',
    search: 'Search',
    all: 'All',
    filteredBy: 'Filtered by',
    activeFilters: 'Active filters',
    removeFilter: 'Remove the {label} filter',
    clearAll: 'Clear all',
    sourceUnavailable: '{system} is unavailable',
    sourceUnavailableDetail: '{system} did not respond. The rest of this page is unaffected.',
    noApplicationsRecorded: 'No applications recorded.',
    noDataYet: 'No data yet.',
    connected: 'Connected',
    unavailable: 'Unavailable',
    notRecorded: 'Not recorded',
    percentComplete: '{pct} per cent complete',
    unknownSource: 'Unknown source',
    dataFrom: 'Data from {label}',
    sourceCrm: 'Zoho CRM',
    sourceLms: 'External LMS',
    sourceCatalyst: 'Zoho Catalyst',
    sourceBooks: 'Zoho Books',
    sourceDesk: 'Zoho Desk',
    signOut: 'Sign out',
    ofCount: '{used} of {total}',
    errors: {
      sessionEnded: 'Your session has ended. Reload the page and sign in again.',
      notAllowed: 'Your role does not allow this action.',
      notAllowedWithPermission: 'Your role does not allow this action ({permission}).',
      conflict: 'Someone else changed this record while you had it open. Reload to see their version, then reapply your change.',
      noModifiedTime: 'This change could not be applied safely because the record was read incompletely. This is a fault in the application, not something you did.',
      duplicateEmail: 'A student with this email already exists.',
      duplicateEnrolment: 'This student already has an active enrolment for that programme and intake.',
      intakeProgrammeMismatch: 'That intake belongs to a different programme.',
      intakeAtCapacity: 'That intake is full. An administrator can confirm an override.',
      invalidDateRange: 'Check the dates: an end date cannot come before its start date.',
      invalidDateFallback: 'Check the date — it is not a valid calendar date.',
      invalidDataFallback: 'Zoho rejected one of the values. Check the highlighted field.',
      mandatoryNotFoundFallback: 'Zoho requires a value that was not supplied.',
      hasRelatedRecordsFallback: 'Other records still depend on this one, so it cannot be deleted.',
      hasRelatedEnrolmentFallback: 'An enrolment still depends on this record.',
      rateLimited: 'Too many changes just now. Wait a moment and try again.',
      network: 'Could not reach the service. Check your connection and try again.',
      booksNotConfigured: 'Zoho Books is not configured for this deployment.',
      actionFailedFallback: 'The action could not be completed.',
      genericFetchError: 'Something went wrong.',
      networkUnreachable: 'Could not reach the service. Check your connection.'
    },
    activity: {
      unavailable: 'Activity logging is not available on this deployment.',
      empty: 'No changes have been recorded for this record.',
      action: {
        applicationCreate: 'Application created',
        applicationUpdate: 'Application updated',
        applicationTransition: 'Stage changed',
        applicationArchive: 'Application withdrawn',
        applicationDelete: 'Application deleted',
        studentCreate: 'Student created',
        studentUpdate: 'Student updated',
        studentArchive: 'Student archived',
        studentDelete: 'Student deleted',
        enrolmentCreate: 'Enrolment created',
        enrolmentUpdate: 'Enrolment updated',
        enrolmentArchive: 'Enrolment cancelled',
        enrolmentComplete: 'Enrolment completed',
        enrolmentDelete: 'Enrolment deleted',
        note: 'Internal note',
        programmeCreate: 'Programme created',
        programmeUpdate: 'Programme updated',
        programmeActivate: 'Programme activated',
        programmeDeactivate: 'Programme deactivated',
        programmeDelete: 'Programme deleted',
        intakeCreate: 'Intake created',
        intakeUpdate: 'Intake updated',
        intakeStatus: 'Intake status changed',
        intakeDelete: 'Intake deleted'
      }
    },
    /*
     * The "Needs attention" queue's `title`/`category` are authored server-side
     * (functions/zylker_api/attention.js) but are always the same fixed string
     * per item key — safe to override here for display. `explanation` is left
     * in the server's English, on purpose: several items interpolate live
     * counts into the sentence (e.g. "3 past the recorded response date."),
     * and reproducing that branching here would duplicate attention.js's logic
     * client-side, with the two able to silently drift apart. Same reasoning
     * this app already applies to server-originated error text.
     */
    attention: {
      cardTitle: 'Needs attention',
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      loadingLabel: 'Working out what needs attention',
      partial: 'Partial',
      balanceOutstanding: 'Balance outstanding:',
      longestWaiting: 'Longest waiting:',
      allClear: 'Nothing is waiting. Applications, intakes, learning records, invoices and tickets are all within their thresholds.',
      showFewer: 'Show fewer',
      showAll: 'Show all {count}',
      severity: {
        critical: 'Critical',
        warning: 'Warning',
        information: 'For information'
      },
      age: {
        today: 'today',
        oneDayAgo: '1 day ago',
        daysAgo: '{days} days ago',
        inDays: 'in {days} days',
        inOneDay: 'in 1 day'
      },
      byKey: {
        applicationsAwaitingReview: { title: 'Applications awaiting review', category: 'Admissions' },
        documentsPending: { title: 'Documents pending', category: 'Admissions' },
        offersAwaitingResponse: { title: 'Offers awaiting response', category: 'Admissions' },
        intakesAtCapacity: { title: 'Intakes near or at capacity', category: 'Capacity' },
        enrolmentsMissingLmsMapping: { title: 'Enrolments without an LMS mapping', category: 'Learning' },
        lmsUnavailable: { title: 'Learning data could not be checked', category: 'Learning' },
        learnersNoRecentActivity: { title: 'Learners with no recent activity', category: 'Learning' },
        failedSynchronisations: { title: 'Failed synchronisations', category: 'Learning' },
        booksUnavailable: { title: 'Invoices could not be checked', category: 'Finance' },
        overdueInvoices: { title: 'Overdue invoices', category: 'Finance' },
        deskUnavailable: { title: 'Tickets could not be checked', category: 'Support' },
        ticketsOverdue: { title: 'Overdue tickets', category: 'Support' }
      }
    },
    record: {
      warningsLabel: 'Warnings about this record',
      severityTag: { critical: 'Critical', warning: 'Warning', information: 'Note' },
      open: 'Open',
      sectionsLabel: 'Sections',
      note: {
        title: 'Add an internal note',
        label: 'Note',
        hint: "Recorded in this record's activity history, attributed to you and timestamped. It is not written onto the record in Zoho CRM — this module has no notes field.",
        charCount: '{count} of 1000 characters.',
        submit: 'Record note',
        recorded: 'Note recorded in the activity trail.'
      }
    },
    workflow: {
      cardTitle: 'Admissions workflow',
      pipelineLabel: 'Admissions pipeline',
      stepState: { now: 'Current', done: 'Passed', todo: 'Not reached' },
      leftPipeline: 'This application left the pipeline at {stage}. The steps above show the process, not this application’s position in it.',
      moveTo: 'Move to {target}',
      stageWillChange: 'The stage will change to {target} in Zoho CRM.',
      enrolmentNote: ' An enrolment is created if one does not already exist; repeating this will not create a second.',
      decisionDateLabel: 'Decision date',
      decisionDateHint: "Written to the Decision Date field. Left blank, today's date is used.",
      documentsRequiredLabel: 'Documents required',
      documentsRequiredHint: 'Written to the Documents Status field on the application.',
      documentsPlaceholder: 'e.g. Passport, transcript',
      commentLabel: 'Comment',
      commentHint: "Recorded in this application's activity trail, attributed to you. The Application module has no comment field, so this is not written onto the CRM record.",
      transitionedWithEnrolment: 'Stage changed and an enrolment was created.',
      transitionedReusedEnrolment: 'Stage changed. The existing enrolment was reused.',
      transitioned: 'Stage changed.',
      linkedIntake: 'Linked intake: {used} of {capacity} places taken.',
      terminalStage: 'This application is at a final stage and cannot be moved further.',
      availableActions: 'Available next actions',
      enrolmentLabel: 'Enrolment',
      blockedStage: '{stage} is blocked: {reason}',
      whyNotOffered: 'Why are the other stages not offered?',
      viewOnly: 'Your role can view this workflow but not change the stage.',
      enrolmentCreated: 'created {date}'
    },
    syncLog: {
      empty: 'Nothing has been synchronised yet.',
      when: 'When',
      entity: 'Entity',
      operation: 'Operation',
      result: 'Result',
      crmRecord: 'CRM record',
      fields: 'Fields',
      message: 'Message',
      triggeredBy: 'Triggered by'
    },
    learningNav: {
      sectionsLabel: 'Learning Hub sections',
      courses: 'Courses',
      learners: 'Learners',
      syncLog: 'Synchronisation log'
    }
  },
  app: {
    checkingSession: 'Checking your session',
    noAccessTitle: 'You do not have access to this area',
    noAccessDetail: 'Your role does not include permission to view this. Ask an administrator if you need it.',
    notFoundTitle: 'Page not found',
    notFoundDetail: 'Use the navigation to continue.'
  }
};
