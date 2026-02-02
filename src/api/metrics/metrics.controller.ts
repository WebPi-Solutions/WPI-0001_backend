import { Controller, Get, Query, Logger, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { FinancialMetricsDto, YearlyMetricsDto } from './dto';
import { ApiBadRequestResponse, ApiBearerAuth, ApiInternalServerErrorResponse, ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';

@Controller('metrics')
export class MetricsController {
  private readonly logger = new Logger(MetricsController.name);

  constructor(private readonly metricsService: MetricsService) {}

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
