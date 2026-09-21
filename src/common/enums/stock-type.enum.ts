/**
 * Tipos persistidos en PostgreSQL (`stock_types`).
 * Se usan en `stock_movements.type`.
 */
export enum StockType {
  PURCHASE = 'purchase',
  SALE = 'sale',
  REVERSAL = 'reversal',
}

/**
 * Indica si el valor pertenece al enum PostgreSQL `stock_types`.
 *
 * @param stockType - Valor recibido
 * @returns `true` si el valor es un tipo de movimiento válido
 */
export function isValidStockType(stockType: unknown): stockType is StockType {
  return Object.values(StockType).includes(stockType as StockType);
}
