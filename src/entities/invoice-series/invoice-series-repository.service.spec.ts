jest.mock('src/helpers/query-builder/query-builder.service', () => ({
  QueryBuilderService: {
    getCount: jest.fn().mockResolvedValue(0),
    getPaginatedResults: jest.fn().mockResolvedValue({
      items: [],
      total: 0,
      currentPage: 1,
      totalPages: 0,
    }),
  },
}));

import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryBuilderService } from 'src/helpers/query-builder/query-builder.service';
import { InvoiceSeries } from './invoice-series.entity';
import { InvoiceSeriesRepository } from './invoice-series-repository.service';

/**
 * Extrae la HttpException lanzada por una promesa rechazada.
 * @param rejectedPromise - Promesa que debe fallar
 * @returns La excepción HTTP capturada
 */
async function expectHttpException(
  rejectedPromise: Promise<unknown>,
): Promise<HttpException> {
  try {
    await rejectedPromise;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HttpException);
    return error as HttpException;
  }
  throw new Error('Se esperaba una HttpException');
}

describe('InvoiceSeriesRepository', () => {
  let invoiceSeriesRepositoryService: InvoiceSeriesRepository;
  let typeOrmRepositoryMock: {
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
  };

  /**
   * Crea el módulo de pruebas con repositorio TypeORM simulado.
   */
  beforeEach(async () => {
    jest.clearAllMocks();
    (QueryBuilderService.getCount as jest.Mock).mockResolvedValue(0);
    (QueryBuilderService.getPaginatedResults as jest.Mock).mockResolvedValue({
      items: [],
      total: 0,
      currentPage: 1,
      totalPages: 0,
    });

    typeOrmRepositoryMock = {
      save: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceSeriesRepository,
        {
          provide: getRepositoryToken(InvoiceSeries),
          useValue: typeOrmRepositoryMock,
        },
      ],
    }).compile();

    invoiceSeriesRepositoryService = testingModule.get(InvoiceSeriesRepository);
  });

  it('debería estar definido', () => {
    expect(invoiceSeriesRepositoryService).toBeDefined();
  });

  describe('create', () => {
    it('persiste la serie de factura mediante save', async () => {
      const seriesToCreate = { series: 'A' } as InvoiceSeries;
      typeOrmRepositoryMock.save.mockResolvedValue({ id: 'series-uuid', ...seriesToCreate });

      const result = await invoiceSeriesRepositoryService.create(seriesToCreate);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith(seriesToCreate);
      expect(result.id).toBe('series-uuid');
    });
  });

  describe('count', () => {
    it('cuenta series con QueryBuilderService', async () => {
      (QueryBuilderService.getCount as jest.Mock).mockResolvedValue(4);

      const result = await invoiceSeriesRepositoryService.count({
        enterpriseId: 'enterprise-uuid',
      });

      expect(QueryBuilderService.getCount).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'invoiceSeries',
        { enterpriseId: 'enterprise-uuid' },
        undefined,
      );
      expect(result).toBe(4);
    });

    it('cuenta series con relaciones y valores por defecto', async () => {
      await invoiceSeriesRepositoryService.count({}, ['enterprise']);
      await invoiceSeriesRepositoryService.count();

      expect(QueryBuilderService.getCount).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'invoiceSeries',
        {},
        [
          {
            property: 'enterprise',
            alias: 'enterprise',
            isLeftJoinAndSelect: false,
          },
        ],
      );
      expect(QueryBuilderService.getCount).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'invoiceSeries',
        {},
        undefined,
      );
    });
  });

  describe('getListViewCounts', () => {
    it('devuelve total, este mes y última semana', async () => {
      (QueryBuilderService.getCount as jest.Mock)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(2);

      const result = await invoiceSeriesRepositoryService.getListViewCounts(
        'enterprise-uuid',
        {},
        { from: '2026-09-01', to: '2026-09-30' },
        { from: '2026-09-03', to: '2026-09-10' },
      );

      expect(QueryBuilderService.getCount).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ total: 10, thisMonth: 4, lastWeek: 2 });
    });
  });

  describe('findAll', () => {
    it('lista series paginadas usando QueryBuilderService', async () => {
      const result = await invoiceSeriesRepositoryService.findAll(
        1,
        10,
        'series',
        'ASC',
        {},
        ['enterprise'],
      );

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'invoiceSeries',
        expect.objectContaining({
          relations: [
            {
              property: 'enterprise',
              alias: 'enterprise',
              isLeftJoinAndSelect: true,
            },
          ],
        }),
      );
      expect(result.total).toBe(0);
    });

    it('lista series con valores por defecto y sin relaciones', async () => {
      await invoiceSeriesRepositoryService.findAll();

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'invoiceSeries',
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          sort: 'series',
          order: 'ASC',
          filter: {},
          relations: [],
        }),
      );
    });
  });

  describe('findById', () => {
    it('busca una serie por identificador', async () => {
      const foundSeries = { id: 'series-uuid' } as InvoiceSeries;
      typeOrmRepositoryMock.findOne.mockResolvedValue(foundSeries);

      const result = await invoiceSeriesRepositoryService.findById('series-uuid');

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'series-uuid' },
        relations: undefined,
      });
      expect(result).toEqual(foundSeries);
    });

    it('busca una serie incluyendo relaciones', async () => {
      await invoiceSeriesRepositoryService.findById('series-uuid', ['enterprise']);

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'series-uuid' },
        relations: ['enterprise'],
      });
    });
  });

  describe('findBySeriesAndEnterpriseId', () => {
    it('busca una serie por código y empresa', async () => {
      const foundSeries = { id: 'series-uuid', series: 'A' } as InvoiceSeries;
      typeOrmRepositoryMock.findOne.mockResolvedValue(foundSeries);

      const result = await invoiceSeriesRepositoryService.findBySeriesAndEnterpriseId(
        'A',
        'enterprise-uuid',
      );

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { series: 'A', enterpriseId: 'enterprise-uuid' },
      });
      expect(result).toEqual(foundSeries);
    });
  });

  describe('updateById', () => {
    it('lanza 404 si la serie no existe', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue(null);

      const thrownError = await expectHttpException(
        invoiceSeriesRepositoryService.updateById('missing-id', {
          series: 'B',
        } as InvoiceSeries),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('fusiona y persiste la serie existente', async () => {
      const existingSeries = { id: 'series-uuid', series: 'A' } as InvoiceSeries;
      const payload = { series: 'B' } as InvoiceSeries;
      const reloadedSeries = { ...existingSeries, ...payload } as InvoiceSeries;

      typeOrmRepositoryMock.findOne
        .mockResolvedValueOnce(existingSeries)
        .mockResolvedValueOnce(reloadedSeries);
      typeOrmRepositoryMock.save.mockResolvedValue(reloadedSeries);

      const result = await invoiceSeriesRepositoryService.updateById('series-uuid', payload);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith({
        ...existingSeries,
        ...payload,
      });
      expect(result).toEqual(reloadedSeries);
    });
  });

  describe('deleteById', () => {
    it('elimina la serie por identificador', async () => {
      const deleteResult = { affected: 1, raw: [] };
      typeOrmRepositoryMock.delete.mockResolvedValue(deleteResult);

      const result = await invoiceSeriesRepositoryService.deleteById('series-uuid');

      expect(typeOrmRepositoryMock.delete).toHaveBeenCalledWith('series-uuid');
      expect(result).toEqual(deleteResult);
    });
  });
});
