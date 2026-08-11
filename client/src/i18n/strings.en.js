/**
 * Combines every namespace dictionary into one lookup object. Each imported
 * file owns disjoint top-level keys (see dictionaries/en/*.js), so this is a
 * flat merge — the import list is fixed once here; individual dictionary
 * files are edited afterwards without ever touching this file again, which
 * is what lets separate translation batches proceed without editing the same
 * file as one another.
 */
import common from './dictionaries/en/common.js';
import shell from './dictionaries/en/shell.js';
import login from './dictionaries/en/login.js';
import dashboardIntegration from './dictionaries/en/dashboardIntegration.js';
import students from './dictionaries/en/students.js';
import applications from './dictionaries/en/applications.js';
import enrolments from './dictionaries/en/enrolments.js';
import programmesIntakes from './dictionaries/en/programmesIntakes.js';
import learningHub from './dictionaries/en/learningHub.js';
import financeSupport from './dictionaries/en/financeSupport.js';

export default {
  ...common,
  ...shell,
  ...login,
  ...dashboardIntegration,
  ...students,
  ...applications,
  ...enrolments,
  ...programmesIntakes,
  ...learningHub,
  ...financeSupport
};
