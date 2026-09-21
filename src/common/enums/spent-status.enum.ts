/**
 * Estados persistidos en `spents.status`.
 * La columna es varchar; estos valores son el contrato de la aplicación.
 */
export enum SpentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  PARTIALLY_PAID = 'partially_paid',
  CANCELLED = 'cancelled',
}
