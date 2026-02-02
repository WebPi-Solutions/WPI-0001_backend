/**
 * DTO para métricas financieras de un período específico
 * Contiene los totales de subtotal, IVA, IRPF y el total calculado
 */
export interface FinancialMetricsDto {
  /**
   * Subtotal sin IVA ni IRPF
   */
  subtotal: number;

  /**
   * IVA total
   */
  vat: number;

  /**
   * IRPF total (retenciones)
   */
  irpf: number;

  /**
   * Total calculado (subtotal + IVA - IRPF)
   */
  total: number;

  /**
   * Número de facturas incluidas en el cálculo (opcional)
   */
  invoiceCount?: number;

  /**
   * Número de gastos incluidos en el cálculo (opcional)
   */
  spentCount?: number;

  /**
   * Período de consulta
   */
  period: {
    startDate: string;
    endDate: string;
  };
}

