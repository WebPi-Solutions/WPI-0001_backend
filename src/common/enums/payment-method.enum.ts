/**
 * Métodos de pago persistidos en PostgreSQL (`payment_methods`).
 * Se usan en `clients.payment_method`.
 */
export enum PaymentMethod {
  CARD = 'card',
  CASH = 'cash',
  BANK_TRANSFER = 'bank_transfer',
  DIRECT_DEBIT = 'direct_debit',
}

/**
 * Valor por defecto de `clients.payment_method` cuando no se informa en el alta.
 */
export const DEFAULT_PAYMENT_METHOD = PaymentMethod.BANK_TRANSFER;

/**
 * Indica si el valor pertenece al enum PostgreSQL `payment_methods`.
 * @param paymentMethod - Valor recibido
 * @returns `true` si el valor es un método de pago válido
 */
export function isValidPaymentMethod(paymentMethod: unknown): paymentMethod is PaymentMethod {
  return Object.values(PaymentMethod).includes(paymentMethod as PaymentMethod);
}
