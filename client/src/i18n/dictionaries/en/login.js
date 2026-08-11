export default {
  login: {
    brandSub: 'Education Management Portal',
    intro: 'Manage students, applications, programmes, intakes and enrolments. Sign in with your Zylker Academy staff account to continue.',
    checkingSession: 'Checking your session…',
    serverRefused: {
      before: 'You are signed in to Catalyst as',
      thisAccount: 'this account',
      after: ', but the application could not verify that session.',
      title: 'Your session could not be verified',
      body: 'The sign-in itself worked. The server rejected the session when the application asked it to identify you, so no data has been loaded.',
      note: 'If this persists, it is a server-side configuration problem rather than anything to do with your account or password.'
    },
    formFailed: {
      title: 'The sign-in form could not be loaded',
      fallbackDetail: 'The sign-in service did not respond.',
      reload: 'Reload the page'
    },
    sdkUnavailable: {
      title: 'Sign-in is unavailable',
      body: 'The Catalyst sign-in service could not be loaded. Check your connection and reload the page.'
    },
    serviceUnavailable: {
      title: 'The service could not be reached',
      fallbackDetail: 'Your sign-in could not be verified because the service did not respond.'
    },
    footer: 'Student, application and finance data is read live from Zoho CRM, Zoho Books and Zoho Desk, and learning data from the Catalyst LMS connector. Access is restricted to authorised staff.'
  }
};
