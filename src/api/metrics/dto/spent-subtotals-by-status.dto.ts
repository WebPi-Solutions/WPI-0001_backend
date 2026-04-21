/**
 * DTO para métricas de importe imponible (subtotal) por estado de gasto
 * Desglosado por tipos: total, pending, paid, partially_paid, cancelled
 */
export interface SpentStatusMetricsDto {
  /**
   * Número de gastos
   */
  count: number;

  /**
   * Importe imponible (subtotal) en euros
   */
  subtotal: number;
}

/**
 * DTO de respuesta del endpoint de subtotales por estado de gastos
 */
export interface SpentSubtotalsByStatusDto {
  /**
   * Total de todos los gastos (conteo y subtotal)
   */
  total: SpentStatusMetricsDto;

  /**
   * Gastos pendientes
   */
  pending: SpentStatusMetricsDto;

  /**
   * Gastos pagados
   */
  paid: SpentStatusMetricsDto;

  /**
   * Gastos con pago parcial
   */
  partially_paid: SpentStatusMetricsDto;

  /**
   * Gastos cancelados
   */
  cancelled: SpentStatusMetricsDto;
}
