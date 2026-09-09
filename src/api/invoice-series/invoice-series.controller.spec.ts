import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceSeries } from 'src/entities/invoice-series/invoice-series.entity';
import { InvoiceSeriesController } from './invoice-series.controller';
import { InvoiceSeriesService } from './invoice-series.service';

describe('InvoiceSeriesController', () => {
  let controller: InvoiceSeriesController;
  let invoiceSeriesService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';

  beforeEach(async () => {
    invoiceSeriesService = {
      create: jest.fn().mockResolvedValue({ id: 'series-uuid' }),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0, currentPage: 1, totalPages: 0 }),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [InvoiceSeriesController],
      providers: [{ provide: InvoiceSeriesService, useValue: invoiceSeriesService }],
    }).compile();

    controller = testingModule.get(InvoiceSeriesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('exige enterpriseId', async () => {
      await expect(
        controller.create('', { series: 'A' } as InvoiceSeries),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(invoiceSeriesService.create).not.toHaveBeenCalled();
    });

    it('sobrescribe el enterpriseId del cuerpo con el de la query para evitar spoofing', async () => {
      const invoiceSeries = {
        series: 'A',
        enterpriseId: 'empresa-atacante',
      } as InvoiceSeries;

      await controller.create(enterpriseId, invoiceSeries);

      expect(invoiceSeries.enterpriseId).toBe(enterpriseId);
      expect(invoiceSeriesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          series: 'A',
          enterpriseId,
        }),
      );
    });
  });

  describe('findAll', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findAll('')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      expect(invoiceSeriesService.findAll).not.toHaveBeenCalled();
    });

    it('impide que el filtro JSON sustituya el enterpriseId de la query', async () => {
      await controller.findAll(
        enterpriseId,
        1,
        10,
        'series',
        'ASC',
        JSON.stringify({ enterpriseId: 'empresa-atacante', series: 'A' }),
      );

      expect(invoiceSeriesService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'series',
        'ASC',
        { enterpriseId, series: 'A' },
        [],
      );
    });

    it('conserva el enterpriseId de la query si el filtro JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId, 2, 25, 'createdAt', 'DESC', '{no-es-json');

      expect(invoiceSeriesService.findAll).toHaveBeenCalledWith(
        2,
        25,
        'createdAt',
        'DESC',
        { enterpriseId },
        [],
      );
    });
  });
});
