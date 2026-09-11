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
    getAiRequestCountsByType: jest.Mock;
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
      getAiRequestCountsByType: jest.fn().mockResolvedValue({}),
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

    it('ignora un filtro JSON inválido y consulta sin filtros', async () => {
      await invokeListCounts({ filter: '{no-es-json' });

      expect(metricsService.getInvoiceSeriesListCounts).toHaveBeenCalledWith(
        enterpriseId,
        {},
        { from: '2026-09-01', to: '2026-09-30' },
        { from: '2026-09-01', to: '2026-09-07' },
      );
    });

    it('reenvía un filtro JSON válido al servicio', async () => {
      await invokeListCounts({ filter: JSON.stringify({ series_ilike: 'A' }) });

      expect(metricsService.getInvoiceSeriesListCounts).toHaveBeenCalledWith(
        enterpriseId,
        { series_ilike: 'A' },
        { from: '2026-09-01', to: '2026-09-30' },
        { from: '2026-09-01', to: '2026-09-07' },
      );
    });

    it('rechaza un rango de fecha vacío', async () => {
      await expect(invokeListCounts({ weekFrom: '' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('traduce un error del servicio a 500', async () => {
      metricsService.getInvoiceSeriesListCounts.mockRejectedValue(new Error('fallo series'));

      await expect(invokeListCounts()).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error obteniendo conteos de series de factura: fallo series',
      });
    });
  });

  describe('getInvoicesMetrics', () => {
    it('exige startDate, endDate y enterpriseId', async () => {
      await expect(controller.getInvoicesMetrics('', '2026-01-31', enterpriseId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        controller.getInvoicesMetrics('2026-01-01', '', enterpriseId),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.getInvoicesMetrics('2026-01-01', '2026-01-31', '')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(metricsService.getInvoicesMetrics).not.toHaveBeenCalled();
    });

    it('rechaza fechas que no se pueden parsear', async () => {
      await expect(
        controller.getInvoicesMetrics('no-es-fecha', '2026-01-31', enterpriseId),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        controller.getInvoicesMetrics('2026-01-01', 'no-es-fecha', enterpriseId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reenvía fechas parseadas al servicio', async () => {
      await controller.getInvoicesMetrics('2026-01-01', '2026-01-31', enterpriseId);

      expect(metricsService.getInvoicesMetrics).toHaveBeenCalledWith(
        new Date('2026-01-01'),
        new Date('2026-01-31'),
        enterpriseId,
      );
    });

    it('traduce un error del servicio a 500', async () => {
      metricsService.getInvoicesMetrics.mockRejectedValue(new Error('fallo facturas'));

      await expect(
        controller.getInvoicesMetrics('2026-01-01', '2026-01-31', enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error obteniendo métricas de facturas emitidas: fallo facturas',
      });
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

    it('exige enterpriseId', async () => {
      await expect(controller.getYearlyInvoiceMetrics('2026', '')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza un año que no es numérico', async () => {
      await expect(controller.getYearlyInvoiceMetrics('abc', enterpriseId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('parsea el año y lo reenvía al servicio', async () => {
      await controller.getYearlyInvoiceMetrics('2026', enterpriseId);

      expect(metricsService.getYearlyInvoiceMetrics).toHaveBeenCalledWith(2026, enterpriseId);
    });

    it('traduce un error del servicio a 500', async () => {
      metricsService.getYearlyInvoiceMetrics.mockRejectedValue(new Error('fallo anual'));

      await expect(controller.getYearlyInvoiceMetrics('2026', enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error obteniendo métricas anuales: fallo anual',
      });
    });
  });

  describe('conteos y subtotales restantes', () => {
    it('exige enterpriseId en subtotales de gastos y presupuestos', async () => {
      await expect(controller.getSpentSubtotalsByStatus('')).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.getQuoteSubtotalsByStatus('')).rejects.toBeInstanceOf(BadRequestException);
      expect(metricsService.getSpentSubtotalsByStatus).not.toHaveBeenCalled();
      expect(metricsService.getQuoteSubtotalsByStatus).not.toHaveBeenCalled();
    });

    it('reenvía filtros JSON de gastos, presupuestos y conteos de usuarios', async () => {
      const filterJson = JSON.stringify({ name_ilike: 'demo' });

      await controller.getSpentSubtotalsByStatus(enterpriseId, filterJson);
      await controller.getQuoteSubtotalsByStatus(enterpriseId, filterJson);
      await controller.getUserCountsByStatus(enterpriseId, filterJson);

      expect(metricsService.getSpentSubtotalsByStatus).toHaveBeenCalledWith(enterpriseId, {
        name_ilike: 'demo',
      });
      expect(metricsService.getQuoteSubtotalsByStatus).toHaveBeenCalledWith(enterpriseId, {
        name_ilike: 'demo',
      });
      expect(metricsService.getUserCountsByStatus).toHaveBeenCalledWith(enterpriseId, {
        name_ilike: 'demo',
      });
    });

    it('exige enterpriseId en conteos de clientes, proveedores y solicitudes de IA', async () => {
      await expect(controller.getClientCountsByType('')).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.getSupplierCountsByType('')).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.getAiRequestCountsByType('')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('delega conteos de clientes, proveedores y solicitudes de IA con filtro vacío', async () => {
      await controller.getClientCountsByType(enterpriseId);
      await controller.getSupplierCountsByType(enterpriseId);
      await controller.getAiRequestCountsByType(enterpriseId);

      expect(metricsService.getClientCountsByType).toHaveBeenCalledWith(enterpriseId, {});
      expect(metricsService.getSupplierCountsByType).toHaveBeenCalledWith(enterpriseId, {});
      expect(metricsService.getAiRequestCountsByType).toHaveBeenCalledWith(enterpriseId, {});
    });

    it('traduce un error de conteo de usuarios a 500', async () => {
      metricsService.getUserCountsByStatus.mockRejectedValue(new Error('fallo usuarios'));

      await expect(controller.getUserCountsByStatus(enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error obteniendo conteos de usuarios: fallo usuarios',
      });
    });

    it('exige enterpriseId en conteos de usuarios', async () => {
      await expect(controller.getUserCountsByStatus('')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ignora filtros JSON inválidos en gastos, presupuestos, usuarios, clientes y proveedores', async () => {
      await controller.getSpentSubtotalsByStatus(enterpriseId, '{no-es-json');
      await controller.getQuoteSubtotalsByStatus(enterpriseId, '{no-es-json');
      await controller.getUserCountsByStatus(enterpriseId, '{no-es-json');
      await controller.getClientCountsByType(enterpriseId, '{no-es-json');
      await controller.getSupplierCountsByType(enterpriseId, '{no-es-json');
      await controller.getAiRequestCountsByType(enterpriseId, '{no-es-json');

      expect(metricsService.getSpentSubtotalsByStatus).toHaveBeenCalledWith(enterpriseId, {});
      expect(metricsService.getQuoteSubtotalsByStatus).toHaveBeenCalledWith(enterpriseId, {});
      expect(metricsService.getUserCountsByStatus).toHaveBeenCalledWith(enterpriseId, {});
      expect(metricsService.getClientCountsByType).toHaveBeenCalledWith(enterpriseId, {});
      expect(metricsService.getSupplierCountsByType).toHaveBeenCalledWith(enterpriseId, {});
      expect(metricsService.getAiRequestCountsByType).toHaveBeenCalledWith(enterpriseId, {});
    });

    it('reenvía filtros JSON de clientes, proveedores y solicitudes de IA', async () => {
      const filterJson = JSON.stringify({ type: 'company' });
      const aiRequestFilterJson = JSON.stringify({ type: 'get_spent_issuer' });

      await controller.getClientCountsByType(enterpriseId, filterJson);
      await controller.getSupplierCountsByType(enterpriseId, filterJson);
      await controller.getAiRequestCountsByType(enterpriseId, aiRequestFilterJson);

      expect(metricsService.getClientCountsByType).toHaveBeenCalledWith(enterpriseId, {
        type: 'company',
      });
      expect(metricsService.getSupplierCountsByType).toHaveBeenCalledWith(enterpriseId, {
        type: 'company',
      });
      expect(metricsService.getAiRequestCountsByType).toHaveBeenCalledWith(enterpriseId, {
        type: 'get_spent_issuer',
      });
    });

    it('traduce errores de subtotales y conteos restantes a 500', async () => {
      metricsService.getSpentSubtotalsByStatus.mockRejectedValue(new Error('fallo gastos'));
      metricsService.getQuoteSubtotalsByStatus.mockRejectedValue(new Error('fallo presupuestos'));
      metricsService.getClientCountsByType.mockRejectedValue(new Error('fallo clientes'));
      metricsService.getSupplierCountsByType.mockRejectedValue(new Error('fallo proveedores'));
      metricsService.getAiRequestCountsByType.mockRejectedValue(new Error('fallo solicitudes IA'));

      await expect(controller.getSpentSubtotalsByStatus(enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error obteniendo subtotales por estado de gastos: fallo gastos',
      });
      await expect(controller.getQuoteSubtotalsByStatus(enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error obteniendo subtotales por estado de presupuestos: fallo presupuestos',
      });
      await expect(controller.getClientCountsByType(enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error obteniendo conteos de clientes: fallo clientes',
      });
      await expect(controller.getSupplierCountsByType(enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error obteniendo conteos de proveedores: fallo proveedores',
      });
      await expect(controller.getAiRequestCountsByType(enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error obteniendo conteos de solicitudes de IA: fallo solicitudes IA',
      });
    });
  });

  describe('getSpentMetrics', () => {
    it('exige startDate, endDate y enterpriseId', async () => {
      await expect(controller.getSpentMetrics('', '2026-01-31', enterpriseId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(controller.getSpentMetrics('2026-01-01', '', enterpriseId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(controller.getSpentMetrics('2026-01-01', '2026-01-31', '')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(metricsService.getSpentMetrics).not.toHaveBeenCalled();
    });

    it('rechaza fechas que no se pueden parsear', async () => {
      await expect(
        controller.getSpentMetrics('no-es-fecha', '2026-01-31', enterpriseId),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        controller.getSpentMetrics('2026-01-01', 'no-es-fecha', enterpriseId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reenvía fechas parseadas al servicio', async () => {
      await controller.getSpentMetrics('2026-01-01', '2026-01-31', enterpriseId);

      expect(metricsService.getSpentMetrics).toHaveBeenCalledWith(
        new Date('2026-01-01'),
        new Date('2026-01-31'),
        enterpriseId,
      );
    });

    it('traduce un error del servicio a 500', async () => {
      metricsService.getSpentMetrics.mockRejectedValue(new Error('fallo gastos periodo'));

      await expect(
        controller.getSpentMetrics('2026-01-01', '2026-01-31', enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error obteniendo métricas de gastos recibidos: fallo gastos periodo',
      });
    });
  });

  describe('getYearlySpentMetrics', () => {
    it('exige year y enterpriseId', async () => {
      await expect(controller.getYearlySpentMetrics('', enterpriseId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(controller.getYearlySpentMetrics('2026', '')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza un año fuera del rango 2000-2100 o no numérico', async () => {
      await expect(controller.getYearlySpentMetrics('1999', enterpriseId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(controller.getYearlySpentMetrics('2101', enterpriseId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(controller.getYearlySpentMetrics('abc', enterpriseId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(metricsService.getYearlySpentMetrics).not.toHaveBeenCalled();
    });

    it('parsea el año y lo reenvía al servicio', async () => {
      await controller.getYearlySpentMetrics('2026', enterpriseId);

      expect(metricsService.getYearlySpentMetrics).toHaveBeenCalledWith(2026, enterpriseId);
    });

    it('traduce un error del servicio a 500', async () => {
      metricsService.getYearlySpentMetrics.mockRejectedValue(new Error('fallo anual gastos'));

      await expect(controller.getYearlySpentMetrics('2026', enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error obteniendo métricas anuales de gastos: fallo anual gastos',
      });
    });
  });
});
