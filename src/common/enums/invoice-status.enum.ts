/**
 * Estados persistidos en `invoices.status`.
 * La columna es varchar; estos valores son el contrato de la aplicación.
 */
export enum InvoiceStatus {
  DRAFT = 'draft',
  ISSUED = 'issued',
  PAID = 'paid',
  PARTIALLY_PAID = 'partially_paid',
  CANCELLED = 'cancelled',
}
