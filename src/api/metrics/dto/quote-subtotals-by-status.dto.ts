/**
 * DTO para métricas de importe imponible (subtotal) por estado de presupuesto
 * Desglosado por tipos: total, draft, issued, converted, rejected
 */
export interface QuoteStatusMetricsDto {
  /**
   * Número de presupuestos
   */
  count: number;

  /**
   * Importe imponible (subtotal) en euros
   */
  subtotal: number;
}

/**
 * DTO de respuesta del endpoint de subtotales por estado de presupuestos
 */
export interface QuoteSubtotalsByStatusDto {
  /**
   * Total de todos los presupuestos (conteo y subtotal)
   */
  total: QuoteStatusMetricsDto;

  /**
   * Presupuestos en borrador
   */
  draft: QuoteStatusMetricsDto;

  /**
   * Presupuestos emitidos
   */
  issued: QuoteStatusMetricsDto;

  /**
   * Presupuestos convertidos a factura
   */
  converted: QuoteStatusMetricsDto;

  /**
   * Presupuestos rechazados
   */
  rejected: QuoteStatusMetricsDto;
}
