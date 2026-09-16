/**
 * Estados persistidos en PostgreSQL (`order_status`).
 * Se usan en `orders.status`.
 */
export enum OrderStatus {
  AWAITING_RECEIPT = 'awaiting_receipt',
  RECEIVED = 'received',
  INVOICED = 'invoiced',
}

/**
 * Valor por defecto de `orders.status` cuando no se informa en el alta.
 */
export const DEFAULT_ORDER_STATUS = OrderStatus.AWAITING_RECEIPT;

/**
 * Indica si el valor pertenece al enum PostgreSQL `order_status`.
 *
 * @param orderStatus - Valor recibido
 * @returns `true` si el valor es un estado de pedido válido
 */
export function isValidOrderStatus(orderStatus: unknown): orderStatus is OrderStatus {
  return Object.values(OrderStatus).includes(orderStatus as OrderStatus);
}
