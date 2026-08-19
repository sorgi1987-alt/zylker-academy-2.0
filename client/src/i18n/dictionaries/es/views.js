/**
 * Custom views (ViewManager.jsx) — saved filter/column/sort combinations for
 * the Students, Applications and Programmes list pages.
 */
export default {
  views: {
    viewLabel: 'Vista',
    allRecords: 'Todos los registros',
    defaultTag: 'predeterminada',
    filterButton: 'Filtrar',
    setDefault: 'Establecer como predeterminada',
    unsetDefault: 'Quitar como predeterminada',
    deleteView: 'Eliminar vista',
    deleteConfirmTitle: '¿Eliminar esta vista?',
    deleteConfirmMessage: 'Esto solo elimina la vista guardada en este dispositivo. No cambia ni elimina ningún registro.',
    newViewTitle: 'Nueva vista',
    editViewTitle: 'Editar vista',
    nameLabel: 'Nombre de la vista',
    nameRequired: 'Ponle un nombre a esta vista.',
    filtersHeading: 'Filtros',
    noConditions: 'Todavía no hay filtros — esta vista muestra todos los registros.',
    addCondition: 'Añadir filtro',
    removeCondition: 'Quitar este filtro',
    conditionField: 'Campo',
    conditionOperator: 'Condición',
    conditionValue: 'Valor',
    columnsHeading: 'Columnas',
    alwaysShown: 'siempre visible',
    sortHeading: 'Orden',
    noSort: 'Sin orden aplicado',
    sortAsc: 'Ascendente',
    sortDesc: 'Descendente',
    saveView: 'Guardar vista',
    saveAsNewView: 'Guardar como nueva vista',
    booleanTrue: 'Sí',
    booleanFalse: 'No',
    operators: {
      equals: 'es',
      not_equals: 'no es',
      contains: 'contiene',
      not_contains: 'no contiene',
      is_empty: 'está vacío',
      is_not_empty: 'no está vacío',
      gt: 'es mayor que',
      gte: 'es al menos',
      lt: 'es menor que',
      lte: 'es como máximo',
      before: 'es anterior a',
      after: 'es posterior a'
    },
    fields: {
      student: {
        fullName: 'Nombre',
        studentId: 'Id. de estudiante',
        email: 'Correo electrónico',
        status: 'Estado',
        programme: 'Programa',
        enrolmentStatus: 'Estado de matrícula',
        externalReference: 'Referencia externa',
        added: 'Añadido'
      },
      application: {
        name: 'Solicitud',
        applicantName: 'Nombre del solicitante',
        applicantEmail: 'Correo del solicitante',
        stage: 'Etapa',
        programme: 'Programa',
        intake: 'Convocatoria',
        applicationDate: 'Solicitada',
        expectedDecisionDate: 'Decisión prevista',
        tuitionFee: 'Tasa'
      },
      programme: {
        name: 'Programa',
        code: 'Código',
        academicLevel: 'Nivel',
        status: 'Estado',
        active: 'Activo',
        department: 'Departamento',
        tuitionFee: 'Tasa',
        intakeCount: 'Convocatorias',
        enrolmentCount: 'Matrículas',
        applicationCount: 'Solicitudes'
      },
      intake: {
        name: 'Convocatoria',
        programme: 'Programa',
        status: 'Estado',
        academicYear: 'Año académico',
        startDate: 'Inicio',
        endDate: 'Fin',
        applicationOpenDate: 'Apertura de solicitudes',
        applicationDeadline: 'Fecha límite de solicitud',
        capacity: 'Capacidad',
        deliveryMode: 'Modalidad de impartición',
        location: 'Ubicación',
        applicationCount: 'Solicitudes',
        enrolmentCount: 'Matrículas'
      },
      enrolment: {
        reference: 'Matrícula',
        student: 'Estudiante',
        programme: 'Programa',
        intake: 'Convocatoria',
        status: 'Estado',
        enrolled: 'Matriculado',
        progress: 'Progreso',
        lmsSync: 'Estado de sincronización con el LMS',
        externalReference: 'Referencia externa'
      }
    }
  }
};
