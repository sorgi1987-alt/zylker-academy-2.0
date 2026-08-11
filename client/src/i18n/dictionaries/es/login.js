export default {
  login: {
    brandSub: 'Portal de gestión educativa',
    intro: 'Gestiona estudiantes, solicitudes, programas, convocatorias y matrículas. Inicia sesión con tu cuenta de personal de Zylker Academy para continuar.',
    checkingSession: 'Comprobando tu sesión…',
    serverRefused: {
      before: 'Has iniciado sesión en Catalyst como',
      thisAccount: 'esta cuenta',
      after: ', pero la aplicación no pudo verificar esa sesión.',
      title: 'Tu sesión no se pudo verificar',
      body: 'El inicio de sesión en sí funcionó. El servidor rechazó la sesión cuando la aplicación le pidió identificarte, por lo que no se ha cargado ningún dato.',
      note: 'Si esto persiste, es un problema de configuración del servidor y no algo relacionado con tu cuenta o tu contraseña.'
    },
    formFailed: {
      title: 'El formulario de inicio de sesión no se pudo cargar',
      fallbackDetail: 'El servicio de inicio de sesión no respondió.',
      reload: 'Recargar la página'
    },
    sdkUnavailable: {
      title: 'El inicio de sesión no está disponible',
      body: 'El servicio de inicio de sesión de Catalyst no se pudo cargar. Comprueba tu conexión y recarga la página.'
    },
    serviceUnavailable: {
      title: 'No se pudo contactar con el servicio',
      fallbackDetail: 'Tu inicio de sesión no se pudo verificar porque el servicio no respondió.'
    },
    footer: 'Los datos de estudiantes, solicitudes y finanzas se leen en tiempo real desde Zoho CRM, Zoho Books y Zoho Desk, y los datos de aprendizaje desde el conector LMS de Catalyst. El acceso está restringido al personal autorizado.'
  }
};
