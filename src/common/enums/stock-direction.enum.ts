/**
 * Direcciones persistidas en PostgreSQL (`stock_directions`).
 * Se usan en `stock_movements.direction`.
 */
export enum StockDirection {
  IN = 'in',
  OUT = 'out',
}

/**
 * Indica si el valor pertenece al enum PostgreSQL `stock_directions`.
 *
 * @param stockDirection - Valor recibido
 * @returns `true` si el valor es una dirección de kardex válida
 */
export function isValidStockDirection(
  stockDirection: unknown,
): stockDirection is StockDirection {
  return Object.values(StockDirection).includes(stockDirection as StockDirection);
}
