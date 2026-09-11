jest.mock('src/common/helpers/query-builder/query-builder.service', () => ({
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
import { QueryBuilderService } from 'src/common/helpers/query-builder/query-builder.service';
import { AiRequest, AiRequestType } from './ai-request.entity';
import { AiRequestRepository } from './ai-request-repository.service';

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

describe('AiRequestRepository', () => {
  let aiRequestRepositoryService: AiRequestRepository;
  let typeOrmRepositoryMock: {
    save: jest.Mock;
    findOne: jest.Mock;
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
    (QueryBuilderService.getCount as jest.Mock).mockResolvedValue(0);

    typeOrmRepositoryMock = {
      save: jest.fn(),
      findOne: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        AiRequestRepository,
        {
          provide: getRepositoryToken(AiRequest),
          useValue: typeOrmRepositoryMock,
        },
      ],
    }).compile();

    aiRequestRepositoryService = testingModule.get(AiRequestRepository);
  });

  it('debería estar definido', () => {
    expect(aiRequestRepositoryService).toBeDefined();
  });

  describe('create', () => {
    it('persiste la petición de IA', async () => {
      const requestToCreate = {
        type: AiRequestType.GET_SPENT_ISSUER,
        enterpriseId: 'enterprise-uuid',
      } as Partial<AiRequest>;
      typeOrmRepositoryMock.save.mockResolvedValue({
        id: 'ai-request-uuid',
        ...requestToCreate,
      });

      const result = await aiRequestRepositoryService.create(requestToCreate);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith(requestToCreate);
      expect(result.id).toBe('ai-request-uuid');
    });
  });

  describe('count', () => {
    it('cuenta peticiones con valores por defecto', async () => {
      await aiRequestRepositoryService.count();

      expect(QueryBuilderService.getCount).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'aiRequest',
        {},
        undefined,
      );
    });

    it('cuenta peticiones con relaciones convertidas a JOIN sin select', async () => {
      const filter = { enterpriseId: 'enterprise-uuid' };
      (QueryBuilderService.getCount as jest.Mock).mockResolvedValue(3);

      const result = await aiRequestRepositoryService.count(filter, ['enterprise']);

      expect(QueryBuilderService.getCount).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'aiRequest',
        filter,
        [
          {
            property: 'enterprise',
            alias: 'enterprise',
            isLeftJoinAndSelect: false,
          },
        ],
      );
      expect(result).toBe(3);
    });
  });

  describe('getListViewCounts', () => {
    it('devuelve total, emisor y conceptos con tres conteos', async () => {
      (QueryBuilderService.getCount as jest.Mock)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(6);

      const result = await aiRequestRepositoryService.getListViewCounts(
        'enterprise-uuid',
        { correlationId_ilike: '1111' },
      );

      expect(QueryBuilderService.getCount).toHaveBeenCalledTimes(3);
      expect(QueryBuilderService.getCount).toHaveBeenNthCalledWith(
        1,
        typeOrmRepositoryMock,
        'aiRequest',
        { enterpriseId: 'enterprise-uuid', correlationId_ilike: '1111' },
        undefined,
      );
      expect(QueryBuilderService.getCount).toHaveBeenNthCalledWith(
        2,
        typeOrmRepositoryMock,
        'aiRequest',
        {
          enterpriseId: 'enterprise-uuid',
          correlationId_ilike: '1111',
          type: AiRequestType.GET_SPENT_ISSUER,
        },
        undefined,
      );
      expect(QueryBuilderService.getCount).toHaveBeenNthCalledWith(
        3,
        typeOrmRepositoryMock,
        'aiRequest',
        {
          enterpriseId: 'enterprise-uuid',
          correlationId_ilike: '1111',
          type: AiRequestType.GET_SPENT_CONCEPTS,
        },
        undefined,
      );
      expect(result).toEqual({ total: 10, issuer: 4, concepts: 6 });
    });

    it('usa filtro vacío por defecto', async () => {
      await aiRequestRepositoryService.getListViewCounts('enterprise-uuid');

      expect(QueryBuilderService.getCount).toHaveBeenCalledTimes(3);
      expect(QueryBuilderService.getCount).toHaveBeenNthCalledWith(
        1,
        typeOrmRepositoryMock,
        'aiRequest',
        { enterpriseId: 'enterprise-uuid' },
        undefined,
      );
    });
  });

  describe('findAll', () => {
    it('lista peticiones paginadas usando QueryBuilderService', async () => {
      const result = await aiRequestRepositoryService.findAll(
        1,
        10,
        'createdAt',
        'DESC',
        { enterpriseId: 'enterprise-uuid' },
        ['enterprise'],
      );

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'aiRequest',
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          sort: 'createdAt',
          order: 'DESC',
          filter: { enterpriseId: 'enterprise-uuid' },
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

    it('lista peticiones con valores por defecto y sin relaciones', async () => {
      await aiRequestRepositoryService.findAll();

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'aiRequest',
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
    it('busca una petición por identificador', async () => {
      const foundRequest = { id: 'ai-request-uuid' } as AiRequest;
      typeOrmRepositoryMock.findOne.mockResolvedValue(foundRequest);

      const result = await aiRequestRepositoryService.findById('ai-request-uuid', [
        'enterprise',
      ]);

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'ai-request-uuid' },
        relations: ['enterprise'],
      });
      expect(result).toEqual(foundRequest);
    });

    it('busca una petición sin relaciones opcionales', async () => {
      await aiRequestRepositoryService.findById('ai-request-uuid');

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'ai-request-uuid' },
        relations: undefined,
      });
    });
  });

  describe('findByIdOrFail', () => {
    it('lanza 404 si la petición no existe', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue(null);

      const thrownError = await expectHttpException(
        aiRequestRepositoryService.findByIdOrFail('missing-id'),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('devuelve la petición cuando existe', async () => {
      const foundRequest = { id: 'ai-request-uuid' } as AiRequest;
      typeOrmRepositoryMock.findOne.mockResolvedValue(foundRequest);

      const result = await aiRequestRepositoryService.findByIdOrFail('ai-request-uuid');

      expect(result).toEqual(foundRequest);
    });
  });
});
