// Filled in by the Enrolments / EnrolmentDetail / NewEnrolment translation batch.
export default {
  enrolments: {
    pageTitle: 'Matrículas',
    allEnrolments: 'Todas las matrículas',
    newEnrolment: 'Nueva matrícula',
    searchPlaceholder: 'Nombre del estudiante, correo electrónico o referencia',
    status: 'Estado',
    lmsMapping: 'Asociación con el LMS',
    mappedOptions: {
      no: 'No asociada al LMS',
      yes: 'Asociada al LMS'
    },
    any: 'Cualquiera',
    allStatuses: 'Todos los estados',
    lastSync: 'Última sincronización',
    noMatch: 'Ninguna matrícula coincide',
    showingRecent: 'Mostrando los {total} registros más recientes. Acota la búsqueda para ver los anteriores.',
    table: {
      reference: 'Referencia',
      student: 'Estudiante',
      programme: 'Programa',
      intake: 'Convocatoria',
      status: 'Estado',
      enrolled: 'Matriculado',
      progress: 'Progreso',
      lmsSync: 'Sincronización con el LMS'
    },
    syncNote: 'El progreso y el estado de sincronización son los valores que el conector LMS externo escribió por última vez en cada matrícula del CRM. Abre el Centro de aprendizaje para ver la posición actual del conector, que puede ser más reciente.'
  },
  enrolmentDetail: {
    editDialog: {
      title: 'Editar matrícula',
      financeStatus: 'Estado financiero',
      startDate: 'Fecha de inicio',
      completionDate: 'Fecha de finalización',
      certificateIssued: 'Certificado emitido',
      note: 'El progreso y los identificadores del LMS no se pueden editar aquí. Los escribe en este registro el conector LMS externo, y un valor introducido manualmente sería sobrescrito por la siguiente sincronización.',
      saveChanges: 'Guardar cambios',
      updated: 'Matrícula actualizada.'
    },
    finance: {
      cardTitle: 'Finanzas',
      booksUnreachable: 'No se pudo contactar con Zoho Books.',
      ambiguousNote: 'No se muestra ninguna factura mientras el vínculo con Zoho Books sea ambiguo, de modo que a este estudiante nunca se le muestran las finanzas de otro cliente.',
      noCustomerLinked: 'Ningún cliente de Zoho Books está vinculado a este estudiante.',
      disagreeTitle: 'El CRM y Zoho Books no coinciden',
      disagreeMessageOne: 'El estado financiero de la matrícula en el CRM indica «{financeStatus}», pero Zoho Books tiene 1 factura para este estudiante{paidNote}. Ese campo del CRM se mantiene manualmente y nada lo actualiza desde Books — edita la matrícula para ponerlo al día.',
      disagreeMessageOther: 'El estado financiero de la matrícula en el CRM indica «{financeStatus}», pero Zoho Books tiene {count} facturas para este estudiante{paidNote}. Ese campo del CRM se mantiene manualmente y nada lo actualiza desde Books — edita la matrícula para ponerlo al día.',
      paidNote: ', {count} de ellas pagadas',
      outstandingBalance: 'Saldo pendiente',
      invoices: 'Facturas',
      outstandingCount: '({count} pendientes)',
      table: {
        invoice: 'Factura',
        date: 'Fecha',
        status: 'Estado',
        total: 'Total',
        balance: 'Saldo'
      },
      noInvoices: 'Este cliente no tiene facturas en Zoho Books.',
      note: 'Las facturas en Zoho Books pertenecen a un cliente, no a una matrícula individual, por lo que estas son todas las facturas de este estudiante.'
    },
    notFound: 'Matrícula no encontrada',
    fallbackTitle: 'Matrícula',
    edit: 'Editar',
    complete: 'Completar',
    cancelEnrolment: 'Cancelar matrícula',
    reactivate: 'Reactivar',
    addNote: 'Añadir nota',
    invoicesLink: 'Facturas',
    delete: 'Eliminar',
    actionFailedTitle: 'No se pudo completar esa acción',
    confirm: {
      completeTitle: '¿Marcar esta matrícula como completada?',
      completeMessage: 'El estado pasará a Completada y se registrará una fecha de finalización. Si esta es la única matrícula activa del estudiante, pasará a ser antiguo alumno.',
      completeConfirmLabel: 'Completar matrícula',
      completedToast: 'Matrícula completada.',
      cancelTitle: '¿Cancelar esta matrícula?',
      cancelMessage: 'El estado pasará a Cancelada en Zoho CRM. El registro se conserva y su plaza queda liberada.',
      cancelConfirmLabel: 'Cancelar matrícula',
      cancelledToast: 'Matrícula cancelada.',
      reactivateTitle: '¿Reactivar esta matrícula?',
      reactivateMessage: 'El estado volverá a Activa en Zoho CRM. Esto vuelve a ocupar una plaza en la convocatoria.',
      reactivateConfirmLabel: 'Reactivar',
      reactivatedToast: 'Matrícula reactivada.',
      deleteTitle: '¿Eliminar esta matrícula permanentemente?',
      deleteMessage: 'Esto no se puede deshacer. Considera cancelarla en su lugar, lo que conserva el registro.',
      deleteConfirmLabel: 'Eliminar permanentemente',
      deletedToast: 'Matrícula eliminada.'
    },
    details: {
      cardTitle: 'Datos de la matrícula',
      reference: 'Referencia',
      status: 'Estado',
      enrolled: 'Matriculado',
      startDate: 'Fecha de inicio',
      completionDate: 'Fecha de finalización',
      financeStatus: 'Estado financiero',
      financeStatusHint: 'Establecido manualmente en el CRM — no proviene de Zoho Books.',
      certificateIssued: 'Certificado emitido',
      yes: 'Sí',
      no: 'No',
      lastModified: 'Última modificación'
    },
    related: {
      cardTitle: 'Registros relacionados',
      student: 'Estudiante',
      programme: 'Programa',
      intake: 'Convocatoria',
      application: 'Solicitud',
      notLinked: 'No vinculado'
    },
    lms: {
      cardTitle: 'LMS externo',
      learningHub: 'Centro de aprendizaje',
      mappedCourse: 'Curso asociado',
      noCourseMappedToProgramme: 'Ningún curso del LMS está asociado a este programa',
      noCourseMappedGeneric: 'Ningún curso del LMS está asociado a un programa para esta matrícula',
      table: {
        externalEnrolment: 'Matrícula externa',
        course: 'Curso',
        status: 'Estado',
        progress: 'Progreso',
        certificate: 'Certificado',
        sync: 'Sincronización',
        lastSync: 'Última sincronización'
      },
      never: 'Nunca',
      noRecordLinked: 'Ningún registro de aprendizaje externo está vinculado a esta matrícula. Vincula uno desde el Centro de aprendizaje, donde el registro también se puede asociar primero al estudiante.',
      valuesHeldTitle: 'Valores que contiene este registro del CRM',
      lmsEnrolmentId: 'Id. de matrícula del LMS',
      progress: 'Progreso',
      syncStatus: 'Estado de sincronización',
      lastSync: 'Última sincronización',
      note: 'Los campos del CRM anteriores son los que el conector escribió aquí por última vez. Si difieren de la tabla, esta matrícula no se ha sincronizado desde que cambió el registro del LMS — ambos se muestran por separado en lugar de combinados, para que la discrepancia sea visible.'
    },
    activityCardTitle: 'Actividad'
  },
  newEnrolment: {
    pageTitle: 'Nueva matrícula',
    pageIntro: 'Crea una matrícula en Zoho CRM y establece al estudiante como Activo.',
    student: 'Estudiante',
    chooseStudent: 'Elige un estudiante…',
    unnamed: 'Sin nombre',
    programme: 'Programa',
    chooseProgramme: 'Elige un programa…',
    intake: 'Convocatoria',
    chooseIntake: 'Elige una convocatoria…',
    intakeHintFiltered: 'Solo se muestran las convocatorias del programa elegido.',
    intakeHintNoProgramme: 'Elige primero un programa.',
    full: 'completa',
    placesLeft: '{count} plazas disponibles',
    enrolmentDate: 'Fecha de matriculación',
    enrolmentDateHint: 'De forma predeterminada, hoy.',
    startDate: 'Fecha de inicio',
    errors: {
      chooseStudent: 'Elige un estudiante.',
      chooseProgramme: 'Elige un programa.',
      chooseIntake: 'Elige una convocatoria.'
    },
    fullIntake: {
      title: 'Esta convocatoria está completa',
      placesTaken: '{used} de {capacity} plazas ocupadas.',
      overrideLabel: 'Confirmo que esta matrícula debe superar la capacidad de la convocatoria.',
      cannotOverride: 'Tu rol no puede saltarse un límite de capacidad. Consulta a un administrador, o aumenta la capacidad de la convocatoria.'
    },
    createEnrolment: 'Crear matrícula',
    createdToast: 'Matrícula creada.',
    loadingForm: 'Cargando datos del formulario'
  }
};
