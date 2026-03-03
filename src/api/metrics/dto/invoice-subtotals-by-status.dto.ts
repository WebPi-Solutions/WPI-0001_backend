/**
 * DTO para métricas de importe imponible (subtotal) por estado de factura
 * Desglosado por tipos: total, draft, issued, paid, partially_paid, cancelled
 */
export interface InvoiceStatusMetricsDto {
  /**
   * Número de facturas
   */
  count: number;

  /**
   * Importe imponible (subtotal) en euros
   */
  subtotal: number;
}

/**
 * DTO de respuesta del endpoint de subtotales por estado
 */
export interface InvoiceSubtotalsByStatusDto {
  /**
   * Total de todas las facturas (conteo y subtotal)
   */
  total: InvoiceStatusMetricsDto;

  /**
   * Facturas en borrador
   */
  draft: InvoiceStatusMetricsDto;

  /**
   * Facturas emitidas
   */
  issued: InvoiceStatusMetricsDto;

  /**
   * Facturas pagadas
   */
  paid: InvoiceStatusMetricsDto;

  /**
   * Facturas con pago parcial
   */
  partially_paid: InvoiceStatusMetricsDto;

  /**
   * Facturas canceladas
   */
  cancelled: InvoiceStatusMetricsDto;
}
