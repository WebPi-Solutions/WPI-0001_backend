/**
 * Estados persistidos en `quotes.status`.
 * La columna es varchar; estos valores son el contrato de la aplicación.
 */
export enum QuoteStatus {
  DRAFT = 'draft',
  ISSUED = 'issued',
  ORDERED = 'ordered',
  CONVERTED = 'converted',
  REJECTED = 'rejected',
}
