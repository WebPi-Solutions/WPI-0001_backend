import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceSeriesRepository } from 'src/entities/invoice-series/invoice-series-repository.service';
import { InvoiceSeries } from 'src/entities/invoice-series/invoice-series.entity';
import { InvoiceSeriesService } from './invoice-series.service';

describe('InvoiceSeriesService', () => {
  let service: InvoiceSeriesService;
  let invoiceSeriesRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
    findBySeriesAndEnterpriseId: jest.Mock;
  };

  const seriesId = 'series-uuid';

  /**
   * Construye una serie de facturas de prueba.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad InvoiceSeries simulada
   */
  const buildInvoiceSeries = (overrides: Partial<InvoiceSeries> = {}): InvoiceSeries =>
    ({
      id: seriesId,
      series: 'A',
      enterpriseId: 'enterprise-uuid',
      invoices: [],
      recurrentEarnings: [],
      ...overrides,
    }) as InvoiceSeries;

  beforeEach(async () => {
    invoiceSeriesRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
      findBySeriesAndEnterpriseId: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceSeriesService,
        { provide: InvoiceSeriesRepository, useValue: invoiceSeriesRepository },
      ],
    }).compile();

    service = testingModule.get(InvoiceSeriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateById', () => {
    it('impide cambiar el código de serie si ya hay facturas emitidas', async () => {
      invoiceSeriesRepository.findById.mockResolvedValue(
        buildInvoiceSeries({
          invoices: [{ id: 'invoice-uuid' }] as InvoiceSeries['invoices'],
        }),
      );

      await expect(
        service.updateById(seriesId, buildInvoiceSeries({ series: 'B' })),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message:
          'No se puede modificar la identificación de la serie de facturas porque ya tiene facturas emitidas',
      });
      expect(invoiceSeriesRepository.updateById).not.toHaveBeenCalled();
    });

    it('permite actualizar otros datos de una serie sin facturas', async () => {
      const existing = buildInvoiceSeries();
      const updated = buildInvoiceSeries({ series: 'B' });
      invoiceSeriesRepository.findById.mockResolvedValue(existing);
      invoiceSeriesRepository.updateById.mockResolvedValue(updated);

      await expect(service.updateById(seriesId, updated)).resolves.toEqual(updated);
    });
  });

  describe('deleteById', () => {
    it('lanza 404 si la serie no existe', async () => {
      invoiceSeriesRepository.findById.mockResolvedValue(null);

      await expect(service.deleteById(seriesId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });

    it('bloquea el borrado si la serie ya tiene facturas', async () => {
      invoiceSeriesRepository.findById.mockResolvedValue(
        buildInvoiceSeries({
          invoices: [{ id: 'invoice-uuid' }] as InvoiceSeries['invoices'],
        }),
      );

      await expect(service.deleteById(seriesId)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'No se puede eliminar la serie de facturas porque ya tiene facturas emitidas',
      });
      expect(invoiceSeriesRepository.deleteById).not.toHaveBeenCalled();
    });

    it('bloquea el borrado si hay ingresos recurrentes asociados', async () => {
      invoiceSeriesRepository.findById.mockResolvedValue(
        buildInvoiceSeries({
          recurrentEarnings: [{ id: 'recurrent-uuid' }] as InvoiceSeries['recurrentEarnings'],
        }),
      );

      await expect(service.deleteById(seriesId)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message:
          'No se puede eliminar la serie de facturas porque tiene ingresos recurrentes asociados',
      });
      expect(invoiceSeriesRepository.deleteById).not.toHaveBeenCalled();
    });

    it('elimina la serie cuando no tiene facturas ni ingresos recurrentes', async () => {
      invoiceSeriesRepository.findById.mockResolvedValue(buildInvoiceSeries());
      invoiceSeriesRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.deleteById(seriesId)).resolves.toEqual({ affected: 1, raw: [] });
    });
  });
});
