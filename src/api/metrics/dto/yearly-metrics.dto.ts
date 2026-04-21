import { MonthlyMetricsDto } from './monthly-metrics.dto';

/**
 * DTO para métricas anuales
 * Contiene métricas mensuales y totales acumulados del año
 */
export interface YearlyMetricsDto {
  /**
   * Año de consulta
   */
  year: number;

  /**
   * Métricas de cada mes del año
   */
  months: MonthlyMetricsDto[];

  /**
   * Totales acumulados del año completo
   */
  totals: {
    /**
     * Subtotal anual sin IVA ni IRPF
     */
    subtotal: number;

    /**
     * IVA total anual
     */
    vat: number;

    /**
     * IRPF total anual (retenciones)
     */
    irpf: number;

    /**
     * Total anual calculado (subtotal + IVA - IRPF)
     */
    total: number;

    /**
     * Número total de facturas o gastos del año
     */
    count: number;
  };
}

