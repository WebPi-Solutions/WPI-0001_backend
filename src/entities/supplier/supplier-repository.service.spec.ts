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
import { Supplier } from './supplier.entity';
import { SupplierRepository } from './supplier-repository.service';

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

describe('SupplierRepository', () => {
  let supplierRepositoryService: SupplierRepository;
  let queryBuilder: {
    where: jest.Mock;
    andWhere: jest.Mock;
    leftJoin: jest.Mock;
    innerJoin: jest.Mock;
    innerJoinAndSelect: jest.Mock;
    select: jest.Mock;
    distinct: jest.Mock;
    getMany: jest.Mock;
    getOne: jest.Mock;
    getCount: jest.Mock;
    getRawOne: jest.Mock;
  };
  let typeOrmRepositoryMock: {
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
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

    queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
      getOne: jest.fn(),
      getCount: jest.fn(),
      getRawOne: jest.fn(),
    };

    typeOrmRepositoryMock = {
      save: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        SupplierRepository,
        {
          provide: getRepositoryToken(Supplier),
          useValue: typeOrmRepositoryMock,
        },
      ],
    }).compile();

    supplierRepositoryService = testingModule.get(SupplierRepository);
  });

  it('debería estar definido', () => {
    expect(supplierRepositoryService).toBeDefined();
  });

  describe('create', () => {
    it('normaliza el NIF y persiste el proveedor', async () => {
      const supplierToCreate = { name: 'Proveedor', nif: 'B-12.345 67' } as Supplier;
      typeOrmRepositoryMock.save.mockImplementation((entity: Supplier) =>
        Promise.resolve({ id: 'supplier-uuid', ...entity }),
      );

      const result = await supplierRepositoryService.create(supplierToCreate);

      expect(supplierToCreate.nif).toBe('B1234567');
      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ nif: 'B1234567' }),
      );
      expect(result.id).toBe('supplier-uuid');
    });

    it('persiste el proveedor sin normalizar si no trae NIF', async () => {
      const supplierToCreate = { name: 'Proveedor' } as Supplier;
      typeOrmRepositoryMock.save.mockResolvedValue({ id: 'supplier-uuid', ...supplierToCreate });

      await supplierRepositoryService.create(supplierToCreate);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith(supplierToCreate);
    });
  });

  describe('count', () => {
    it('cuenta proveedores con QueryBuilderService', async () => {
      (QueryBuilderService.getCount as jest.Mock).mockResolvedValue(5);

      const result = await supplierRepositoryService.count({ enterpriseId: 'enterprise-uuid' });

      expect(QueryBuilderService.getCount).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'supplier',
        { enterpriseId: 'enterprise-uuid' },
        undefined,
      );
      expect(result).toBe(5);
    });

    it('cuenta proveedores con relaciones convertidas a JOIN', async () => {
      await supplierRepositoryService.count({ enterpriseId: 'enterprise-uuid' }, ['enterprise']);

      expect(QueryBuilderService.getCount).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'supplier',
        { enterpriseId: 'enterprise-uuid' },
        [
          {
            property: 'enterprise',
            alias: 'enterprise',
            isLeftJoinAndSelect: false,
          },
        ],
      );
    });

    it('cuenta proveedores con valores por defecto', async () => {
      await supplierRepositoryService.count();

      expect(QueryBuilderService.getCount).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'supplier',
        {},
        undefined,
      );
    });
  });

  describe('getListViewCounts', () => {
    it('devuelve total, personas físicas y empresas', async () => {
      (QueryBuilderService.getCount as jest.Mock)
        .mockResolvedValueOnce(9)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(6);

      const result = await supplierRepositoryService.getListViewCounts('enterprise-uuid');

      expect(QueryBuilderService.getCount).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ total: 9, individuals: 3, companies: 6 });
    });

    it('aplica filtros adicionales al contar', async () => {
      await supplierRepositoryService.getListViewCounts('enterprise-uuid', { name_ilike: 'acme' });

      expect(QueryBuilderService.getCount).toHaveBeenCalledTimes(3);
    });
  });

  describe('findAll', () => {
    it('lista proveedores paginados usando QueryBuilderService', async () => {
      const result = await supplierRepositoryService.findAll(
        1,
        10,
        'name',
        'ASC',
        {},
        ['enterprise'],
      );

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'supplier',
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

    it('lista proveedores con valores por defecto y sin relaciones', async () => {
      await supplierRepositoryService.findAll();

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'supplier',
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
  });

  describe('findById', () => {
    it('busca un proveedor por identificador', async () => {
      const foundSupplier = { id: 'supplier-uuid' } as Supplier;
      typeOrmRepositoryMock.findOne.mockResolvedValue(foundSupplier);

      const result = await supplierRepositoryService.findById('supplier-uuid');

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'supplier-uuid' },
        relations: undefined,
      });
      expect(result).toEqual(foundSupplier);
    });

    it('busca un proveedor incluyendo relaciones', async () => {
      await supplierRepositoryService.findById('supplier-uuid', ['enterprise']);

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'supplier-uuid' },
        relations: ['enterprise'],
      });
    });
  });

  describe('findByNifAndEnterpriseId', () => {
    it('devuelve null si el NIF es nulo o indefinido', async () => {
      await expect(
        supplierRepositoryService.findByNifAndEnterpriseId(
          undefined as unknown as string,
          'enterprise-uuid',
        ),
      ).resolves.toBeNull();
      await expect(
        supplierRepositoryService.findByNifAndEnterpriseId(
          null as unknown as string,
          'enterprise-uuid',
        ),
      ).resolves.toBeNull();
      expect(typeOrmRepositoryMock.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('devuelve null si el NIF está vacío', async () => {
      const result = await supplierRepositoryService.findByNifAndEnterpriseId(
        '',
        'enterprise-uuid',
      );

      expect(result).toBeNull();
      expect(typeOrmRepositoryMock.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('devuelve null si el identificador de empresa está vacío', async () => {
      const result = await supplierRepositoryService.findByNifAndEnterpriseId('B123', '');

      expect(result).toBeNull();
      expect(typeOrmRepositoryMock.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('consulta el proveedor normalizando el NIF', async () => {
      const foundSupplier = { id: 'supplier-uuid', nif: 'B1234567' } as Supplier;
      queryBuilder.getOne.mockResolvedValue(foundSupplier);

      const result = await supplierRepositoryService.findByNifAndEnterpriseId(
        'B-12.345 67',
        'enterprise-uuid',
      );

      expect(typeOrmRepositoryMock.createQueryBuilder).toHaveBeenCalledWith('supplier');
      expect(queryBuilder.where).toHaveBeenCalledWith('supplier.enterprise_id = :enterpriseId', {
        enterpriseId: 'enterprise-uuid',
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        `REPLACE(REPLACE(REPLACE(UPPER(supplier.nif), '-', ''), ' ', ''), '.', '') = :normalizedNif`,
        { normalizedNif: 'B1234567' },
      );
      expect(result).toEqual(foundSupplier);
    });
  });

  describe('updateById', () => {
    it('lanza 404 si el proveedor no existe', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue(null);

      const thrownError = await expectHttpException(
        supplierRepositoryService.updateById('missing-id', { name: 'Nuevo' } as Supplier),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('fusiona y persiste el proveedor existente', async () => {
      const existingSupplier = { id: 'supplier-uuid', name: 'Antiguo' } as Supplier;
      const payload = { name: 'Nuevo' } as Supplier;
      const reloadedSupplier = { ...existingSupplier, ...payload } as Supplier;

      typeOrmRepositoryMock.findOne
        .mockResolvedValueOnce(existingSupplier)
        .mockResolvedValueOnce(reloadedSupplier);
      typeOrmRepositoryMock.save.mockResolvedValue(reloadedSupplier);

      const result = await supplierRepositoryService.updateById('supplier-uuid', payload);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith({
        ...existingSupplier,
        ...payload,
      });
      expect(result).toEqual(reloadedSupplier);
    });
  });

  describe('deleteById', () => {
    it('elimina el proveedor por identificador', async () => {
      const deleteResult = { affected: 1, raw: [] };
      typeOrmRepositoryMock.delete.mockResolvedValue(deleteResult);

      const result = await supplierRepositoryService.deleteById('supplier-uuid');

      expect(typeOrmRepositoryMock.delete).toHaveBeenCalledWith('supplier-uuid');
      expect(result).toEqual(deleteResult);
    });
  });
});
