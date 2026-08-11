export default {
  students: {
    pageTitle: 'Estudiantes',
    pageIntro: 'Registros de estudiantes almacenados en Zoho CRM, con su solicitud y matrícula actuales.',
    allStudents: 'Todos los estudiantes',
    addStudent: 'Añadir estudiante',
    searchLabel: 'Buscar',
    searchPlaceholder: 'Nombre, correo electrónico o ID de estudiante',
    statusLabel: 'Estado',
    allStatuses: 'Todos los estados',
    empty: {
      title: 'Ningún estudiante coincide',
      filtered: 'Prueba con otro término de búsqueda o borra los filtros.',
      default: 'CRM no devolvió ningún registro de estudiante.'
    },
    table: {
      name: 'Nombre',
      studentId: 'ID de estudiante',
      email: 'Correo electrónico',
      status: 'Estado',
      programme: 'Programa',
      enrolment: 'Matrícula',
      added: 'Añadido'
    },
    unnamed: 'Sin nombre',
    showingRecent: 'Mostrando los {total} registros más recientes. Acota la búsqueda para ver los anteriores.'
  },
  student360: {
    notFound: 'Estudiante no encontrado',
    unnamedStudent: 'Estudiante sin nombre',
    linkCopied: 'Enlace copiado.',
    linkCopyFailed: 'No se pudo copiar. Usa la barra de direcciones.',
    edit: 'Editar',
    archiveAction: 'Archivar',
    newApplication: 'Nueva solicitud',
    newEnrolment: 'Nueva matrícula',
    addNote: 'Añadir nota',
    copyLink: 'Copiar enlace',
    openInCrm: 'Abrir en Zoho CRM',
    deleteAction: 'Eliminar',
    actionFailedTitle: 'Esa acción no se pudo completar',
    tabsLabel: 'Secciones del registro del estudiante',
    tabs: {
      overview: 'Resumen',
      applications: 'Solicitudes',
      enrolments: 'Matrículas',
      learning: 'Aprendizaje',
      finance: 'Finanzas',
      support: 'Soporte',
      activity: 'Actividad'
    },
    archive: {
      title: '¿Archivar este estudiante?',
      message: 'El estudiante se marcará como Retirado en Zoho CRM. Sus solicitudes y matrículas se conservan.',
      confirmLabel: 'Archivar estudiante',
      toast: 'Estudiante archivado.'
    },
    delete: {
      title: '¿Eliminar este estudiante permanentemente?',
      message: 'Esta acción no se puede deshacer. La eliminación se rechaza si alguna solicitud o matrícula todavía apunta a este estudiante.',
      confirmLabel: 'Eliminar permanentemente',
      toast: 'Estudiante eliminado.'
    },
    overview: {
      identity: 'Identidad',
      fullName: 'Nombre completo',
      email: 'Correo electrónico',
      studentId: 'ID de estudiante',
      status: 'Estado',
      externalReference: 'Referencia externa',
      added: 'Añadido',
      lastModified: 'Última modificación',
      whereTheyAre: 'Dónde se encuentran',
      currentProgramme: 'Programa actual',
      appliedFor: '(solicitado)',
      none: 'Ninguno',
      currentIntake: 'Convocatoria actual',
      latestApplication: 'Última solicitud',
      activeEnrolment: 'Matrícula activa',
      learningProgress: 'Progreso de aprendizaje',
      averageProgress: 'Progreso medio',
      records: 'Registros',
      completed: 'Completados',
      seeLearningRecords: 'Ver registros de aprendizaje',
      noLearningRecords: 'No hay registros de aprendizaje externos asociados a este estudiante, por lo que no se puede mostrar ningún progreso aquí.',
      finance: 'Finanzas',
      outstandingBalance: 'Saldo pendiente',
      invoices: 'Facturas',
      seeInvoices: 'Ver facturas',
      noBooksCustomer: 'Ningún cliente de Zoho Books está asociado a este estudiante, por lo que no se puede mostrar ningún saldo.',
      support: 'Soporte',
      openTickets: 'Tickets abiertos',
      tickets: 'Tickets',
      seeTickets: 'Ver tickets',
      noDeskContact: 'Ningún contacto de Zoho Desk está asociado a este estudiante, por lo que no se pueden mostrar tickets.',
      recentActivity: 'Actividad reciente',
      allActivity: 'Toda la actividad'
    },
    applications: {
      title: 'Solicitudes',
      table: {
        application: 'Solicitud',
        stage: 'Etapa',
        programme: 'Programa',
        intake: 'Convocatoria',
        applied: 'Solicitada'
      },
      empty: 'Este estudiante no tiene solicitudes.'
    },
    enrolments: {
      title: 'Matrículas',
      table: {
        enrolment: 'Matrícula',
        status: 'Estado',
        programme: 'Programa',
        intake: 'Convocatoria',
        enrolled: 'Matriculado',
        progress: 'Progreso'
      },
      empty: 'Este estudiante no tiene matrículas.',
      programmesTitle: 'Programas',
      noProgrammes: 'Ningún programa está asociado a este estudiante.'
    },
    learning: {
      title: 'Aprendizaje',
      learningHub: 'Centro de aprendizaje',
      table: {
        course: 'Curso',
        provider: 'Proveedor',
        status: 'Estado',
        progress: 'Progreso',
        score: 'Puntuación',
        certificate: 'Certificado',
        lastActivity: 'Última actividad'
      },
      viewCertificate: 'Ver',
      noRecords: 'No hay registros de aprendizaje externos asociados a este estudiante. Un registro existe en el conector solo una vez que se ha asociado a este contacto del CRM.',
      identifiersTitle: 'Identificadores de la plataforma de aprendizaje',
      provider: 'Proveedor',
      lmsUserId: 'ID de usuario en el LMS',
      notLinked: 'No asociado',
      lastSync: 'Última sincronización',
      identifiersNote: 'Estos tres campos residen en el Contacto del CRM y se establecen manualmente. Los registros de aprendizaje anteriores proceden del conector LMS externo y son una fuente independiente: ambos pueden no coincidir.'
    },
    activity: {
      title: 'Actividad'
    },
    invoices: {
      title: 'Facturas',
      noAccess: 'Tu rol no incluye acceso a los datos financieros.',
      ambiguousTitle: 'La asociación con Zoho Books es ambigua',
      ambiguousNote: 'No se muestran facturas hasta que se asocie un cliente, para que a este estudiante nunca se le muestren las finanzas de otro cliente.',
      noCustomerLinked: 'Ningún cliente de Zoho Books está asociado a este estudiante.',
      matchedOnField: 'ID de cliente de Books almacenado ({field})',
      matchedOnEmail: 'coincidencia exacta de correo electrónico',
      linkedBefore: 'Asociado al cliente de Zoho Books',
      linkedAfter: 'por {matchedOn}. Los cambios contables se realizan en Zoho Books.',
      outstandingBalance: 'Saldo pendiente',
      table: {
        invoice: 'Factura',
        date: 'Fecha',
        due: 'Vencimiento',
        status: 'Estado',
        total: 'Total',
        balance: 'Saldo'
      },
      noInvoices: 'Este cliente no tiene facturas.',
      moreNote: 'Aquí solo se muestran las facturas más recientes.',
      seeAllFinance: 'Ver todas en Finanzas'
    },
    tickets: {
      title: 'Tickets',
      noAccess: 'Tu rol no incluye acceso a los datos de soporte.',
      ambiguousTitle: 'La asociación con Zoho Desk es ambigua',
      ambiguousNote: 'No se muestran tickets hasta que se asocie un contacto, para que a este estudiante nunca se le muestre el historial de soporte de otro contacto.',
      noContactLinked: 'Ningún contacto de Zoho Desk está asociado a este estudiante.',
      matchedOnField: 'ID de contacto de Desk almacenado ({field})',
      matchedOnEmail: 'coincidencia exacta de correo electrónico',
      linkedBefore: 'Asociado al contacto de Zoho Desk',
      linkedAfter: 'por {matchedOn}. Los tickets se responden y se cierran en Zoho Desk.',
      openTickets: 'Tickets abiertos',
      table: {
        ticket: 'Ticket',
        subject: 'Asunto',
        status: 'Estado',
        created: 'Creado',
        due: 'Vencimiento'
      },
      overdue: 'Vencido',
      noTickets: 'Este contacto no tiene tickets.',
      moreNote: 'Aquí solo se muestran los tickets más recientes.',
      seeAllSupport: 'Ver todos en Soporte'
    }
  },
  studentForm: {
    editTitle: 'Editar estudiante',
    addTitle: 'Añadir estudiante',
    editIntro: 'Los cambios se escriben en el registro de contacto asociado en Zoho CRM.',
    addIntro: 'Crea un registro de contacto en Zoho CRM. Las direcciones de correo electrónico deben ser únicas.',
    firstName: 'Nombre',
    lastName: 'Apellidos',
    email: 'Correo electrónico',
    emailHint: 'Se usa para detectar estudiantes duplicados y para hacer coincidir facturas de Zoho Books.',
    status: 'Estado',
    lastNameRequired: 'Los apellidos son obligatorios.',
    emailInvalid: 'Introduce una dirección de correo electrónico válida.',
    saveChanges: 'Guardar cambios',
    createStudent: 'Crear estudiante',
    loadingStudent: 'Cargando estudiante',
    toastUpdated: 'Estudiante actualizado.',
    toastCreated: 'Estudiante creado.'
  }
};
