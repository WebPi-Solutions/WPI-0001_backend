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
import { RecurrentEarning } from './recurrent-earning.entity';
import { RecurrentEarningRepository } from './recurrent-earning-repository.service';

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

describe('RecurrentEarningRepository', () => {
  let recurrentEarningRepositoryService: RecurrentEarningRepository;
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
        RecurrentEarningRepository,
        {
          provide: getRepositoryToken(RecurrentEarning),
          useValue: typeOrmRepositoryMock,
        },
      ],
    }).compile();

    recurrentEarningRepositoryService = testingModule.get(RecurrentEarningRepository);
  });

  it('debería estar definido', () => {
    expect(recurrentEarningRepositoryService).toBeDefined();
  });

  describe('create', () => {
    it('persiste el ingreso recurrente', async () => {
      const earningToCreate = { name: 'Cuota mensual' } as RecurrentEarning;
      typeOrmRepositoryMock.save.mockResolvedValue({
        id: 'earning-uuid',
        ...earningToCreate,
      });

      const result = await recurrentEarningRepositoryService.create(earningToCreate);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith(earningToCreate);
      expect(result.id).toBe('earning-uuid');
    });
  });

  describe('findAll', () => {
    it('lista ingresos recurrentes paginados usando QueryBuilderService', async () => {
      const result = await recurrentEarningRepositoryService.findAll(
        1,
        10,
        'createdAt',
        'DESC',
        { enterpriseId: 'enterprise-uuid' },
        ['client'],
      );

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'recurrentEarning',
        expect.objectContaining({
          filter: { enterpriseId: 'enterprise-uuid' },
          relations: [
            {
              property: 'client',
              alias: 'client',
              isLeftJoinAndSelect: true,
            },
          ],
        }),
      );
      expect(result.total).toBe(0);
    });

    it('lista ingresos con valores por defecto y sin relaciones', async () => {
      await recurrentEarningRepositoryService.findAll();

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'recurrentEarning',
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          sort: 'createdAt',
          order: 'DESC',
          filter: {},
          relations: [],
        }),
      );
    });
  });

  describe('findById', () => {
    it('busca un ingreso recurrente por identificador', async () => {
      const foundEarning = { id: 'earning-uuid' } as RecurrentEarning;
      typeOrmRepositoryMock.findOne.mockResolvedValue(foundEarning);

      const result = await recurrentEarningRepositoryService.findById('earning-uuid', [
        'client',
      ]);

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'earning-uuid' },
        relations: ['client'],
      });
      expect(result).toEqual(foundEarning);
    });

    it('busca un ingreso recurrente sin relaciones', async () => {
      await recurrentEarningRepositoryService.findById('earning-uuid');

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'earning-uuid' },
        relations: undefined,
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si el ingreso recurrente no existe', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue(null);

      const thrownError = await expectHttpException(
        recurrentEarningRepositoryService.updateById('missing-id', {
          name: 'Nuevo',
        } as RecurrentEarning),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('fusiona y recarga el ingreso con relaciones', async () => {
      const existingEarning = { id: 'earning-uuid', name: 'Antiguo' } as RecurrentEarning;
      const payload = { name: 'Nuevo' } as RecurrentEarning;
      const reloadedEarning = { ...existingEarning, ...payload } as RecurrentEarning;

      typeOrmRepositoryMock.findOne
        .mockResolvedValueOnce(existingEarning)
        .mockResolvedValueOnce(reloadedEarning);
      typeOrmRepositoryMock.save.mockResolvedValue(reloadedEarning);

      const result = await recurrentEarningRepositoryService.updateById(
        'earning-uuid',
        payload,
      );

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith({
        ...existingEarning,
        ...payload,
      });
      expect(typeOrmRepositoryMock.findOne).toHaveBeenLastCalledWith({
        where: { id: 'earning-uuid' },
        relations: ['client', 'invoiceSeries', 'enterprise'],
      });
      expect(result).toEqual(reloadedEarning);
    });
  });

  describe('deleteById', () => {
    it('elimina el ingreso recurrente por identificador', async () => {
      const deleteResult = { affected: 1, raw: [] };
      typeOrmRepositoryMock.delete.mockResolvedValue(deleteResult);

      const result = await recurrentEarningRepositoryService.deleteById('earning-uuid');

      expect(typeOrmRepositoryMock.delete).toHaveBeenCalledWith('earning-uuid');
      expect(result).toEqual(deleteResult);
    });
  });
});
