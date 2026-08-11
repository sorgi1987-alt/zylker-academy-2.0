export default {
  learningCourses: {
    pageTitle: 'Centro de aprendizaje',
    pageIntro: 'Cursos del conector LMS externo y el Programa de CRM al que está asociado cada uno.',
    cardTitle: 'Cursos externos',
    syncAllButton: 'Sincronizar todos los cursos asociados',
    actionErrorTitle: 'Esa acción no se pudo completar',
    searchLabel: 'Buscar',
    searchPlaceholder: 'Nombre del curso, id externo, instructor/a o categoría',
    providerLabel: 'Proveedor',
    allProviders: 'Todos los proveedores',
    mappingLabel: 'Asociación',
    syncLabel: 'Sincronización',
    any: 'Cualquiera',
    emptyTitle: 'Ningún curso coincide',
    emptyMessage: 'Prueba a quitar un filtro.',
    table: {
      course: 'Curso',
      provider: 'Proveedor',
      externalId: 'Id externo',
      delivery: 'Modalidad',
      crmProgramme: 'Programa del CRM',
      mapping: 'Asociación',
      sync: 'Sincronización',
      lastSync: 'Última sincronización'
    },
    archived: 'Archivado',
    notMapped: 'Sin asociar',
    never: 'Nunca',
    provenanceNote: 'Los nombres de proveedor son etiquetas de origen en filas del almacén de datos de Catalyst. No se realiza ninguna solicitud a Moodle, Canvas, TrainerCentral ni a ningún host SCORM. La asociación con el CRM y su envío son escrituras autenticadas reales.',
    confirmBulk: {
      title: '¿Sincronizar todos los cursos asociados?',
      message: 'Cada curso asociado envía su proveedor, id de curso externo y URL del curso al Programa del CRM correspondiente. Los cursos sin asociar se omiten. Cada curso se intenta de forma independiente, por lo que un fallo no detiene el resto.',
      confirmLabel: 'Sincronizar todos los asociados'
    },
    bulkSyncResult: 'Sincronización masiva finalizada: {succeeded} de {attempted} sincronizados',
    bulkSyncFailedSuffix: ', {failed} fallidos',
    bulkSyncSkippedSuffix: ', {skipped} omitidos por no estar asociados'
  },
  learningCourseDetail: {
    mapDialog: {
      title: 'Asociar a un programa del CRM',
      programmeLabel: 'Programa del CRM',
      programmeHint: 'Déjalo en blanco para quitar la asociación. Volver a asociar restablece el estado de sincronización a Pending, porque un envío anterior ya no describe este curso.',
      notMappedOption: 'Sin asociar',
      truncatedNote: 'Mostrando los primeros {loaded} de {total} programas. Si el que buscas no aparece, está más allá de esta página y no ausente.',
      listError: 'No se pudo cargar la lista de programas del CRM, por lo que ahora mismo no se puede elegir ninguna asociación.',
      saveButton: 'Guardar asociación',
      toastMapped: 'Curso asociado a un programa del CRM.',
      toastCleared: 'Asociación eliminada.'
    },
    notFoundTitle: 'Curso no encontrado',
    allCoursesLink: 'Todos los cursos',
    changeMappingButton: 'Cambiar asociación',
    mapToProgrammeButton: 'Asociar a un programa',
    syncToCrmButton: 'Sincronizar con el CRM',
    archiveButton: 'Archivar',
    archived: 'Archivado',
    actionErrorTitle: 'Esa acción no se pudo completar',
    syncConfirm: {
      title: '¿Enviar este curso al CRM?',
      message: 'El proveedor de LMS, el id de curso externo y la URL del curso del Programa del CRM se sobrescriben con los valores de este curso. El nombre del programa, la cuota, el estado y el resto de campos académicos no se modifican.',
      confirmLabel: 'Sincronizar con el CRM'
    },
    toastSynced: 'Sincronizado. Campos escritos: {fields}.',
    archiveConfirm: {
      title: '¿Archivar este curso?',
      message: 'Se oculta de la vista predeterminada del catálogo, pero se conserva junto con su asociación e historial.',
      confirmLabel: 'Archivar curso'
    },
    toastArchived: 'Curso archivado.',
    courseCard: {
      title: 'Curso',
      provider: 'Proveedor',
      externalCourseId: 'Id de curso externo',
      deliveryType: 'Modalidad',
      instructor: 'Instructor/a',
      duration: 'Duración',
      durationHours: '{hours} horas',
      level: 'Nivel',
      category: 'Categoría',
      language: 'Idioma',
      publication: 'Publicación',
      courseUrl: 'URL del curso'
    },
    crmCard: {
      title: 'Asociación y sincronización con el CRM',
      mapping: 'Asociación',
      crmProgramme: 'Programa del CRM',
      notMapped: 'Sin asociar',
      programmeReference: 'Referencia del programa',
      syncStatus: 'Estado de sincronización',
      lastSync: 'Última sincronización',
      never: 'Nunca',
      lastMessage: 'Último mensaje',
      writesNote: 'Una sincronización solo escribe {fields} en el Programa del CRM. Los campos académicos pertenecen al CRM y el conector nunca los sobrescribe.'
    },
    learnersCard: {
      title: 'Estudiantes en este curso',
      table: {
        externalEnrolment: 'Matrícula externa',
        learnerId: 'Id de estudiante',
        crmStudent: 'Estudiante en el CRM',
        status: 'Estado',
        progress: 'Progreso',
        certificate: 'Certificado'
      },
      notMapped: 'Sin asociar',
      empty: 'No hay estudiantes registrados en este curso.'
    },
    syncHistoryCard: {
      title: 'Historial de sincronización de este curso',
      empty: 'Este curso todavía no se ha sincronizado.'
    }
  },
  learningEnrolments: {
    pageTitle: 'Centro de aprendizaje',
    pageIntro: 'Progreso de los estudiantes desde el conector LMS externo y cómo se asocia cada registro con Zoho CRM.',
    cardTitle: 'Estudiantes',
    searchLabel: 'Buscar',
    searchPlaceholder: 'Id de estudiante, nombre del estudiante, curso o id externo',
    providerLabel: 'Proveedor',
    allProviders: 'Todos los proveedores',
    lmsStatusLabel: 'Estado en el LMS',
    mappingLabel: 'Asociación',
    syncLabel: 'Sincronización',
    activityLabel: 'Actividad',
    activityStale: 'Sin actividad durante 30 días o más',
    any: 'Cualquiera',
    chips: {
      provider: 'Proveedor',
      lmsStatus: 'Estado en el LMS',
      mapping: 'Asociación',
      sync: 'Sincronización',
      activity: 'Actividad',
      search: 'Buscar'
    },
    emptyTitle: 'Ningún registro de estudiante coincide',
    emptyMessage: 'Prueba a quitar un filtro.',
    table: {
      externalEnrolment: 'Matrícula externa',
      provider: 'Proveedor',
      course: 'Curso',
      crmStudent: 'Estudiante en el CRM',
      status: 'Estado',
      progress: 'Progreso',
      certificate: 'Certificado',
      mapping: 'Asociación',
      sync: 'Sincronización',
      lastActivity: 'Última actividad'
    },
    unknownCourse: 'Curso desconocido',
    mappingError: 'Error de asociación',
    notMapped: 'Sin asociar',
    provenanceNote: 'El progreso, las puntuaciones y los certificados son un conjunto de datos de demostración en el almacén de datos de Catalyst. Asociar un registro a un estudiante del CRM, y enviar su progreso a una matrícula del CRM, son escrituras reales en tu CRM en producción.'
  },
  learningEnrolmentDetail: {
    mapStudentDialog: {
      title: 'Asociar este estudiante a un estudiante del CRM',
      crmStudentLabel: 'Estudiante en el CRM',
      crmStudentHint: 'Elegir uno aquí es exacto y se intenta primero.',
      matchByIdentifierOption: 'Buscar coincidencia por identificador en su lugar',
      truncatedNote: 'Mostrando los primeros {loaded} de {total} estudiantes. Un estudiante más allá de esta página aún se puede buscar por correo electrónico a continuación.',
      studentEmailLabel: 'Correo electrónico del estudiante',
      studentEmailHintWithRef: 'La referencia guardada {reference} se intenta primero; este correo es la alternativa.',
      studentEmailHintNoRef: 'Se busca una coincidencia exacta de dirección. Si dos estudiantes la comparten, el registro se marca como error de asociación en lugar de adivinar.',
      submitButton: 'Asociar estudiante',
      toastError: 'La asociación no se pudo completar: {message}',
      toastMapped: 'Estudiante asociado a un estudiante del CRM.'
    },
    linkEnrolmentDialog: {
      title: 'Vincular a una matrícula del CRM',
      crmEnrolmentLabel: 'Matrícula del CRM',
      crmEnrolmentHint: 'Déjalo en blanco para quitar el vínculo. Solo se muestran las matrículas del estudiante asociado.',
      notLinkedOption: 'Sin vincular',
      noMatchTruncated: 'Sin coincidencias en las primeras {loaded} de {total} matrículas. Este estudiante podría tener una más allá de esa página, por lo que no es seguro asumir que no existe ninguna.',
      noEnrolments: 'Este estudiante no tiene matrículas en el CRM. Crea una desde este registro en su lugar, si tu rol lo permite.',
      submitButton: 'Guardar vínculo',
      toastLinked: 'Vinculado a una matrícula del CRM.',
      toastCleared: 'Vínculo con la matrícula del CRM eliminado.'
    },
    createEnrolmentDialog: {
      title: 'Crear la matrícula en el CRM',
      studentLabel: 'Estudiante',
      programmeLabel: 'Programa',
      programmeFromCourse: 'Tomado del curso asociado',
      intakeLabel: 'Convocatoria',
      intakeHint: 'Solo se muestran las convocatorias del programa del curso asociado. El servidor rechaza una convocatoria de otro programa.',
      chooseIntakeOption: 'Elige una convocatoria',
      startsPrefix: 'comienza el {date}',
      truncatedNote: 'Mostrando convocatorias de los primeros {loaded} de {total} registros. Una convocatoria más allá de esa página no aparecerá aquí.',
      dedupeNote: 'Si ya existe una matrícula del CRM para este estudiante, programa y convocatoria, se vincula en lugar de duplicarse — repetir esta acción no puede crear una segunda matrícula.',
      submitButton: 'Crear matrícula',
      toastCreated: 'Matrícula del CRM creada y vinculada.'
    },
    notFoundTitle: 'Registro de estudiante no encontrado',
    allLearnersLink: 'Todos los estudiantes',
    changeStudentButton: 'Cambiar estudiante',
    mapStudentButton: 'Asociar estudiante',
    changeCrmEnrolmentButton: 'Cambiar matrícula del CRM',
    linkCrmEnrolmentButton: 'Vincular matrícula del CRM',
    createCrmEnrolmentButton: 'Crear matrícula en el CRM',
    syncToCrmButton: 'Sincronizar con el CRM',
    actionErrorTitle: 'Esa acción no se pudo completar',
    mappingErrorTitle: 'Este registro no se pudo asociar',
    mappingErrorFallback: 'Se intentó la asociación y no se resolvió a un único estudiante del CRM.',
    syncConfirm: {
      title: '¿Enviar este progreso al CRM?',
      message: 'La matrícula del CRM vinculada tiene su proveedor de LMS, id de matrícula en el LMS, porcentaje de progreso, fecha de última sincronización y estado de sincronización sobrescritos con los valores de aquí.',
      confirmLabel: 'Sincronizar con el CRM'
    },
    toastSynced: 'Sincronizado. Campos escritos: {fields}.',
    recordCard: {
      title: 'Registro de aprendizaje',
      provider: 'Proveedor',
      externalEnrolmentId: 'Id de matrícula externa',
      externalLearnerId: 'Id de estudiante externo',
      course: 'Curso',
      noCourseMatch: 'Ningún curso coincide con {reference}',
      thisRecordFallback: 'este registro',
      status: 'Estado',
      progress: 'Progreso',
      assessmentScore: 'Puntuación de evaluación',
      started: 'Iniciado',
      lastActivity: 'Última actividad',
      completed: 'Completado',
      certificate: 'Certificado',
      viewLink: 'Ver'
    },
    crmCard: {
      title: 'Asociación y sincronización con el CRM',
      mapping: 'Asociación',
      crmStudent: 'Estudiante en el CRM',
      notMapped: 'Sin asociar',
      studentReference: 'Referencia del estudiante',
      crmEnrolment: 'Matrícula del CRM',
      notLinked: 'Sin vincular',
      syncStatus: 'Estado de sincronización',
      lastSync: 'Última sincronización',
      never: 'Nunca',
      lastMessage: 'Último mensaje',
      writesNote: 'Una sincronización escribe {fields} en la matrícula del CRM.'
    },
    catalystCard: {
      title: 'Valores guardados en Catalyst en lugar de en el CRM',
      note: 'Estos campos no existen en el módulo Matrículas del CRM, por lo que una sincronización no puede escribirlos. Se almacenan en el almacén de datos de Catalyst y se muestran desde ahí. Añadirlos al CRM es un cambio de metadatos y deliberadamente no se hace de forma automática en esta aplicación.',
      table: {
        module: 'Módulo',
        suggestedField: 'Campo sugerido',
        type: 'Tipo'
      }
    },
    syncHistoryCard: {
      title: 'Historial de sincronización de este registro',
      empty: 'Este registro todavía no se ha sincronizado.'
    }
  },
  learningSyncLog: {
    pageTitle: 'Centro de aprendizaje',
    pageIntro: 'Todas las asociaciones y sincronizaciones que ha realizado el conector, y quién las inició.',
    cardTitle: 'Registro de sincronización',
    entityLabel: 'Entidad',
    allEntities: 'Todas las entidades',
    resultLabel: 'Resultado',
    allResults: 'Todos los resultados',
    resultSucceeded: 'Correcto',
    resultFailed: 'Fallido',
    emptyTitle: 'Todavía no hay nada registrado',
    emptyMessage: 'Asocia o sincroniza un registro y aparecerá aquí.',
    attributionNote: 'Cada entrada se atribuye al usuario con sesión iniciada que la provocó. Las entradas se escriben después de que el CRM confirme la escritura, por lo que un éxito registrado significa que el CRM confirmó el cambio y no solo que se envió una solicitud.'
  }
};
