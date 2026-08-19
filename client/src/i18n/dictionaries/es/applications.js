export default {
  applications: {
    pageTitle: 'Solicitudes',
    cardTitle: 'Todas las solicitudes',
    newApplicationLink: 'Nueva solicitud',
    searchPlaceholder: 'Solicitante, correo electrónico o ID de solicitud',
    stageLabel: 'Etapa',
    allStages: 'Todas las etapas',
    filters: {
      stage: 'Etapa',
      queue: 'Cola',
      awaitingOurAction: 'Pendiente de nuestra acción'
    },
    empty: {
      title: 'Ninguna solicitud coincide',
      message: 'Prueba con otro término de búsqueda o borra el filtro de etapa.'
    },
    showingRecent: 'Mostrando los {total} registros más recientes. Acota la búsqueda para ver los anteriores.',
    table: {
      application: 'Solicitud',
      applicant: 'Solicitante',
      stage: 'Etapa',
      programme: 'Programa',
      intake: 'Convocatoria',
      applied: 'Solicitada',
      fee: 'Tasa'
    },
    board: {
      listView: 'Lista',
      boardView: 'Tablero',
      viewToggleLabel: 'Vista',
      emptyColumn: 'Sin solicitudes',
      moveFailed: 'No se pudo mover la solicitud:',
      dragHint: 'Arrastra una tarjeta para cambiar su etapa.'
    }
  },
  applicationDetail: {
    fallbackTitle: 'Solicitud',
    notFoundTitle: 'Solicitud no encontrada',
    editButton: 'Editar',
    withdrawButton: 'Retirar',
    deleteButton: 'Eliminar',
    actionErrorTitle: 'No se pudo completar esa acción',
    editDialog: {
      title: 'Editar solicitud',
      applicationDateLabel: 'Fecha de solicitud',
      closingDateLabel: 'Fecha prevista de decisión',
      tuitionFeeLabel: 'Tasa de matrícula',
      studyModeLabel: 'Modalidad de estudio preferida',
      documentsStatusLabel: 'Estado de los documentos',
      note: 'La etapa se cambia en el panel de flujo de trabajo, no aquí, de modo que una transición siempre pasa por las reglas que valida el servidor.',
      submitLabel: 'Guardar cambios',
      updatedToast: 'Solicitud actualizada.'
    },
    withdrawConfirm: {
      title: '¿Retirar esta solicitud?',
      message: 'La etapa se establecerá en Retirada en Zoho CRM. El registro se conserva.',
      confirmLabel: 'Retirar solicitud',
      toast: 'Solicitud retirada.'
    },
    deleteConfirm: {
      title: '¿Eliminar esta solicitud de forma permanente?',
      message: 'Esta acción no se puede deshacer. La eliminación se rechaza mientras exista una matrícula relacionada.',
      confirmLabel: 'Eliminar de forma permanente',
      toast: 'Solicitud eliminada.'
    },
    detailsCard: {
      title: 'Detalles de la solicitud',
      applicationId: 'ID de solicitud',
      pipeline: 'Proceso',
      applied: 'Solicitada',
      expectedDecision: 'Decisión prevista',
      decisionRecorded: 'Decisión registrada',
      tuitionFee: 'Tasa de matrícula',
      studyMode: 'Modalidad de estudio',
      documents: 'Documentos',
      lastModified: 'Última modificación'
    },
    relatedCard: {
      title: 'Registros relacionados',
      student: 'Estudiante',
      notLinked: 'Sin vincular',
      programme: 'Programa',
      intake: 'Convocatoria',
      enrolment: 'Matrícula',
      noneYet: 'Todavía ninguna'
    },
    activityCard: {
      title: 'Actividad'
    }
  },
  newApplication: {
    pageTitle: 'Nueva solicitud',
    pageIntro: 'Crea una solicitud en Zoho CRM en la etapa Enviada.',
    applicantSourceLabel: 'Origen del solicitante',
    applicantLegend: 'Solicitante',
    existingStudent: 'Estudiante existente',
    newStudent: 'Nuevo estudiante',
    studentLabel: 'Estudiante',
    studentPlaceholder: 'Elige un estudiante…',
    unnamedStudent: 'Sin nombre',
    studentRequiredError: 'Elige un estudiante.',
    firstNameLabel: 'Nombre',
    lastNameLabel: 'Apellidos',
    lastNameRequiredError: 'Los apellidos son obligatorios.',
    emailLabel: 'Correo electrónico',
    emailRequiredError: 'Se requiere un correo electrónico para resolver o crear el estudiante.',
    emailInvalidError: 'Introduce una dirección de correo electrónico válida.',
    emailHint: 'Si ya existe un estudiante con este correo electrónico, se reutiliza ese registro en lugar de duplicarlo.',
    programmeIntakeLegend: 'Programa y convocatoria',
    programmeLabel: 'Programa',
    programmePlaceholder: 'Elige un programa…',
    programmeRequiredError: 'Elige un programa.',
    intakeLabel: 'Convocatoria',
    intakeHintChooseProgramme: 'Elige antes un programa.',
    intakeHintFiltered: 'Solo se listan las convocatorias que pertenecen al programa elegido.',
    intakeNoneYet: 'Todavía sin convocatoria',
    intakeFullSuffix: ' — completa',
    intakePlacesLeftSuffix: ' — {count} plazas disponibles',
    detailsLegend: 'Detalles',
    applicationDateLabel: 'Fecha de solicitud',
    applicationDateHint: 'De forma predeterminada, hoy.',
    closingDateLabel: 'Fecha prevista de decisión',
    tuitionFeeLabel: 'Tasa de matrícula',
    studyModeLabel: 'Modalidad de estudio preferida',
    submitLabel: 'Crear solicitud',
    createdToast: 'Solicitud creada.',
    loadingLabel: 'Cargando datos del formulario'
  }
};
