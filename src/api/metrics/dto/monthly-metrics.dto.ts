/**
 * DTO para métricas de un mes específico
 * Contiene los totales y el conteo de entidades para un mes
 */
export interface MonthlyMetricsDto {
  /**
   * Número del mes (1-12)
   */
  month: number;

  /**
   * Nombre del mes en español
   */
  monthName: string;

  /**
   * Subtotal del mes sin IVA ni IRPF
   */
  subtotal: number;

  /**
   * IVA total del mes
   */
  vat: number;

  /**
   * IRPF total del mes (retenciones)
   */
  irpf: number;

  /**
   * Total del mes calculado (subtotal + IVA - IRPF)
   */
  total: number;

  /**
   * Número de facturas o gastos del mes
   */
  count: number;
}

