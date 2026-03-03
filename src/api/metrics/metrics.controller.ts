import { Controller, Get, Query, Logger, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { FinancialMetricsDto, InvoiceSubtotalsByStatusDto, QuoteSubtotalsByStatusDto, SpentSubtotalsByStatusDto, YearlyMetricsDto } from './dto';
import { ApiBadRequestResponse, ApiBearerAuth, ApiInternalServerErrorResponse, ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';

@Controller('metrics')
export class MetricsController {
  private readonly logger = new Logger(MetricsController.name);

  constructor(private readonly metricsService: MetricsService) {}

  /**
   * Obtiene los importes imponibles (subtotales) de facturas desglosados por estado,
   * aplicando los mismos filtros que la vista de facturas.
   * @param enterpriseId - ID de la empresa
   * @param filter - Filtros en formato JSON (status, series.id, client.id, fechas, name_ilike, client.name_ilike)
   * @returns Subtotales y conteos por estado (total, draft, issued, paid, partially_paid, cancelled)
   */
  @Get('invoices/subtotals-by-status')
  @ApiOperation({ summary: 'Obtiene importes imponibles de facturas desglosados por estado' })
  @ApiBearerAuth('auth_token')
  @ApiQuery({ name: 'enterpriseId', description: 'ID de la empresa', required: true })
  @ApiQuery({ name: 'filter', description: 'Filtros en formato JSON (opcional)', required: false })
  @ApiOkResponse({ description: 'Subtotales por estado calculados' })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiInternalServerErrorResponse({ description: 'Error interno del servidor' })
  async getInvoiceSubtotalsByStatus(
    @Query('enterpriseId') enterpriseId: string,
    @Query('filter') filter?: string
  ): Promise<InvoiceSubtotalsByStatusDto> {
    this.logger.log(`Solicitud de subtotales por estado - Empresa: ${enterpriseId}`);

    if (!enterpriseId) {
      throw new BadRequestException('El parámetro enterpriseId es requerido');
    }

    let filterObj: Record<string, any> = {};
    if (filter) {
      try {
        filterObj = JSON.parse(filter);
      } catch (error) {
        this.logger.warn(`Error al parsear filtro JSON: ${error.message}`);
      }
    }

    try {
      const metrics = await this.metricsService.getInvoiceSubtotalsByStatus(enterpriseId, filterObj);
      this.logger.log(`Subtotales por estado obtenidos exitosamente para empresa ${enterpriseId}`);
      return metrics;
    } catch (error) {
      this.logger.error(`Error obteniendo subtotales por estado: ${error.message}`, error.stack);
      throw new HttpException(
        `Error obteniendo subtotales por estado: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Obtiene los importes imponibles (subtotales) de gastos desglosados por estado,
   * aplicando los mismos filtros que la vista de gastos.
   * @param enterpriseId - ID de la empresa
   * @param filter - Filtros en formato JSON (status, supplier.id, fechas, name_ilike, supplier.name_ilike)
   * @returns Subtotales y conteos por estado (total, pending, paid, partially_paid, cancelled)
   */
  @Get('spents/subtotals-by-status')
  @ApiOperation({ summary: 'Obtiene importes imponibles de gastos desglosados por estado' })
  @ApiBearerAuth('auth_token')
  @ApiQuery({ name: 'enterpriseId', description: 'ID de la empresa', required: true })
  @ApiQuery({ name: 'filter', description: 'Filtros en formato JSON (opcional)', required: false })
  @ApiOkResponse({ description: 'Subtotales por estado calculados' })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiInternalServerErrorResponse({ description: 'Error interno del servidor' })
  async getSpentSubtotalsByStatus(
    @Query('enterpriseId') enterpriseId: string,
    @Query('filter') filter?: string
  ): Promise<SpentSubtotalsByStatusDto> {
    this.logger.log(`Solicitud de subtotales por estado de gastos - Empresa: ${enterpriseId}`);

    if (!enterpriseId) {
      throw new BadRequestException('El parámetro enterpriseId es requerido');
    }

    let filterObj: Record<string, any> = {};
    if (filter) {
      try {
        filterObj = JSON.parse(filter);
      } catch (error) {
        this.logger.warn(`Error al parsear filtro JSON: ${error.message}`);
      }
    }

    try {
      const metrics = await this.metricsService.getSpentSubtotalsByStatus(enterpriseId, filterObj);
      this.logger.log(`Subtotales por estado de gastos obtenidos exitosamente para empresa ${enterpriseId}`);
      return metrics;
    } catch (error) {
      this.logger.error(`Error obteniendo subtotales por estado de gastos: ${error.message}`, error.stack);
      throw new HttpException(
        `Error obteniendo subtotales por estado de gastos: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Obtiene los importes imponibles (subtotales) de presupuestos desglosados por estado,
   * aplicando los mismos filtros que la vista de presupuestos.
   * @param enterpriseId - ID de la empresa
   * @param filter - Filtros en formato JSON (status, client.id, fechas, name_ilike, client.name_ilike)
   * @returns Subtotales y conteos por estado (total, draft, issued, converted, rejected)
   */
  @Get('quotes/subtotals-by-status')
  @ApiOperation({ summary: 'Obtiene importes imponibles de presupuestos desglosados por estado' })
  @ApiBearerAuth('auth_token')
  @ApiQuery({ name: 'enterpriseId', description: 'ID de la empresa', required: true })
  @ApiQuery({ name: 'filter', description: 'Filtros en formato JSON (opcional)', required: false })
  @ApiOkResponse({ description: 'Subtotales por estado calculados' })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiInternalServerErrorResponse({ description: 'Error interno del servidor' })
  async getQuoteSubtotalsByStatus(
    @Query('enterpriseId') enterpriseId: string,
    @Query('filter') filter?: string
  ): Promise<QuoteSubtotalsByStatusDto> {
    this.logger.log(`Solicitud de subtotales por estado de presupuestos - Empresa: ${enterpriseId}`);

    if (!enterpriseId) {
      throw new BadRequestException('El parámetro enterpriseId es requerido');
    }

    let filterObj: Record<string, any> = {};
    if (filter) {
      try {
        filterObj = JSON.parse(filter);
      } catch (error) {
        this.logger.warn(`Error al parsear filtro JSON: ${error.message}`);
      }
    }

    try {
      const metrics = await this.metricsService.getQuoteSubtotalsByStatus(enterpriseId, filterObj);
      this.logger.log(`Subtotales por estado de presupuestos obtenidos exitosamente para empresa ${enterpriseId}`);
      return metrics;
    } catch (error) {
      this.logger.error(`Error obteniendo subtotales por estado de presupuestos: ${error.message}`, error.stack);
      throw new HttpException(
        `Error obteniendo subtotales por estado de presupuestos: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Obtiene métricas de facturas emitidas (no borrador) en un rango de fechas
   * @param startDate - Fecha de inicio (formato YYYY-MM-DD)
   * @param endDate - Fecha de fin (formato YYYY-MM-DD)
   * @param enterpriseId - ID de la empresa
   * @returns Métricas de facturas emitidas (no borrador) calculadas
   */
  @Get('invoices')
  @ApiOperation({ summary: 'Obtiene métricas de facturas emitidas (no borrador) en un rango de fechas' })
  @ApiBearerAuth('auth_token')
  @ApiQuery({ name: 'startDate', description: 'Fecha de inicio (formato YYYY-MM-DD)', required: true })
  @ApiQuery({ name: 'endDate', description: 'Fecha de fin (formato YYYY-MM-DD)', required: true })
  @ApiQuery({ name: 'enterpriseId', description: 'ID de la empresa', required: true })
  @ApiOkResponse({ description: 'Métricas de facturas emitidas calculadas' })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiInternalServerErrorResponse({ description: 'Error interno del servidor' })
  async getInvoicesMetrics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('enterpriseId') enterpriseId: string
  ): Promise<FinancialMetricsDto> {
    this.logger.log(`Solicitud de métricas de facturas emitidas - Empresa: ${enterpriseId}, Fechas: ${startDate} - ${endDate}`);

    // Validar parámetros requeridos
    if (!startDate || !endDate || !enterpriseId) {
      throw new BadRequestException('Los parámetros startDate, endDate y enterpriseId son requeridos');
    }

    // Validar formato de fechas
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      throw new BadRequestException('Las fechas deben tener el formato YYYY-MM-DD');
    }

    try {
      // Obtener métricas financieras
      const metrics = await this.metricsService.getInvoicesMetrics(
        startDateObj,
        endDateObj,
        enterpriseId
      );

      this.logger.log(`Métricas financieras obtenidas exitosamente para empresa ${enterpriseId}`);
      return metrics;

    } catch (error) {
      this.logger.error(`Error obteniendo métricas de facturas emitidas: ${error.message}`, error.stack);
      throw new HttpException(`Error obteniendo métricas de facturas emitidas: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Obtiene métricas de gastos recibidos en un rango de fechas
   * @param startDate - Fecha de inicio (formato YYYY-MM-DD)
   * @param endDate - Fecha de fin (formato YYYY-MM-DD)
   * @param enterpriseId - ID de la empresa
   * @returns Métricas de gastos recibidos calculadas
   */
  @Get('spents')
  @ApiOperation({ summary: 'Obtiene métricas de gastos recibidos en un rango de fechas' })
  @ApiBearerAuth('auth_token')
  @ApiQuery({ name: 'startDate', description: 'Fecha de inicio (formato YYYY-MM-DD)', required: true })
  @ApiQuery({ name: 'endDate', description: 'Fecha de fin (formato YYYY-MM-DD)', required: true })
  @ApiQuery({ name: 'enterpriseId', description: 'ID de la empresa', required: true })
  @ApiOkResponse({ description: 'Métricas de gastos recibidos calculadas' })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiInternalServerErrorResponse({ description: 'Error interno del servidor' })
  async getSpentMetrics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('enterpriseId') enterpriseId: string
  ): Promise<FinancialMetricsDto> {
    this.logger.log(`Solicitud de métricas de gastos recibidos - Empresa: ${enterpriseId}, Fechas: ${startDate} - ${endDate}`);

    // Validar parámetros requeridos
    if (!startDate || !endDate || !enterpriseId) {
      throw new BadRequestException('Los parámetros startDate, endDate y enterpriseId son requeridos');
    }

    // Validar formato de fechas
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      throw new BadRequestException('Las fechas deben tener el formato YYYY-MM-DD');
    }

    try {
      // Obtener métricas de gastos recibidos
      const metrics = await this.metricsService.getSpentMetrics(
        startDateObj,
        endDateObj,
        enterpriseId
      );

      this.logger.log(`Métricas de gastos recibidos obtenidas exitosamente para empresa ${enterpriseId}`);
      return metrics;

    } catch (error) {
      this.logger.error(`Error obteniendo métricas de gastos recibidos: ${error.message}`, error.stack);
      throw new HttpException(`Error obteniendo métricas de gastos recibidos: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Obtiene métricas mensuales de facturas para un año específico
   * @param year - Año a consultar
   * @param enterpriseId - ID de la empresa
   * @returns Métricas mensuales de facturas
   */
  @Get('invoices/yearly')
  @ApiOperation({ summary: 'Obtiene métricas mensuales de facturas para un año específico' })
  @ApiBearerAuth('auth_token')
  @ApiQuery({ name: 'year', description: 'Año a consultar (ej: 2025)', required: true })
  @ApiQuery({ name: 'enterpriseId', description: 'ID de la empresa', required: true })
  @ApiOkResponse({ description: 'Métricas mensuales de facturas calculadas' })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiInternalServerErrorResponse({ description: 'Error interno del servidor' })
  async getYearlyInvoiceMetrics(
    @Query('year') year: string,
    @Query('enterpriseId') enterpriseId: string
  ): Promise<YearlyMetricsDto> {
    this.logger.log(`Solicitud de métricas anuales de facturas - Empresa: ${enterpriseId}, Año: ${year}`);

    // Validar parámetros requeridos
    if (!year || !enterpriseId) {
      throw new BadRequestException('Los parámetros year y enterpriseId son requeridos');
    }

    // Validar y parsear año
    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      throw new BadRequestException('El año debe ser un número válido entre 2000 y 2100');
    }

    try {
      // Obtener métricas anuales de facturas
      const metrics = await this.metricsService.getYearlyInvoiceMetrics(
        yearNum,
        enterpriseId
      );

      this.logger.log(`Métricas anuales de facturas obtenidas exitosamente para empresa ${enterpriseId}, año ${year}`);
      return metrics;

    } catch (error) {
      this.logger.error(`Error obteniendo métricas anuales de facturas: ${error.message}`, error.stack);
      throw new HttpException(`Error obteniendo métricas anuales: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Obtiene métricas mensuales de gastos para un año específico
   * @param year - Año a consultar
   * @param enterpriseId - ID de la empresa
   * @returns Métricas mensuales de gastos
   */
  @Get('spents/yearly')
  @ApiOperation({ summary: 'Obtiene métricas mensuales de gastos para un año específico' })
  @ApiBearerAuth('auth_token')
  @ApiQuery({ name: 'year', description: 'Año a consultar (ej: 2025)', required: true })
  @ApiQuery({ name: 'enterpriseId', description: 'ID de la empresa', required: true })
  @ApiOkResponse({ description: 'Métricas mensuales de gastos calculadas' })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiInternalServerErrorResponse({ description: 'Error interno del servidor' })
  async getYearlySpentMetrics(
    @Query('year') year: string,
    @Query('enterpriseId') enterpriseId: string
  ): Promise<YearlyMetricsDto> {
    this.logger.log(`Solicitud de métricas anuales de gastos - Empresa: ${enterpriseId}, Año: ${year}`);

    // Validar parámetros requeridos
    if (!year || !enterpriseId) {
      throw new BadRequestException('Los parámetros year y enterpriseId son requeridos');
    }

    // Validar y parsear año
    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      throw new BadRequestException('El año debe ser un número válido entre 2000 y 2100');
    }

    try {
      // Obtener métricas anuales de gastos
      const metrics = await this.metricsService.getYearlySpentMetrics(
        yearNum,
        enterpriseId
      );

      this.logger.log(`Métricas anuales de gastos obtenidas exitosamente para empresa ${enterpriseId}, año ${year}`);
      return metrics;

    } catch (error) {
      this.logger.error(`Error obteniendo métricas anuales de gastos: ${error.message}`, error.stack);
      throw new HttpException(`Error obteniendo métricas anuales de gastos: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
