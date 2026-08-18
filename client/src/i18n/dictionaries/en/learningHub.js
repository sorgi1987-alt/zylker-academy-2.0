export default {
  learningCourses: {
    pageTitle: 'Learning Hub',
    cardTitle: 'External courses',
    syncAllButton: 'Sync all mapped courses',
    actionErrorTitle: 'That action could not be completed',
    searchLabel: 'Search',
    searchPlaceholder: 'Course name, external id, instructor or category',
    providerLabel: 'Provider',
    allProviders: 'All providers',
    mappingLabel: 'Mapping',
    syncLabel: 'Sync',
    any: 'Any',
    emptyTitle: 'No courses match',
    emptyMessage: 'Try clearing a filter.',
    table: {
      course: 'Course',
      provider: 'Provider',
      externalId: 'External id',
      delivery: 'Delivery',
      crmProgramme: 'CRM programme',
      mapping: 'Mapping',
      sync: 'Sync',
      lastSync: 'Last sync'
    },
    archived: 'Archived',
    notMapped: 'Not mapped',
    never: 'Never',
    provenanceNote: 'Provider names are source labels on rows in the Catalyst Data Store. No request is made to Moodle, Canvas, TrainerCentral or any SCORM host. The mapping to CRM and the push into it are real authenticated writes.',
    confirmBulk: {
      title: 'Synchronise every mapped course?',
      message: 'Each mapped course pushes its provider, external course id and course URL onto its CRM Programme. Courses that are not mapped are skipped. Every course is attempted independently, so one failure does not stop the rest.',
      confirmLabel: 'Sync all mapped'
    },
    bulkSyncResult: 'Bulk sync finished: {succeeded} of {attempted} synced',
    bulkSyncFailedSuffix: ', {failed} failed',
    bulkSyncSkippedSuffix: ', {skipped} skipped as unmapped'
  },
  learningCourseDetail: {
    mapDialog: {
      title: 'Map to a CRM programme',
      programmeLabel: 'CRM programme',
      programmeHint: 'Leave blank to clear the mapping. Remapping sets the sync status back to Pending, because a previous push no longer describes this course.',
      notMappedOption: 'Not mapped',
      truncatedNote: 'Showing the first {loaded} of {total} programmes. If the one you want is not listed, it is beyond this page rather than absent.',
      listError: 'The CRM programme list could not be loaded, so no mapping can be chosen right now.',
      saveButton: 'Save mapping',
      toastMapped: 'Course mapped to a CRM programme.',
      toastCleared: 'Mapping cleared.'
    },
    notFoundTitle: 'Course not found',
    allCoursesLink: 'All courses',
    changeMappingButton: 'Change mapping',
    mapToProgrammeButton: 'Map to programme',
    syncToCrmButton: 'Sync to CRM',
    archiveButton: 'Archive',
    archived: 'Archived',
    actionErrorTitle: 'That action could not be completed',
    syncConfirm: {
      title: 'Push this course to CRM?',
      message: "The CRM Programme's LMS provider, external course id and course URL are overwritten with this course's values. Programme name, fee, status and every other academic field are left untouched.",
      confirmLabel: 'Sync to CRM'
    },
    toastSynced: 'Synced. Fields written: {fields}.',
    archiveConfirm: {
      title: 'Archive this course?',
      message: 'It is hidden from the default catalogue view but kept, along with its mapping and history.',
      confirmLabel: 'Archive course'
    },
    toastArchived: 'Course archived.',
    courseCard: {
      title: 'Course',
      provider: 'Provider',
      externalCourseId: 'External course id',
      deliveryType: 'Delivery type',
      instructor: 'Instructor',
      duration: 'Duration',
      durationHours: '{hours} hours',
      level: 'Level',
      category: 'Category',
      language: 'Language',
      publication: 'Publication',
      courseUrl: 'Course URL'
    },
    crmCard: {
      title: 'CRM mapping and synchronisation',
      mapping: 'Mapping',
      crmProgramme: 'CRM programme',
      notMapped: 'Not mapped',
      programmeReference: 'Programme reference',
      syncStatus: 'Sync status',
      lastSync: 'Last sync',
      never: 'Never',
      lastMessage: 'Last message',
      writesNote: 'A sync writes only {fields} on the CRM Programme. Academic fields are owned by CRM and are never overwritten by the connector.'
    },
    learnersCard: {
      title: 'Learners on this course',
      table: {
        externalEnrolment: 'External enrolment',
        learnerId: 'Learner id',
        crmStudent: 'CRM student',
        status: 'Status',
        progress: 'Progress',
        certificate: 'Certificate'
      },
      notMapped: 'Not mapped',
      empty: 'No learners are recorded against this course.'
    },
    syncHistoryCard: {
      title: 'Synchronisation history for this course',
      empty: 'This course has not been synchronised yet.'
    }
  },
  learningEnrolments: {
    pageTitle: 'Learning Hub',
    cardTitle: 'Learners',
    searchLabel: 'Search',
    searchPlaceholder: 'Learner id, student name, course or external id',
    providerLabel: 'Provider',
    allProviders: 'All providers',
    lmsStatusLabel: 'LMS status',
    mappingLabel: 'Mapping',
    syncLabel: 'Sync',
    activityLabel: 'Activity',
    activityStale: 'No activity for 30 days or more',
    any: 'Any',
    chips: {
      provider: 'Provider',
      lmsStatus: 'LMS status',
      mapping: 'Mapping',
      sync: 'Sync',
      activity: 'Activity',
      search: 'Search'
    },
    emptyTitle: 'No learner records match',
    emptyMessage: 'Try clearing a filter.',
    table: {
      externalEnrolment: 'External enrolment',
      provider: 'Provider',
      course: 'Course',
      crmStudent: 'CRM student',
      status: 'Status',
      progress: 'Progress',
      certificate: 'Certificate',
      mapping: 'Mapping',
      sync: 'Sync',
      lastActivity: 'Last activity'
    },
    unknownCourse: 'Unknown course',
    mappingError: 'Mapping error',
    notMapped: 'Not mapped',
    provenanceNote: 'Progress, scores and certificates are a demonstration dataset in the Catalyst Data Store. Mapping a record to a CRM Student, and pushing its progress onto a CRM Enrolment, are real writes to your live CRM.'
  },
  learningEnrolmentDetail: {
    mapStudentDialog: {
      title: 'Map this learner to a CRM student',
      crmStudentLabel: 'CRM student',
      crmStudentHint: 'Choosing one here is exact and is tried first.',
      matchByIdentifierOption: 'Match by identifier instead',
      truncatedNote: 'Showing the first {loaded} of {total} students. A student beyond this page can still be matched by email below.',
      studentEmailLabel: 'Student email',
      studentEmailHintWithRef: 'The stored reference {reference} is tried first; this email is the fallback.',
      studentEmailHintNoRef: 'Matched on an exact address. If two students share it, the record is marked as a mapping error rather than guessed at.',
      submitButton: 'Map student',
      toastError: 'Mapping could not be completed: {message}',
      toastMapped: 'Learner mapped to a CRM student.'
    },
    linkEnrolmentDialog: {
      title: 'Link to a CRM enrolment',
      crmEnrolmentLabel: 'CRM enrolment',
      crmEnrolmentHint: 'Leave blank to clear the link. Only enrolments belonging to the mapped student are listed.',
      notLinkedOption: 'Not linked',
      noMatchTruncated: 'No match in the first {loaded} of {total} enrolments. This student may have one beyond that page, so it is not safe to assume there is none.',
      noEnrolments: 'This student has no CRM enrolments. Create one from this record instead, if your role allows it.',
      submitButton: 'Save link',
      toastLinked: 'Linked to a CRM enrolment.',
      toastCleared: 'CRM enrolment link cleared.'
    },
    createEnrolmentDialog: {
      title: 'Create the CRM enrolment',
      studentLabel: 'Student',
      programmeLabel: 'Programme',
      programmeFromCourse: 'Taken from the mapped course',
      intakeLabel: 'Intake',
      intakeHint: "Only intakes on the mapped course's programme are listed. An intake from another programme is refused by the server.",
      chooseIntakeOption: 'Choose an intake',
      startsPrefix: 'starts {date}',
      truncatedNote: 'Showing intakes from the first {loaded} of {total} records. An intake beyond that page will not appear here.',
      dedupeNote: 'If a CRM enrolment already exists for this student, programme and intake, it is linked rather than duplicated — so repeating this action cannot create a second enrolment.',
      submitButton: 'Create enrolment',
      toastCreated: 'CRM enrolment created and linked.'
    },
    notFoundTitle: 'Learner record not found',
    allLearnersLink: 'All learners',
    changeStudentButton: 'Change student',
    mapStudentButton: 'Map student',
    changeCrmEnrolmentButton: 'Change CRM enrolment',
    linkCrmEnrolmentButton: 'Link CRM enrolment',
    createCrmEnrolmentButton: 'Create CRM enrolment',
    syncToCrmButton: 'Sync to CRM',
    actionErrorTitle: 'That action could not be completed',
    mappingErrorTitle: 'This record could not be mapped',
    mappingErrorFallback: 'The mapping was attempted and did not resolve to a single CRM student.',
    syncConfirm: {
      title: 'Push this progress to CRM?',
      message: 'The linked CRM Enrolment has its LMS provider, LMS enrolment id, progress percentage, last sync date and sync status overwritten with the values held here.',
      confirmLabel: 'Sync to CRM'
    },
    toastSynced: 'Synced. Fields written: {fields}.',
    recordCard: {
      title: 'Learning record',
      provider: 'Provider',
      externalEnrolmentId: 'External enrolment id',
      externalLearnerId: 'External learner id',
      course: 'Course',
      noCourseMatch: 'No course matches {reference}',
      thisRecordFallback: 'this record',
      status: 'Status',
      progress: 'Progress',
      assessmentScore: 'Assessment score',
      started: 'Started',
      lastActivity: 'Last activity',
      completed: 'Completed',
      certificate: 'Certificate',
      viewLink: 'View'
    },
    crmCard: {
      title: 'CRM mapping and synchronisation',
      mapping: 'Mapping',
      crmStudent: 'CRM student',
      notMapped: 'Not mapped',
      studentReference: 'Student reference',
      crmEnrolment: 'CRM enrolment',
      notLinked: 'Not linked',
      syncStatus: 'Sync status',
      lastSync: 'Last sync',
      never: 'Never',
      lastMessage: 'Last message',
      writesNote: 'A sync writes {fields} on the CRM Enrolment.'
    },
    catalystCard: {
      title: 'Values held in Catalyst rather than CRM',
      note: 'These fields do not exist on the CRM Enrolments module, so a sync cannot write them. They are stored in the Catalyst Data Store and shown from there. Adding them to CRM is a metadata change, deliberately not made automatically by this application.',
      table: {
        module: 'Module',
        suggestedField: 'Suggested field',
        type: 'Type'
      }
    },
    syncHistoryCard: {
      title: 'Synchronisation history for this record',
      empty: 'This record has not been synchronised yet.'
    }
  },
  learningSyncLog: {
    pageTitle: 'Learning Hub',
    pageIntro: 'Every mapping and synchronisation the connector has performed, and who triggered it.',
    cardTitle: 'Synchronisation log',
    entityLabel: 'Entity',
    allEntities: 'All entities',
    resultLabel: 'Result',
    allResults: 'All results',
    resultSucceeded: 'Succeeded',
    resultFailed: 'Failed',
    emptyTitle: 'Nothing logged yet',
    emptyMessage: 'Map or synchronise a record and it will appear here.',
    attributionNote: 'Each entry is attributed to the signed-in user who caused it. Entries are written after the CRM write returns, so a logged success means CRM confirmed the change rather than that a request was sent.'
  }
};
