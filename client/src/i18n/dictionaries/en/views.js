/**
 * Custom views (ViewManager.jsx) — saved filter/column/sort combinations for
 * the Students, Applications and Programmes list pages.
 */
export default {
  views: {
    viewLabel: 'View',
    allRecords: 'All records',
    defaultTag: 'default',
    filterButton: 'Filter',
    setDefault: 'Set as default',
    unsetDefault: 'Unset as default',
    deleteView: 'Delete view',
    deleteConfirmTitle: 'Delete this view?',
    deleteConfirmMessage: 'This only removes the saved view on this device. It does not change or delete any records.',
    newViewTitle: 'New view',
    editViewTitle: 'Edit view',
    nameLabel: 'View name',
    nameRequired: 'Give this view a name.',
    filtersHeading: 'Filters',
    noConditions: 'No filters yet — this view shows every record.',
    addCondition: 'Add filter',
    removeCondition: 'Remove this filter',
    conditionField: 'Field',
    conditionOperator: 'Condition',
    conditionValue: 'Value',
    columnsHeading: 'Columns',
    alwaysShown: 'always shown',
    sortHeading: 'Sort',
    noSort: 'No sort applied',
    sortAsc: 'Ascending',
    sortDesc: 'Descending',
    saveView: 'Save view',
    saveAsNewView: 'Save as new view',
    booleanTrue: 'Yes',
    booleanFalse: 'No',
    operators: {
      equals: 'is',
      not_equals: 'is not',
      contains: 'contains',
      not_contains: 'does not contain',
      is_empty: 'is empty',
      is_not_empty: 'is not empty',
      gt: 'is greater than',
      gte: 'is at least',
      lt: 'is less than',
      lte: 'is at most',
      before: 'is before',
      after: 'is after'
    },
    fields: {
      student: {
        fullName: 'Name',
        studentId: 'Student ID',
        email: 'Email',
        status: 'Status',
        programme: 'Programme',
        enrolmentStatus: 'Enrolment status',
        externalReference: 'External reference',
        added: 'Added'
      },
      application: {
        name: 'Application',
        applicantName: 'Applicant name',
        applicantEmail: 'Applicant email',
        stage: 'Stage',
        programme: 'Programme',
        intake: 'Intake',
        applicationDate: 'Applied',
        expectedDecisionDate: 'Expected decision',
        tuitionFee: 'Fee'
      },
      programme: {
        name: 'Programme',
        code: 'Code',
        academicLevel: 'Level',
        status: 'Status',
        active: 'Active',
        department: 'Department',
        tuitionFee: 'Fee',
        intakeCount: 'Intakes',
        enrolmentCount: 'Enrolments',
        applicationCount: 'Applications'
      },
      intake: {
        name: 'Intake',
        programme: 'Programme',
        status: 'Status',
        academicYear: 'Academic year',
        startDate: 'Starts',
        endDate: 'Ends',
        applicationOpenDate: 'Applications open',
        applicationDeadline: 'Application deadline',
        capacity: 'Capacity',
        deliveryMode: 'Delivery mode',
        location: 'Location',
        applicationCount: 'Applications',
        enrolmentCount: 'Enrolments'
      },
      enrolment: {
        reference: 'Enrolment',
        student: 'Student',
        programme: 'Programme',
        intake: 'Intake',
        status: 'Status',
        enrolled: 'Enrolled',
        progress: 'Progress',
        lmsSync: 'LMS sync status',
        externalReference: 'External reference'
      }
    }
  }
};
