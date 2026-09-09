import { BadRequestException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

describe('MetricsController', () => {
  let controller: MetricsController;
  let metricsService: {
    getInvoiceSubtotalsByStatus: jest.Mock;
    getSpentSubtotalsByStatus: jest.Mock;
    getQuoteSubtotalsByStatus: jest.Mock;
    getUserCountsByStatus: jest.Mock;
    getClientCountsByType: jest.Mock;
    getSupplierCountsByType: jest.Mock;
    getInvoiceSeriesListCounts: jest.Mock;
    getInvoicesMetrics: jest.Mock;
    getSpentMetrics: jest.Mock;
    getYearlyInvoiceMetrics: jest.Mock;
    getYearlySpentMetrics: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';

  beforeEach(async () => {
    metricsService = {
      getInvoiceSubtotalsByStatus: jest.fn().mockResolvedValue({ total: { count: 0, subtotal: 0 } }),
      getSpentSubtotalsByStatus: jest.fn().mockResolvedValue({}),
      getQuoteSubtotalsByStatus: jest.fn().mockResolvedValue({}),
      getUserCountsByStatus: jest.fn().mockResolvedValue({}),
      getClientCountsByType: jest.fn().mockResolvedValue({}),
      getSupplierCountsByType: jest.fn().mockResolvedValue({}),
      getInvoiceSeriesListCounts: jest.fn().mockResolvedValue({}),
      getInvoicesMetrics: jest.fn().mockResolvedValue({}),
      getSpentMetrics: jest.fn().mockResolvedValue({}),
      getYearlyInvoiceMetrics: jest.fn().mockResolvedValue({}),
      getYearlySpentMetrics: jest.fn().mockResolvedValue({}),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [{ provide: MetricsService, useValue: metricsService }],
    }).compile();

    controller = testingModule.get(MetricsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getInvoiceSubtotalsByStatus', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.getInvoiceSubtotalsByStatus('')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(metricsService.getInvoiceSubtotalsByStatus).not.toHaveBeenCalled();
    });

    it('reenvía el filtro JSON válido al servicio', async () => {
      await controller.getInvoiceSubtotalsByStatus(
        enterpriseId,
        JSON.stringify({ recurrentEarningId: 'recurrent-uuid' }),
      );

      expect(metricsService.getInvoiceSubtotalsByStatus).toHaveBeenCalledWith(enterpriseId, {
        recurrentEarningId: 'recurrent-uuid',
      });
    });

    it('ignora un filtro JSON inválido y consulta sin filtros', async () => {
      await controller.getInvoiceSubtotalsByStatus(enterpriseId, '{no-es-json');

      expect(metricsService.getInvoiceSubtotalsByStatus).toHaveBeenCalledWith(enterpriseId, {});
    });

    it('traduce un error del servicio a 500', async () => {
      metricsService.getInvoiceSubtotalsByStatus.mockRejectedValue(new Error('fallo SQL'));

      await expect(controller.getInvoiceSubtotalsByStatus(enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error obteniendo subtotales por estado: fallo SQL',
      });
    });
  });

  describe('getInvoiceSeriesListCounts', () => {
    /**
     * Invoca el endpoint de conteos de series con rangos de mes y semana.
     * @param overrides - Parámetros a sobrescribir
     * @returns Promesa del controlador
     */
    const invokeListCounts = (overrides: {
      enterpriseId?: string;
      filter?: string;
      monthFrom?: string;
      monthTo?: string;
      weekFrom?: string;
      weekTo?: string;
    } = {}) =>
      controller.getInvoiceSeriesListCounts(
        overrides.enterpriseId ?? enterpriseId,
        overrides.filter,
        overrides.monthFrom ?? '2026-09-01',
        overrides.monthTo ?? '2026-09-30',
        overrides.weekFrom ?? '2026-09-01',
        overrides.weekTo ?? '2026-09-07',
      );

    it('exige enterpriseId', async () => {
      await expect(invokeListCounts({ enterpriseId: '' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza una fecha que no cumple YYYY-MM-DD', async () => {
      await expect(invokeListCounts({ monthFrom: '09-01-2026' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(metricsService.getInvoiceSeriesListCounts).not.toHaveBeenCalled();
    });

    it('rechaza un calendario imposible aunque el formato sea correcto', async () => {
      await expect(invokeListCounts({ weekTo: '2026-13-40' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('recorta espacios y reenvía los rangos al servicio', async () => {
      await invokeListCounts({
        monthFrom: ' 2026-09-01 ',
        monthTo: ' 2026-09-30 ',
        weekFrom: ' 2026-09-01 ',
        weekTo: ' 2026-09-07 ',
      });

      expect(metricsService.getInvoiceSeriesListCounts).toHaveBeenCalledWith(
        enterpriseId,
        {},
        { from: '2026-09-01', to: '2026-09-30' },
        { from: '2026-09-01', to: '2026-09-07' },
      );
    });
  });

  describe('getInvoicesMetrics', () => {
    it('exige startDate, endDate y enterpriseId', async () => {
      await expect(controller.getInvoicesMetrics('', '2026-01-31', enterpriseId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(controller.getInvoicesMetrics('2026-01-01', '2026-01-31', '')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(metricsService.getInvoicesMetrics).not.toHaveBeenCalled();
    });

    it('rechaza fechas que no se pueden parsear', async () => {
      await expect(
        controller.getInvoicesMetrics('no-es-fecha', '2026-01-31', enterpriseId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getYearlyInvoiceMetrics', () => {
    it('exige year y enterpriseId', async () => {
      await expect(controller.getYearlyInvoiceMetrics('', enterpriseId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza un año fuera del rango 2000-2100', async () => {
      await expect(controller.getYearlyInvoiceMetrics('1999', enterpriseId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(controller.getYearlyInvoiceMetrics('2101', enterpriseId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(metricsService.getYearlyInvoiceMetrics).not.toHaveBeenCalled();
    });

    it('parsea el año y lo reenvía al servicio', async () => {
      await controller.getYearlyInvoiceMetrics('2026', enterpriseId);

      expect(metricsService.getYearlyInvoiceMetrics).toHaveBeenCalledWith(2026, enterpriseId);
    });
  });
});
