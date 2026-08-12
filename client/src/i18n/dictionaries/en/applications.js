export default {
  applications: {
    pageTitle: 'Applications',
    pageIntro: 'Admissions applications held in Zoho CRM, with their current stage.',
    cardTitle: 'All applications',
    newApplicationLink: 'New application',
    searchPlaceholder: 'Applicant, email or application ID',
    stageLabel: 'Stage',
    allStages: 'All stages',
    filters: {
      stage: 'Stage',
      queue: 'Queue',
      awaitingOurAction: 'Awaiting our action'
    },
    empty: {
      title: 'No applications match',
      message: 'Try a different search term or clear the stage filter.'
    },
    table: {
      application: 'Application',
      applicant: 'Applicant',
      stage: 'Stage',
      programme: 'Programme',
      intake: 'Intake',
      applied: 'Applied',
      fee: 'Fee'
    },
    board: {
      listView: 'List',
      boardView: 'Board',
      viewToggleLabel: 'View',
      emptyColumn: 'No applications',
      moveFailed: 'Could not move the application:',
      dragHint: 'Drag a card to change its stage.'
    }
  },
  applicationDetail: {
    fallbackTitle: 'Application',
    notFoundTitle: 'Application not found',
    editButton: 'Edit',
    withdrawButton: 'Withdraw',
    deleteButton: 'Delete',
    actionErrorTitle: 'That action could not be completed',
    editDialog: {
      title: 'Edit application',
      applicationDateLabel: 'Application date',
      closingDateLabel: 'Expected decision date',
      tuitionFeeLabel: 'Tuition fee',
      studyModeLabel: 'Preferred study mode',
      documentsStatusLabel: 'Documents status',
      note: 'The stage is changed in the workflow panel, not here, so a transition always goes through the rules the server validates.',
      submitLabel: 'Save changes',
      updatedToast: 'Application updated.'
    },
    withdrawConfirm: {
      title: 'Withdraw this application?',
      message: 'The stage will be set to Withdrawn in Zoho CRM. The record is kept.',
      confirmLabel: 'Withdraw application',
      toast: 'Application withdrawn.'
    },
    deleteConfirm: {
      title: 'Delete this application permanently?',
      message: 'This cannot be undone. Deletion is refused while a related enrolment exists.',
      confirmLabel: 'Delete permanently',
      toast: 'Application deleted.'
    },
    detailsCard: {
      title: 'Application details',
      applicationId: 'Application ID',
      pipeline: 'Pipeline',
      applied: 'Applied',
      expectedDecision: 'Expected decision',
      decisionRecorded: 'Decision recorded',
      tuitionFee: 'Tuition fee',
      studyMode: 'Study mode',
      documents: 'Documents',
      lastModified: 'Last modified'
    },
    relatedCard: {
      title: 'Related records',
      student: 'Student',
      notLinked: 'Not linked',
      programme: 'Programme',
      intake: 'Intake',
      enrolment: 'Enrolment',
      noneYet: 'None yet'
    },
    activityCard: {
      title: 'Activity'
    }
  },
  newApplication: {
    pageTitle: 'New application',
    pageIntro: 'Creates an application in Zoho CRM at the Submitted stage.',
    applicantSourceLabel: 'Applicant source',
    applicantLegend: 'Applicant',
    existingStudent: 'Existing student',
    newStudent: 'New student',
    studentLabel: 'Student',
    studentPlaceholder: 'Choose a student…',
    unnamedStudent: 'Unnamed',
    studentRequiredError: 'Choose a student.',
    firstNameLabel: 'First name',
    lastNameLabel: 'Last name',
    lastNameRequiredError: 'A last name is required.',
    emailLabel: 'Email',
    emailRequiredError: 'An email is required to resolve or create the student.',
    emailInvalidError: 'Enter a valid email address.',
    emailHint: 'If a student already exists with this email, that record is reused rather than duplicated.',
    programmeIntakeLegend: 'Programme and intake',
    programmeLabel: 'Programme',
    programmePlaceholder: 'Choose a programme…',
    programmeRequiredError: 'Choose a programme.',
    intakeLabel: 'Intake',
    intakeHintChooseProgramme: 'Choose a programme first.',
    intakeHintFiltered: 'Only intakes belonging to the chosen programme are listed.',
    intakeNoneYet: 'No intake yet',
    intakeFullSuffix: ' — full',
    intakePlacesLeftSuffix: ' — {count} places left',
    detailsLegend: 'Details',
    applicationDateLabel: 'Application date',
    applicationDateHint: 'Defaults to today.',
    closingDateLabel: 'Expected decision date',
    tuitionFeeLabel: 'Tuition fee',
    studyModeLabel: 'Preferred study mode',
    submitLabel: 'Create application',
    createdToast: 'Application created.',
    loadingLabel: 'Loading form data'
  }
};
