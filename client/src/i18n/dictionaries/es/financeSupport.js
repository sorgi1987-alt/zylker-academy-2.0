// Filled in by the Invoices / InvoiceDetail / Tickets / TicketDetail translation batch.
export default {
  invoices: {
    pageTitle: 'Finanzas',
    pageIntro: 'Facturas de Zoho Books. Esta aplicación solo lee las facturas — crearlas, editarlas, pagarlas y eliminarlas se hace en Zoho Books.',
    cardTitle: 'Facturas',
    filteredToCustomer: 'Filtrado por cliente de Zoho Books',
    showAllInvoices: 'Mostrar todas las facturas',
    searchPlaceholder: 'Número de factura o cliente',
    status: {
      label: 'Estado',
      all: 'Todos los estados'
    },
    invoicedFrom: 'Facturado desde',
    invoicedTo: 'Facturado hasta',
    filters: {
      status: 'Estado',
      from: 'Desde',
      to: 'Hasta'
    },
    empty: {
      title: 'Ninguna factura coincide',
      message: 'Prueba con otro término de búsqueda, estado o intervalo de fechas.'
    },
    table: {
      invoice: 'Factura',
      customer: 'Cliente',
      date: 'Fecha',
      due: 'Vencimiento',
      status: 'Estado',
      subtotal: 'Subtotal',
      tax: 'Impuesto',
      total: 'Total',
      balance: 'Saldo'
    }
  },
  invoiceDetail: {
    notFound: 'Factura no encontrada',
    heading: 'Factura {number}',
    backToFinance: 'Volver a Finanzas',
    openInBooks: 'Abrir en Zoho Books',
    cardInvoice: 'Factura',
    cardAmounts: 'Importes',
    cardLineItems: 'Partidas',
    cardPayments: 'Pagos',
    cardNotesAndTerms: 'Notas y condiciones',
    field: {
      invoiceNumber: 'Número de factura',
      reference: 'Referencia',
      customer: 'Cliente',
      email: 'Correo electrónico',
      invoiceDate: 'Fecha de factura',
      dueDate: 'Fecha de vencimiento',
      status: 'Estado',
      paymentStatus: 'Estado del pago',
      currency: 'Moneda',
      subtotal: 'Subtotal',
      tax: 'Impuesto',
      total: 'Total',
      paid: 'Pagado',
      creditsApplied: 'Créditos aplicados',
      balanceDue: 'Saldo pendiente'
    },
    lineItemsTable: {
      item: 'Artículo',
      quantity: 'Cantidad',
      rate: 'Precio',
      tax: 'Impuesto',
      total: 'Total'
    },
    noLineItems: 'Esta factura no tiene partidas.',
    paymentsTable: {
      date: 'Fecha',
      amount: 'Importe',
      method: 'Método',
      reference: 'Referencia'
    },
    noPayments: 'No se devolvió ningún registro de pago para esta factura. Si existen pagos en Zoho Books, es posible que la conexión no tenga el permiso necesario para leerlos.',
    notes: 'Notas',
    terms: 'Condiciones'
  },
  tickets: {
    pageTitle: 'Soporte',
    pageIntro: 'Tickets de Zoho Desk. Esta aplicación solo lee los tickets — crearlos, responderlos y cerrarlos se hace en Zoho Desk.',
    cardTitle: 'Tickets',
    filteredToContact: 'Filtrado por contacto de Zoho Desk',
    showAllTickets: 'Mostrar todos los tickets',
    searchPlaceholder: 'Asunto',
    status: {
      label: 'Estado',
      all: 'Todos los estados'
    },
    filters: {
      status: 'Estado'
    },
    empty: {
      title: 'Ningún ticket coincide',
      message: 'Prueba con otro término de búsqueda o estado.'
    },
    overdue: 'Vencido',
    table: {
      ticket: 'Ticket',
      subject: 'Asunto',
      status: 'Estado',
      priority: 'Prioridad',
      created: 'Creado',
      due: 'Vencimiento'
    }
  },
  ticketDetail: {
    notFound: 'Ticket no encontrado',
    fallbackHeading: 'Ticket {number}',
    overdue: 'Vencido',
    backToSupport: 'Volver a Soporte',
    openInDesk: 'Abrir en Zoho Desk',
    cardTicket: 'Ticket',
    cardDates: 'Fechas',
    cardDescription: 'Descripción',
    field: {
      ticketNumber: 'Número de ticket',
      status: 'Estado',
      priority: 'Prioridad',
      category: 'Categoría',
      contactEmail: 'Correo del contacto',
      created: 'Creado',
      lastModified: 'Última modificación',
      due: 'Vencimiento',
      closed: 'Cerrado',
      threadMessages: 'Mensajes del hilo'
    }
  }
};
