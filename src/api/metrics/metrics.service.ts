import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InvoiceRepository } from '../../entities/invoice/invoice-repository.service';
import { QuoteRepository } from '../../entities/quote/quote-repository.service';
import { SpentRepository } from '../../entities/spent/spent-repository.service';
import { FinancialMetricsDto, InvoiceSubtotalsByStatusDto, QuoteSubtotalsByStatusDto, SpentSubtotalsByStatusDto, MonthlyMetricsDto, YearlyMetricsDto } from './dto';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly quoteRepository: QuoteRepository,
    private readonly spentRepository: SpentRepository
  ) {}

  /**
   * Obtiene los importes imponibles (subtotales) de facturas desglosados por estado,
   * aplicando los filtros de la vista de facturas.
   * @param enterpriseId - ID de la empresa
   * @param filter - Filtros aplicados (status, series.id, client.id, fechas, búsquedas)
   * @returns Subtotales y conteos por estado
   */
  async getInvoiceSubtotalsByStatus(
    enterpriseId: string,
    filter: Record<string, any> = {}
  ): Promise<InvoiceSubtotalsByStatusDto> {
    this.logger.log(`Obteniendo subtotales por estado para empresa ${enterpriseId}`);

    return this.invoiceRepository.getInvoiceSubtotalsByStatus(enterpriseId, filter);
  }

  /**
   * Obtiene los importes imponibles (subtotales) de presupuestos desglosados por estado,
   * aplicando los filtros de la vista de presupuestos.
   * @param enterpriseId - ID de la empresa
   * @param filter - Filtros aplicados (status, client.id, fechas, búsquedas)
   * @returns Subtotales y conteos por estado
   */
  async getQuoteSubtotalsByStatus(
    enterpriseId: string,
    filter: Record<string, any> = {}
  ): Promise<QuoteSubtotalsByStatusDto> {
    this.logger.log(`Obteniendo subtotales por estado de presupuestos para empresa ${enterpriseId}`);

    return this.quoteRepository.getQuoteSubtotalsByStatus(enterpriseId, filter);
  }

  /**
   * Obtiene los importes imponibles (subtotales) de gastos desglosados por estado,
   * aplicando los filtros de la vista de gastos.
   * @param enterpriseId - ID de la empresa
   * @param filter - Filtros aplicados (status, supplier.id, fechas, búsquedas)
   * @returns Subtotales y conteos por estado
   */
  async getSpentSubtotalsByStatus(
    enterpriseId: string,
    filter: Record<string, any> = {}
  ): Promise<SpentSubtotalsByStatusDto> {
    this.logger.log(`Obteniendo subtotales por estado de gastos para empresa ${enterpriseId}`);

    return this.spentRepository.getSpentSubtotalsByStatus(enterpriseId, filter);
  }

  /**
   * Calcula métricas de facturas emitidas para un rango de fechas
   * @param startDate - Fecha de inicio
   * @param endDate - Fecha de fin
   * @param enterpriseId - ID de la empresa
   * @returns Métricas de facturas emitidas calculadas
   */
  async getInvoicesMetrics(
    startDate: Date,
    endDate: Date,
    enterpriseId: string
  ): Promise<FinancialMetricsDto> {
    this.logger.log(`Calculando métricas de facturas emitidas para empresa ${enterpriseId} desde ${startDate.toISOString()} hasta ${endDate.toISOString()}`);

    // Validar fechas
    if (startDate > endDate) {
      throw new HttpException('La fecha de inicio no puede ser posterior a la fecha de fin', HttpStatus.BAD_REQUEST);
    }

    // Obtener facturas emitidas del repositorio
    const invoices = await this.invoiceRepository.getNonDraftInvoicesForMetrics(
      startDate,
      endDate,
      enterpriseId
    );

    // Calcular métricas procesando los conceptos
    let totalSubtotal = 0;
    let totalVat = 0;
    let totalIrpf = 0;

    for (const invoice of invoices.sort((a, b) => a.issuedDate.toString().localeCompare(b.issuedDate.toString()))) {
      if (invoice.concepts && Array.isArray(invoice.concepts)) {
        let totalInvoiceSubtotal = 0;
        let totalInvoiceVat = 0;
        let totalInvoiceIrpf = 0;
        for (const concept of invoice.concepts) {
          const quantity = concept.quantity || 1;
          const basePrice = concept.base_price || 0;
          const vatPercentage = concept.vat || 0;
          const irpfPercentage = concept.irpf || 0;

          // Calcular subtotal (base_price * quantity)
          const conceptSubtotal = basePrice * quantity;
          totalInvoiceSubtotal += conceptSubtotal;
          // Calcular IVA (subtotal * vat%)
          const conceptVat = (conceptSubtotal * vatPercentage) / 100;
          totalInvoiceVat += conceptVat;
          // Calcular IRPF (subtotal * irpf%)
          const conceptIrpf = (conceptSubtotal * irpfPercentage) / 100;
          totalInvoiceIrpf += conceptIrpf;
        }

        totalSubtotal += totalInvoiceSubtotal;
        totalVat += totalInvoiceVat;
        totalIrpf += totalInvoiceIrpf;
        this.logger.log(`Factura ${invoice.name} (${invoice.id}) con fecha ${invoice.issuedDate}: \n- Subtotal: ${totalInvoiceSubtotal} (${totalSubtotal})\n- IVA: ${totalInvoiceVat} (${totalVat})\n- IRPF: ${totalInvoiceIrpf} (${totalIrpf})`);
      }
    }

    // Calcular total (subtotal + IVA - IRPF)
    const total = totalSubtotal + totalVat - totalIrpf;

    // Formatear respuesta con redondeo a 2 decimales
    const metrics: FinancialMetricsDto = {
      subtotal: Math.round(totalSubtotal * 100) / 100,
      vat: Math.round(totalVat * 100) / 100,
      irpf: Math.round(totalIrpf * 100) / 100,
      total: Math.round(total * 100) / 100,
      invoiceCount: invoices.length,
      period: {
        startDate: startDate.toISOString().split('T')[0], // Formato YYYY-MM-DD
        endDate: endDate.toISOString().split('T')[0]
      }
    };

    this.logger.log(`Métricas de facturas emitidas calculadas:`, metrics);
    return metrics;
  }

  /**
   * Calcula métricas de gastos recibidos para un rango de fechas
   * @param startDate - Fecha de inicio
   * @param endDate - Fecha de fin
   * @param enterpriseId - ID de la empresa
   * @returns Métricas de gastos recibidos calculadas
   */
  async getSpentMetrics(
    startDate: Date,
    endDate: Date,
    enterpriseId: string
  ): Promise<FinancialMetricsDto> {
    this.logger.log(`Calculando métricas de gastos recibidos para empresa ${enterpriseId} desde ${startDate.toISOString()} hasta ${endDate.toISOString()}`);

    // Validar fechas
    if (startDate > endDate) {
      throw new HttpException('La fecha de inicio no puede ser posterior a la fecha de fin', HttpStatus.BAD_REQUEST);
    }

    // Obtener gastos del repositorio
    const spents = await this.spentRepository.getSpentsForMetrics(
      startDate,
      endDate,
      enterpriseId
    );

    // Calcular métricas procesando los conceptos
    let totalSubtotal = 0;
    let totalVat = 0;
    let totalIrpf = 0;

    for (const spent of spents) {
      if (spent.concepts && Array.isArray(spent.concepts)) {
        for (const concept of spent.concepts) {
          const quantity = concept.quantity || 1;
          const basePrice = concept.base_price || 0;
          const vatPercentage = concept.vat || 0;
          const irpfPercentage = concept.irpf || 0;
          const percentage = concept.percentage !== undefined ? concept.percentage : 100; // Por defecto 100%

          // Calcular subtotal (base_price * quantity * percentage/100)
          const conceptSubtotal = (basePrice * quantity * percentage) / 100;
          totalSubtotal += conceptSubtotal;

          // Calcular IVA (subtotal * vat%)
          const conceptVat = (conceptSubtotal * vatPercentage) / 100;
          totalVat += conceptVat;

          // Calcular IRPF (subtotal * irpf%)
          const conceptIrpf = (conceptSubtotal * irpfPercentage) / 100;
          totalIrpf += conceptIrpf;
        }
      }
    }

    // Calcular total (subtotal + IVA - IRPF)
    const total = totalSubtotal + totalVat - totalIrpf;

    // Formatear respuesta con redondeo a 2 decimales
    const metrics: FinancialMetricsDto = {
      subtotal: Math.round(totalSubtotal * 100) / 100,
      vat: Math.round(totalVat * 100) / 100,
      irpf: Math.round(totalIrpf * 100) / 100,
      total: Math.round(total * 100) / 100,
      spentCount: spents.length,
      period: {
        startDate: startDate.toISOString().split('T')[0], // Formato YYYY-MM-DD
        endDate: endDate.toISOString().split('T')[0]
      }
    };

    this.logger.log(`Métricas de gastos recibidos calculadas:`, metrics);
    return metrics;
  }

  /**
   * Obtiene métricas mensuales de facturas emitidas (no borrador) para un año específico
   * @param year - Año a consultar
   * @param enterpriseId - ID de la empresa
   * @returns Métricas mensuales de facturas emitidas (no borrador)
   */
  async getYearlyInvoiceMetrics(year: number, enterpriseId: string): Promise<YearlyMetricsDto> {
    this.logger.log(`Calculando métricas mensuales de facturas emitidas para año ${year}, empresa ${enterpriseId}`);

    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    const monthlyMetrics: MonthlyMetricsDto[] = [];
    let yearTotalSubtotal = 0;
    let yearTotalVat = 0;
    let yearTotalIrpf = 0;
    let yearTotalCount = 0;

    // Iterar por cada mes del año
    for (let month = 0; month < 12; month++) {
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0); // Último día del mes

      // Obtener facturas del mes
      const invoices = await this.invoiceRepository.getNonDraftInvoicesForMetrics(
        startDate,
        endDate,
        enterpriseId
      );

      // Calcular métricas del mes
      let monthSubtotal = 0;
      let monthVat = 0;
      let monthIrpf = 0;

      for (const invoice of invoices) {
        if (invoice.concepts && Array.isArray(invoice.concepts)) {
          for (const concept of invoice.concepts) {
            const quantity = concept.quantity || 1;
            const basePrice = concept.base_price || 0;
            const vatPercentage = concept.vat || 0;
            const irpfPercentage = concept.irpf || 0;

            const conceptSubtotal = basePrice * quantity;
            monthSubtotal += conceptSubtotal;
            monthVat += (conceptSubtotal * vatPercentage) / 100;
            monthIrpf += (conceptSubtotal * irpfPercentage) / 100;
          }
        }
      }

      const monthTotal = monthSubtotal + monthVat - monthIrpf;

      // Agregar métricas del mes
      monthlyMetrics.push({
        month: month + 1,
        monthName: monthNames[month],
        subtotal: Math.round(monthSubtotal * 100) / 100,
        vat: Math.round(monthVat * 100) / 100,
        irpf: Math.round(monthIrpf * 100) / 100,
        total: Math.round(monthTotal * 100) / 100,
        count: invoices.length
      });

      // Acumular totales del año
      yearTotalSubtotal += monthSubtotal;
      yearTotalVat += monthVat;
      yearTotalIrpf += monthIrpf;
      yearTotalCount += invoices.length;
    }

    const yearTotal = yearTotalSubtotal + yearTotalVat - yearTotalIrpf;

    const result: YearlyMetricsDto = {
      year,
      months: monthlyMetrics,
      totals: {
        subtotal: Math.round(yearTotalSubtotal * 100) / 100,
        vat: Math.round(yearTotalVat * 100) / 100,
        irpf: Math.round(yearTotalIrpf * 100) / 100,
        total: Math.round(yearTotal * 100) / 100,
        count: yearTotalCount
      }
    };

    this.logger.log(`Métricas anuales de facturas emitidas calculadas para año ${year}`);
    return result;
  }

  /**
   * Obtiene métricas mensuales de gastos recibidos para un año específico
   * @param year - Año a consultar
   * @param enterpriseId - ID de la empresa
   * @returns Métricas mensuales de gastos recibidos
   */
  async getYearlySpentMetrics(year: number, enterpriseId: string): Promise<YearlyMetricsDto> {
    this.logger.log(`Calculando métricas mensuales de gastos recibidos para año ${year}, empresa ${enterpriseId}`);

    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    const monthlyMetrics: MonthlyMetricsDto[] = [];
    let yearTotalSubtotal = 0;
    let yearTotalVat = 0;
    let yearTotalIrpf = 0;
    let yearTotalCount = 0;

    // Iterar por cada mes del año
    for (let month = 0; month < 12; month++) {
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0); // Último día del mes

      // Obtener gastos del mes
      const spents = await this.spentRepository.getSpentsForMetrics(
        startDate,
        endDate,
        enterpriseId
      );

      // Calcular métricas del mes
      let monthSubtotal = 0;
      let monthVat = 0;
      let monthIrpf = 0;

      for (const spent of spents) {
        if (spent.concepts && Array.isArray(spent.concepts)) {
          for (const concept of spent.concepts) {
            const quantity = concept.quantity || 1;
            const basePrice = concept.base_price || 0;
            const vatPercentage = concept.vat || 0;
            const irpfPercentage = concept.irpf || 0;
            const percentage = concept.percentage !== undefined ? concept.percentage : 100; // Por defecto 100%

            // Calcular subtotal con percentage aplicado
            const conceptSubtotal = (basePrice * quantity * percentage) / 100;
            monthSubtotal += conceptSubtotal;
            monthVat += (conceptSubtotal * vatPercentage) / 100;
            monthIrpf += (conceptSubtotal * irpfPercentage) / 100;
          }
        }
      }

      const monthTotal = monthSubtotal + monthVat - monthIrpf;

      // Agregar métricas del mes
      monthlyMetrics.push({
        month: month + 1,
        monthName: monthNames[month],
        subtotal: Math.round(monthSubtotal * 100) / 100,
        vat: Math.round(monthVat * 100) / 100,
        irpf: Math.round(monthIrpf * 100) / 100,
        total: Math.round(monthTotal * 100) / 100,
        count: spents.length
      });

      // Acumular totales del año
      yearTotalSubtotal += monthSubtotal;
      yearTotalVat += monthVat;
      yearTotalIrpf += monthIrpf;
      yearTotalCount += spents.length;
    }

    const yearTotal = yearTotalSubtotal + yearTotalVat - yearTotalIrpf;

    const result: YearlyMetricsDto = {
      year,
      months: monthlyMetrics,
      totals: {
        subtotal: Math.round(yearTotalSubtotal * 100) / 100,
        vat: Math.round(yearTotalVat * 100) / 100,
        irpf: Math.round(yearTotalIrpf * 100) / 100,
        total: Math.round(yearTotal * 100) / 100,
        count: yearTotalCount
      }
    };

    this.logger.log(`Métricas anuales de gastos recibidos calculadas para año ${year}`);
    return result;
  }
}
