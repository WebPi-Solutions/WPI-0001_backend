import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceSeriesRepository } from 'src/entities/invoice-series/invoice-series-repository.service';
import { InvoiceSeries } from 'src/entities/invoice-series/invoice-series.entity';
import { InvoiceSeriesService } from './invoice-series.service';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';

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
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

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
        {
          provide: EnterpriseAccessService,
          useValue: { assertCurrentEntityAccessible: jest.fn() },
        },
      ],
    }).compile();

    service = testingModule.get(InvoiceSeriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('rechaza una serie duplicada en la misma empresa', async () => {
      const invoiceSeries = buildInvoiceSeries();
      invoiceSeriesRepository.findBySeriesAndEnterpriseId.mockResolvedValue(invoiceSeries);

      await expect(service.create(invoiceSeries)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: `La serie de facturas ${invoiceSeries.series} ya existe para la empresa ${invoiceSeries.enterpriseId}`,
      });
      expect(invoiceSeriesRepository.create).not.toHaveBeenCalled();
    });

    it('persiste la serie cuando el código es único en la empresa', async () => {
      const invoiceSeries = buildInvoiceSeries();
      invoiceSeriesRepository.findBySeriesAndEnterpriseId.mockResolvedValue(null);
      invoiceSeriesRepository.create.mockResolvedValue(invoiceSeries);

      await expect(service.create(invoiceSeries)).resolves.toEqual(invoiceSeries);
      expect(invoiceSeriesRepository.findBySeriesAndEnterpriseId).toHaveBeenCalledWith(
        invoiceSeries.series,
        invoiceSeries.enterpriseId,
      );
      expect(invoiceSeriesRepository.create).toHaveBeenCalledWith(invoiceSeries);
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al persistir');
      invoiceSeriesRepository.findBySeriesAndEnterpriseId.mockResolvedValue(null);
      invoiceSeriesRepository.create.mockRejectedValue(repositoryError);

      await expect(service.create(buildInvoiceSeries())).rejects.toBe(repositoryError);
    });
  });

  describe('findAll', () => {
    it('delega la consulta paginada al repositorio', async () => {
      invoiceSeriesRepository.findAll.mockResolvedValue(emptyPaginatedResponse);
      const filter = { enterpriseId: 'enterprise-uuid' };

      await expect(service.findAll(1, 10, 'series', 'ASC', filter)).resolves.toEqual(
        emptyPaginatedResponse,
      );
      expect(invoiceSeriesRepository.findAll).toHaveBeenCalledWith(
        1,
        10,
        'series',
        'ASC',
        filter,
        undefined,
      );
    });

    it('incluye relaciones cuando se informan', async () => {
      const paginatedWithItems = {
        items: [buildInvoiceSeries()],
        total: 1,
        currentPage: 1,
        totalPages: 1,
      };
      invoiceSeriesRepository.findAll.mockResolvedValue(paginatedWithItems);

      await expect(
        service.findAll(2, 20, 'series', 'DESC', {}, ['invoices', 'enterprise']),
      ).resolves.toEqual(paginatedWithItems);
    });
  });

  describe('findById', () => {
    it('devuelve la serie cuando existe', async () => {
      const existing = buildInvoiceSeries();
      invoiceSeriesRepository.findById.mockResolvedValue(existing);

      await expect(service.findById(seriesId, ['invoices'])).resolves.toEqual(existing);
      expect(invoiceSeriesRepository.findById).toHaveBeenCalledWith(seriesId, ['invoices']);
    });

    it('consulta sin relaciones cuando no se informan', async () => {
      const existing = buildInvoiceSeries();
      invoiceSeriesRepository.findById.mockResolvedValue(existing);

      await expect(service.findById(seriesId)).resolves.toEqual(existing);
      expect(invoiceSeriesRepository.findById).toHaveBeenCalledWith(seriesId, undefined);
    });

    it('lanza 404 cuando la serie no existe', async () => {
      invoiceSeriesRepository.findById.mockResolvedValue(null);

      await expect(service.findById(seriesId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Serie de facturas no encontrada',
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si la serie no existe', async () => {
      invoiceSeriesRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateById(seriesId, buildInvoiceSeries()),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: `La serie de facturas ${seriesId} no existe`,
      });
      expect(invoiceSeriesRepository.updateById).not.toHaveBeenCalled();
    });

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

    it('permite actualizar otros datos aunque ya tenga facturas si el código no cambia', async () => {
      const existing = buildInvoiceSeries({
        invoices: [{ id: 'invoice-uuid' }] as InvoiceSeries['invoices'],
      });
      const updated = buildInvoiceSeries({ series: 'A', description: 'Serie A' });
      invoiceSeriesRepository.findById.mockResolvedValue(existing);
      invoiceSeriesRepository.updateById.mockResolvedValue(updated);

      await expect(service.updateById(seriesId, updated)).resolves.toEqual(updated);
    });

    it('permite actualizar otros datos de una serie sin facturas', async () => {
      const existing = buildInvoiceSeries();
      const updated = buildInvoiceSeries({ series: 'B' });
      invoiceSeriesRepository.findById.mockResolvedValue(existing);
      invoiceSeriesRepository.updateById.mockResolvedValue(updated);

      await expect(service.updateById(seriesId, updated)).resolves.toEqual(updated);
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al actualizar');
      invoiceSeriesRepository.findById.mockResolvedValue(buildInvoiceSeries());
      invoiceSeriesRepository.updateById.mockRejectedValue(repositoryError);

      await expect(service.updateById(seriesId, buildInvoiceSeries())).rejects.toBe(
        repositoryError,
      );
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

    it('permite el borrado si recurrentEarnings no está cargado', async () => {
      invoiceSeriesRepository.findById.mockResolvedValue(
        buildInvoiceSeries({ recurrentEarnings: undefined }),
      );
      invoiceSeriesRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.deleteById(seriesId)).resolves.toEqual({ affected: 1, raw: [] });
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al eliminar');
      invoiceSeriesRepository.findById.mockResolvedValue(buildInvoiceSeries());
      invoiceSeriesRepository.deleteById.mockRejectedValue(repositoryError);

      await expect(service.deleteById(seriesId)).rejects.toBe(repositoryError);
    });
  });
});
