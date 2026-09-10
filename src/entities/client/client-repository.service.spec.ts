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
import { Client } from './client.entity';
import { ClientRepository } from './client-repository.service';

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

describe('ClientRepository', () => {
  let clientRepositoryService: ClientRepository;
  let typeOrmRepositoryMock: {
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
  };

  /**
   * Crea el módulo de pruebas con repositorio TypeORM simulado
   * y restablece los mocks de QueryBuilderService.
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
        ClientRepository,
        {
          provide: getRepositoryToken(Client),
          useValue: typeOrmRepositoryMock,
        },
      ],
    }).compile();

    clientRepositoryService = testingModule.get(ClientRepository);
  });

  it('debería estar definido', () => {
    expect(clientRepositoryService).toBeDefined();
  });

  describe('create', () => {
    it('persiste el cliente mediante save', async () => {
      const clientToCreate = { name: 'Cliente de prueba' } as Client;
      const persistedClient = { id: 'client-uuid', name: 'Cliente de prueba' } as Client;
      typeOrmRepositoryMock.save.mockResolvedValue(persistedClient);

      const result = await clientRepositoryService.create(clientToCreate);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith(clientToCreate);
      expect(result).toEqual(persistedClient);
    });
  });

  describe('count', () => {
    it('cuenta clientes sin relaciones', async () => {
      const filter = { enterpriseId: 'enterprise-uuid' };
      (QueryBuilderService.getCount as jest.Mock).mockResolvedValue(7);

      const result = await clientRepositoryService.count(filter);

      expect(QueryBuilderService.getCount).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'client',
        filter,
        undefined,
      );
      expect(result).toBe(7);
    });

    it('cuenta clientes con valores por defecto', async () => {
      await clientRepositoryService.count();

      expect(QueryBuilderService.getCount).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'client',
        {},
        undefined,
      );
    });

    it('cuenta clientes con relaciones convertidas a JOIN sin select', async () => {
      const filter = { enterpriseId: 'enterprise-uuid' };
      (QueryBuilderService.getCount as jest.Mock).mockResolvedValue(3);

      const result = await clientRepositoryService.count(filter, ['enterprise']);

      expect(QueryBuilderService.getCount).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'client',
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
    it('devuelve total, personas físicas y empresas con tres conteos', async () => {
      (QueryBuilderService.getCount as jest.Mock)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(6);

      const result = await clientRepositoryService.getListViewCounts(
        'enterprise-uuid',
        { name_ilike: 'acme' },
      );

      expect(QueryBuilderService.getCount).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ total: 10, individuals: 4, companies: 6 });
    });

    it('usa filtro vacío por defecto', async () => {
      await clientRepositoryService.getListViewCounts('enterprise-uuid');

      expect(QueryBuilderService.getCount).toHaveBeenCalledTimes(3);
    });
  });

  describe('findAll', () => {
    it('lista clientes paginados sin relaciones', async () => {
      const paginatedResponse = {
        items: [{ id: 'client-uuid' }],
        total: 1,
        currentPage: 1,
        totalPages: 1,
      };
      (QueryBuilderService.getPaginatedResults as jest.Mock).mockResolvedValue(
        paginatedResponse,
      );

      const result = await clientRepositoryService.findAll(1, 10, 'name', 'ASC', {
        enterpriseId: 'enterprise-uuid',
      });

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'client',
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          sort: 'name',
          order: 'ASC',
          filter: { enterpriseId: 'enterprise-uuid' },
          relations: [],
        }),
      );
      expect(result).toEqual(paginatedResponse);
    });

    it('lista clientes con valores por defecto', async () => {
      await clientRepositoryService.findAll();

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'client',
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          sort: 'name',
          order: 'ASC',
          filter: {},
          relations: [],
        }),
      );
    });

    it('lista clientes paginados con relaciones en leftJoinAndSelect', async () => {
      await clientRepositoryService.findAll(
        2,
        20,
        'createdAt',
        'DESC',
        {},
        ['enterprise'],
      );

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'client',
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
    });
  });

  describe('findById', () => {
    it('busca un cliente por identificador y relaciones', async () => {
      const foundClient = { id: 'client-uuid' } as Client;
      typeOrmRepositoryMock.findOne.mockResolvedValue(foundClient);

      const result = await clientRepositoryService.findById('client-uuid', ['enterprise']);

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'client-uuid' },
        relations: ['enterprise'],
      });
      expect(result).toEqual(foundClient);
    });

    it('busca un cliente sin relaciones opcionales', async () => {
      await clientRepositoryService.findById('client-uuid');

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'client-uuid' },
        relations: undefined,
      });
    });
  });

  describe('findByNifAndEnterpriseId', () => {
    it('busca un cliente por NIF y empresa', async () => {
      const foundClient = { id: 'client-uuid', nif: 'B12345678' } as Client;
      typeOrmRepositoryMock.findOne.mockResolvedValue(foundClient);

      const result = await clientRepositoryService.findByNifAndEnterpriseId(
        'B12345678',
        'enterprise-uuid',
      );

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { nif: 'B12345678', enterpriseId: 'enterprise-uuid' },
      });
      expect(result).toEqual(foundClient);
    });
  });

  describe('updateById', () => {
    it('lanza 404 si el cliente no existe', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue(null);

      const thrownError = await expectHttpException(
        clientRepositoryService.updateById('missing-id', { name: 'Nuevo' } as Client),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(typeOrmRepositoryMock.save).not.toHaveBeenCalled();
    });

    it('fusiona y persiste el cliente existente y lo recarga con empresa', async () => {
      const existingClient = { id: 'client-uuid', name: 'Antiguo' } as Client;
      const updatedPayload = { name: 'Nuevo' } as Client;
      const reloadedClient = {
        id: 'client-uuid',
        name: 'Nuevo',
        enterprise: { id: 'enterprise-uuid' },
      } as Client;

      typeOrmRepositoryMock.findOne
        .mockResolvedValueOnce(existingClient)
        .mockResolvedValueOnce(reloadedClient);
      typeOrmRepositoryMock.save.mockResolvedValue({ ...existingClient, ...updatedPayload });

      const result = await clientRepositoryService.updateById('client-uuid', updatedPayload);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith({
        ...existingClient,
        ...updatedPayload,
      });
      expect(typeOrmRepositoryMock.findOne).toHaveBeenLastCalledWith({
        where: { id: 'client-uuid' },
        relations: ['enterprise'],
      });
      expect(result).toEqual(reloadedClient);
    });
  });

  describe('deleteById', () => {
    it('elimina el cliente por identificador', async () => {
      const deleteResult = { affected: 1, raw: [] };
      typeOrmRepositoryMock.delete.mockResolvedValue(deleteResult);

      const result = await clientRepositoryService.deleteById('client-uuid');

      expect(typeOrmRepositoryMock.delete).toHaveBeenCalledWith('client-uuid');
      expect(result).toEqual(deleteResult);
    });
  });
});
