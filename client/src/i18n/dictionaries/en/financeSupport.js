// Filled in by the Invoices / InvoiceDetail / Tickets / TicketDetail translation batch.
export default {
  invoices: {
    pageTitle: 'Finance',
    cardTitle: 'Invoices',
    filteredToCustomer: 'Filtered to Zoho Books customer',
    showAllInvoices: 'Show all invoices',
    searchPlaceholder: 'Invoice number or customer',
    status: {
      label: 'Status',
      all: 'All statuses'
    },
    invoicedFrom: 'Invoiced from',
    invoicedTo: 'Invoiced to',
    filters: {
      status: 'Status',
      from: 'From',
      to: 'To'
    },
    empty: {
      title: 'No invoices match',
      message: 'Try a different search term, status or date range.'
    },
    table: {
      invoice: 'Invoice',
      customer: 'Customer',
      date: 'Date',
      due: 'Due',
      status: 'Status',
      subtotal: 'Subtotal',
      tax: 'Tax',
      total: 'Total',
      balance: 'Balance'
    }
  },
  invoiceDetail: {
    notFound: 'Invoice not found',
    heading: 'Invoice {number}',
    backToFinance: 'Back to Finance',
    openInBooks: 'Open in Zoho Books',
    cardInvoice: 'Invoice',
    cardAmounts: 'Amounts',
    cardLineItems: 'Line items',
    cardPayments: 'Payments',
    cardNotesAndTerms: 'Notes and terms',
    field: {
      invoiceNumber: 'Invoice number',
      reference: 'Reference',
      customer: 'Customer',
      email: 'Email',
      invoiceDate: 'Invoice date',
      dueDate: 'Due date',
      status: 'Status',
      paymentStatus: 'Payment status',
      currency: 'Currency',
      subtotal: 'Subtotal',
      tax: 'Tax',
      total: 'Total',
      paid: 'Paid',
      creditsApplied: 'Credits applied',
      balanceDue: 'Balance due'
    },
    lineItemsTable: {
      item: 'Item',
      quantity: 'Quantity',
      rate: 'Rate',
      tax: 'Tax',
      total: 'Total'
    },
    noLineItems: 'This invoice has no line items.',
    paymentsTable: {
      date: 'Date',
      amount: 'Amount',
      method: 'Method',
      reference: 'Reference'
    },
    noPayments: 'No payment records were returned for this invoice. If payments exist in Zoho Books, the connection may not carry the scope needed to read them.',
    notes: 'Notes',
    terms: 'Terms'
  },
  tickets: {
    pageTitle: 'Support',
    cardTitle: 'Tickets',
    filteredToContact: 'Filtered to Zoho Desk contact',
    showAllTickets: 'Show all tickets',
    searchPlaceholder: 'Subject',
    status: {
      label: 'Status',
      all: 'All statuses'
    },
    filters: {
      status: 'Status'
    },
    empty: {
      title: 'No tickets match',
      message: 'Try a different search term or status.'
    },
    overdue: 'Overdue',
    table: {
      ticket: 'Ticket',
      subject: 'Subject',
      status: 'Status',
      priority: 'Priority',
      created: 'Created',
      due: 'Due'
    }
  },
  ticketDetail: {
    notFound: 'Ticket not found',
    fallbackHeading: 'Ticket {number}',
    overdue: 'Overdue',
    backToSupport: 'Back to Support',
    openInDesk: 'Open in Zoho Desk',
    cardTicket: 'Ticket',
    cardDates: 'Dates',
    cardDescription: 'Description',
    field: {
      ticketNumber: 'Ticket number',
      status: 'Status',
      priority: 'Priority',
      category: 'Category',
      contactEmail: 'Contact email',
      created: 'Created',
      lastModified: 'Last modified',
      due: 'Due',
      closed: 'Closed',
      threadMessages: 'Thread messages'
    }
  }
};
