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
import { Signing, SigningAction } from './signing.entity';
import { SigningRepository } from './signing-repository.service';

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

describe('SigningRepository', () => {
  let signingRepositoryService: SigningRepository;
  let queryBuilder: {
    where: jest.Mock;
    andWhere: jest.Mock;
    leftJoin: jest.Mock;
    innerJoin: jest.Mock;
    innerJoinAndSelect: jest.Mock;
    select: jest.Mock;
    distinct: jest.Mock;
    orderBy: jest.Mock;
    addOrderBy: jest.Mock;
    setParameter: jest.Mock;
    getMany: jest.Mock;
    getOne: jest.Mock;
    getCount: jest.Mock;
    getRawOne: jest.Mock;
  };
  let updatesCountQueryBuilder: {
    select: jest.Mock;
    addSelect: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    groupBy: jest.Mock;
    getRawMany: jest.Mock;
  };
  let typeOrmRepositoryMock: {
    save: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: {
      createQueryBuilder: jest.Mock;
    };
  };

  /**
   * Crea el módulo de pruebas mockeando los métodos TypeORM usados por el repositorio.
   */
  beforeEach(async () => {
    jest.clearAllMocks();
    (QueryBuilderService.getPaginatedResults as jest.Mock).mockResolvedValue({
      items: [],
      total: 0,
      currentPage: 1,
      totalPages: 0,
    });

    queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
      getOne: jest.fn(),
      getCount: jest.fn(),
      getRawOne: jest.fn(),
    };

    updatesCountQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };

    typeOrmRepositoryMock = {
      save: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      manager: {
        createQueryBuilder: jest.fn().mockReturnValue(updatesCountQueryBuilder),
      },
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        SigningRepository,
        {
          provide: getRepositoryToken(Signing),
          useValue: typeOrmRepositoryMock,
        },
      ],
    }).compile();

    signingRepositoryService = testingModule.get(SigningRepository);
  });

  it('debería estar definido', () => {
    expect(signingRepositoryService).toBeDefined();
  });

  describe('getEntityManager', () => {
    it('expone el EntityManager del repositorio TypeORM', () => {
      expect(signingRepositoryService.getEntityManager()).toBe(typeOrmRepositoryMock.manager);
    });
  });

  describe('create', () => {
    it('persiste el fichaje y deja updatesCount en 0', async () => {
      const signingToCreate = {
        userEnterpriseId: 'link-uuid',
        action: SigningAction.START,
      } as Partial<Signing>;
      typeOrmRepositoryMock.save.mockResolvedValue({
        id: 'signing-uuid',
        ...signingToCreate,
      });

      const result = await signingRepositoryService.create(signingToCreate);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith(signingToCreate);
      expect(result.updatesCount).toBe(0);
      expect(typeOrmRepositoryMock.manager.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('findLatestOpenStartSigningForUser', () => {
    it('consulta el último start abierto del usuario', async () => {
      const inclusiveEndMoment = new Date('2026-09-10T18:00:00.000Z');
      const openStart = { id: 'signing-uuid', action: SigningAction.START } as Signing;
      queryBuilder.getOne.mockResolvedValue(openStart);

      const result = await signingRepositoryService.findLatestOpenStartSigningForUser(
        'link-uuid',
        inclusiveEndMoment,
      );

      expect(typeOrmRepositoryMock.createQueryBuilder).toHaveBeenCalledWith('s');
      expect(queryBuilder.where).toHaveBeenCalledWith('s.userEnterpriseId = :userEnterpriseId', {
        userEnterpriseId: 'link-uuid',
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('s.action = :action', {
        action: SigningAction.START,
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('s.durationInSeconds IS NULL');
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('s.cancelled = :activeSigning', {
        activeSigning: false,
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('s.moment <= :endMoment', {
        endMoment: inclusiveEndMoment,
      });
      expect(queryBuilder.orderBy).toHaveBeenCalledWith('s.moment', 'DESC');
      expect(result).toEqual(openStart);
    });
  });

  describe('findByUserEnterpriseIdOrderedByMoment', () => {
    it('devuelve los fichajes activos ordenados cronológicamente', async () => {
      const signings = [{ id: 'signing-uuid' }] as Signing[];
      queryBuilder.getMany.mockResolvedValue(signings);

      const result =
        await signingRepositoryService.findByUserEnterpriseIdOrderedByMoment('link-uuid');

      expect(queryBuilder.where).toHaveBeenCalledWith('s.userEnterpriseId = :userEnterpriseId', {
        userEnterpriseId: 'link-uuid',
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('s.cancelled = :activeSigning', {
        activeSigning: false,
      });
      expect(queryBuilder.orderBy).toHaveBeenCalledWith('s.moment', 'ASC');
      expect(queryBuilder.setParameter).toHaveBeenCalledWith('actionStart', SigningAction.START);
      expect(result).toEqual(signings);
    });
  });

  describe('findAll', () => {
    it('lista fichajes paginados y adjunta el conteo de actualizaciones', async () => {
      const signingItem = { id: 'signing-uuid' } as Signing;
      (QueryBuilderService.getPaginatedResults as jest.Mock).mockResolvedValue({
        items: [signingItem],
        total: 1,
        currentPage: 1,
        totalPages: 1,
      });
      updatesCountQueryBuilder.getRawMany.mockResolvedValue([
        { signingId: 'signing-uuid', updatesCount: '2' },
      ]);

      const result = await signingRepositoryService.findAll(
        1,
        10,
        'moment',
        'DESC',
        {},
        ['userEnterprise'],
      );

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'signing',
        expect.objectContaining({
          extraAndWhere: {
            sql: 'signing.cancelled = :signingListActiveOnly',
            parameters: { signingListActiveOnly: false },
          },
          relations: [
            {
              property: 'userEnterprise',
              alias: 'userEnterprise',
              isLeftJoinAndSelect: true,
            },
          ],
        }),
      );
      expect(typeOrmRepositoryMock.manager.createQueryBuilder).toHaveBeenCalled();
      expect(signingItem.updatesCount).toBe(2);
      expect(result.total).toBe(1);
    });

    it('lista fichajes con valores por defecto y sin adjuntar conteos si no hay items', async () => {
      await signingRepositoryService.findAll();

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'signing',
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          sort: 'moment',
          order: 'DESC',
          filter: {},
          relations: [],
        }),
      );
      expect(typeOrmRepositoryMock.manager.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('omite items sin id al adjuntar conteos si hay otros con id', async () => {
      const signingWithoutId = { action: SigningAction.START } as Signing;
      const signingWithId = { id: 'signing-uuid' } as Signing;
      (QueryBuilderService.getPaginatedResults as jest.Mock).mockResolvedValue({
        items: [signingWithoutId, signingWithId],
        total: 2,
        currentPage: 1,
        totalPages: 1,
      });
      updatesCountQueryBuilder.getRawMany.mockResolvedValue([
        { signingId: 'signing-uuid', updatesCount: '4' },
      ]);

      await signingRepositoryService.findAll(1, 10, 'moment', 'DESC', {});

      expect(signingWithoutId.updatesCount).toBeUndefined();
      expect(signingWithId.updatesCount).toBe(4);
    });

    it('no consulta conteos si los items no tienen id', async () => {
      (QueryBuilderService.getPaginatedResults as jest.Mock).mockResolvedValue({
        items: [{ action: SigningAction.START } as Signing],
        total: 1,
        currentPage: 1,
        totalPages: 1,
      });

      await signingRepositoryService.findAll(1, 10, 'moment', 'DESC', {});

      expect(typeOrmRepositoryMock.manager.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('devuelve null si el fichaje no existe', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue(null);

      const result = await signingRepositoryService.findById('missing-id');

      expect(result).toBeNull();
      expect(typeOrmRepositoryMock.manager.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('busca el fichaje y adjunta el conteo de actualizaciones', async () => {
      const foundSigning = { id: 'signing-uuid' } as Signing;
      typeOrmRepositoryMock.findOne.mockResolvedValue(foundSigning);
      updatesCountQueryBuilder.getRawMany.mockResolvedValue([
        { signingId: 'signing-uuid', updatesCount: '3' },
      ]);

      const result = await signingRepositoryService.findById('signing-uuid', [
        'userEnterprise',
      ]);

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'signing-uuid' },
        relations: ['userEnterprise'],
      });
      expect(result?.updatesCount).toBe(3);
    });

    it('asigna 0 si el conteo no es numérico o el fichaje no está en el mapa', async () => {
      const foundSigning = { id: 'signing-uuid' } as Signing;
      const otherSigning = { id: 'other-uuid' } as Signing;
      typeOrmRepositoryMock.findOne.mockResolvedValue(foundSigning);
      updatesCountQueryBuilder.getRawMany.mockResolvedValue([
        { signingId: 'other-uuid', updatesCount: 'abc' },
      ]);

      const result = await signingRepositoryService.findById('signing-uuid');

      expect(result?.updatesCount).toBe(0);
      expect(otherSigning.updatesCount).toBeUndefined();
    });
  });

  describe('updateById', () => {
    it('lanza 404 si el fichaje no existe', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue(null);

      const thrownError = await expectHttpException(
        signingRepositoryService.updateById('missing-id', {}),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('fusiona y recarga el fichaje con relaciones', async () => {
      const existingSigning = { id: 'signing-uuid', action: SigningAction.START } as Signing;
      const payload = { action: SigningAction.END } as Partial<Signing>;
      const reloadedSigning = { ...existingSigning, ...payload } as Signing;

      typeOrmRepositoryMock.findOne
        .mockResolvedValueOnce(existingSigning)
        .mockResolvedValueOnce(reloadedSigning);
      typeOrmRepositoryMock.save.mockResolvedValue(reloadedSigning);
      updatesCountQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await signingRepositoryService.updateById('signing-uuid', payload);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith({
        ...existingSigning,
        ...payload,
      });
      expect(typeOrmRepositoryMock.findOne).toHaveBeenLastCalledWith({
        where: { id: 'signing-uuid' },
        relations: ['userEnterprise', 'userEnterprise.user'],
      });
      expect(result).toEqual(reloadedSigning);
      expect(result.updatesCount).toBe(0);
    });
  });

  describe('markCancelledEntity', () => {
    it('marca el fichaje como cancelado y lo persiste', async () => {
      const signing = { id: 'signing-uuid', cancelled: false } as Signing;
      typeOrmRepositoryMock.save.mockImplementation((entity: Signing) =>
        Promise.resolve(entity),
      );

      const result = await signingRepositoryService.markCancelledEntity(signing);

      expect(signing.cancelled).toBe(true);
      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith(signing);
      expect(result.cancelled).toBe(true);
    });
  });
});
