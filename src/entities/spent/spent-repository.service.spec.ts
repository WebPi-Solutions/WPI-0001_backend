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
import { Enterprise } from '../enterprise/enterprise.entity';
import { Spent } from './spent.entity';
import { SpentRepository } from './spent-repository.service';

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

describe('SpentRepository', () => {
  let spentRepositoryService: SpentRepository;
  let queryMock: jest.Mock;
  let managerFindOneMock: jest.Mock;
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
    find: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: { query: jest.Mock; findOne: jest.Mock };
  };
  const originalSpentFilePath = process.env.DROPBOX_SPENT_FILE_PATH;

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

    queryMock = jest.fn().mockResolvedValue([]);
    managerFindOneMock = jest.fn();
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
      find: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      manager: {
        query: queryMock,
        findOne: managerFindOneMock,
      },
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        SpentRepository,
        {
          provide: getRepositoryToken(Spent),
          useValue: typeOrmRepositoryMock,
        },
      ],
    }).compile();

    spentRepositoryService = testingModule.get(SpentRepository);
  });

  afterEach(() => {
    process.env.DROPBOX_SPENT_FILE_PATH = originalSpentFilePath;
  });

  it('debería estar definido', () => {
    expect(spentRepositoryService).toBeDefined();
  });

  describe('hasEnterpriseAiAccess', () => {
    it('devuelve false si el identificador de empresa está vacío', async () => {
      const result = await spentRepositoryService.hasEnterpriseAiAccess('');

      expect(result).toBe(false);
      expect(managerFindOneMock).not.toHaveBeenCalled();
    });

    it('devuelve false si la empresa no existe', async () => {
      managerFindOneMock.mockResolvedValue(null);

      const result = await spentRepositoryService.hasEnterpriseAiAccess('enterprise-uuid');

      expect(managerFindOneMock).toHaveBeenCalledWith(Enterprise, {
        where: { id: 'enterprise-uuid' },
        select: ['id', 'aiAccess'],
      });
      expect(result).toBe(false);
    });

    it('devuelve true cuando la empresa tiene aiAccess activo', async () => {
      managerFindOneMock.mockResolvedValue({ id: 'enterprise-uuid', aiAccess: true });

      const result = await spentRepositoryService.hasEnterpriseAiAccess('enterprise-uuid');

      expect(result).toBe(true);
    });

    it('devuelve false cuando la empresa no tiene aiAccess', async () => {
      managerFindOneMock.mockResolvedValue({ id: 'enterprise-uuid', aiAccess: false });

      const result = await spentRepositoryService.hasEnterpriseAiAccess('enterprise-uuid');

      expect(result).toBe(false);
    });
  });

  describe('create', () => {
    it('persiste el gasto mediante save', async () => {
      const spentToCreate = { name: 'Gasto' } as Spent;
      typeOrmRepositoryMock.save.mockResolvedValue({ id: 'spent-uuid', ...spentToCreate });

      const result = await spentRepositoryService.create(spentToCreate);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith(spentToCreate);
      expect(result.id).toBe('spent-uuid');
    });
  });

  describe('findAll', () => {
    it('lista gastos paginados usando QueryBuilderService', async () => {
      const result = await spentRepositoryService.findAll(
        1,
        10,
        'issuedDate',
        'DESC',
        { status: 'paid' },
        ['supplier'],
      );

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'spent',
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          sort: 'issuedDate',
          order: 'DESC',
          filter: { status: 'paid' },
          relations: [
            {
              property: 'supplier',
              alias: 'supplier',
              isLeftJoinAndSelect: true,
            },
          ],
        }),
      );
      expect(result).toEqual({
        items: [],
        total: 0,
        currentPage: 1,
        totalPages: 0,
      });
    });

    it('lista gastos con valores por defecto y sin relaciones', async () => {
      await spentRepositoryService.findAll();

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'spent',
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          sort: 'issuedDate',
          order: 'DESC',
          filter: {},
          relations: [],
        }),
      );
    });
  });

  describe('findById', () => {
    it('busca un gasto por identificador', async () => {
      const foundSpent = { id: 'spent-uuid' } as Spent;
      typeOrmRepositoryMock.findOne.mockResolvedValue(foundSpent);

      const result = await spentRepositoryService.findById('spent-uuid', ['supplier']);

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'spent-uuid' },
        relations: ['supplier'],
      });
      expect(result).toEqual(foundSpent);
    });

    it('busca un gasto sin relaciones opcionales', async () => {
      await spentRepositoryService.findById('spent-uuid');

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'spent-uuid' },
        relations: undefined,
      });
    });
  });

  describe('findLatestBySupplierId', () => {
    it('devuelve lista vacía si el proveedor está vacío', async () => {
      const result = await spentRepositoryService.findLatestBySupplierId('', 5);

      expect(result).toEqual([]);
      expect(typeOrmRepositoryMock.find).not.toHaveBeenCalled();
    });

    it('devuelve lista vacía si el límite es menor que 1', async () => {
      const result = await spentRepositoryService.findLatestBySupplierId('supplier-uuid', 0);

      expect(result).toEqual([]);
      expect(typeOrmRepositoryMock.find).not.toHaveBeenCalled();
    });

    it('consulta los últimos gastos del proveedor ordenados por fecha', async () => {
      const latestSpents = [{ id: 'spent-uuid' }] as Spent[];
      typeOrmRepositoryMock.find.mockResolvedValue(latestSpents);

      const result = await spentRepositoryService.findLatestBySupplierId('supplier-uuid', 3);

      expect(typeOrmRepositoryMock.find).toHaveBeenCalledWith({
        where: { supplierId: 'supplier-uuid' },
        order: {
          issuedDate: 'DESC',
          createdAt: 'DESC',
        },
        take: 3,
        select: ['id', 'name', 'issuedDate', 'concepts', 'createdAt'],
      });
      expect(result).toEqual(latestSpents);
    });

    it('usa el límite por defecto de 5 gastos', async () => {
      typeOrmRepositoryMock.find.mockResolvedValue([]);

      await spentRepositoryService.findLatestBySupplierId('supplier-uuid');

      expect(typeOrmRepositoryMock.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });
  });

  describe('updateById', () => {
    it('lanza 404 si el gasto no existe', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue(null);

      const thrownError = await expectHttpException(
        spentRepositoryService.updateById('missing-id', { name: 'Nuevo' } as Spent),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('fusiona y persiste el gasto existente', async () => {
      const existingSpent = { id: 'spent-uuid', name: 'Antiguo' } as Spent;
      const payload = { name: 'Nuevo' } as Spent;
      const reloadedSpent = { ...existingSpent, ...payload } as Spent;

      typeOrmRepositoryMock.findOne
        .mockResolvedValueOnce(existingSpent)
        .mockResolvedValueOnce(reloadedSpent);
      typeOrmRepositoryMock.save.mockResolvedValue(reloadedSpent);

      const result = await spentRepositoryService.updateById('spent-uuid', payload);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith({
        ...existingSpent,
        ...payload,
      });
      expect(result).toEqual(reloadedSpent);
    });
  });

  describe('deleteById', () => {
    it('elimina el gasto por identificador', async () => {
      const deleteResult = { affected: 1, raw: [] };
      typeOrmRepositoryMock.delete.mockResolvedValue(deleteResult);

      const result = await spentRepositoryService.deleteById('spent-uuid');

      expect(typeOrmRepositoryMock.delete).toHaveBeenCalledWith('spent-uuid');
      expect(result).toEqual(deleteResult);
    });
  });

  describe('getSpentFilePath', () => {
    it('sustituye empresa y gasto en la ruta de Dropbox', () => {
      process.env.DROPBOX_SPENT_FILE_PATH = '/empresas/:enterpriseId/gastos/:spentId';

      const filePath = spentRepositoryService.getSpentFilePath(
        'enterprise-uuid',
        'spent-uuid',
      );

      expect(filePath).toBe('/empresas/enterprise-uuid/gastos/spent-uuid.pdf');
    });
  });

  describe('getSpentsForMetrics', () => {
    it('consulta gastos por fecha de declaración y empresa', async () => {
      const startDate = new Date('2026-01-01T00:00:00.000Z');
      const endDate = new Date('2026-01-31T00:00:00.000Z');
      const spents = [{ id: 'spent-uuid' }] as Spent[];
      queryBuilder.getMany.mockResolvedValue(spents);

      const result = await spentRepositoryService.getSpentsForMetrics(
        startDate,
        endDate,
        'enterprise-uuid',
      );

      expect(typeOrmRepositoryMock.createQueryBuilder).toHaveBeenCalledWith('spent');
      expect(queryBuilder.leftJoin).toHaveBeenCalledWith('spent.supplier', 'supplier');
      expect(queryBuilder.where).toHaveBeenCalledWith('spent.declarationDate >= :startDate', {
        startDate,
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('spent.declarationDate <= :endDate', {
        endDate,
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('supplier.enterpriseId = :enterpriseId', {
        enterpriseId: 'enterprise-uuid',
      });
      expect(result).toEqual(spents);
    });
  });

  describe('getSpentSubtotalsByStatus', () => {
    const enterpriseId = 'enterprise-uuid';

    /**
     * Obtiene el SQL y los parámetros de la última consulta ejecutada.
     * @returns Tupla con la sentencia SQL y el array de parámetros
     */
    const getLastQueryCall = (): [string, unknown[]] => {
      const [sql, parameters] = queryMock.mock.calls[0];
      return [sql as string, parameters as unknown[]];
    };

    it('siempre filtra por empresa y no añade estado si el filtro no viene', async () => {
      await spentRepositoryService.getSpentSubtotalsByStatus(enterpriseId, {});

      const [sql, parameters] = getLastQueryCall();
      expect(sql).toContain('sup.enterprise_id = $1');
      expect(sql).not.toContain('s.status IN');
      expect(parameters).toEqual([enterpriseId]);
    });

    it('aplica IN de proveedor detrás de status y antes de fechas', async () => {
      await spentRepositoryService.getSpentSubtotalsByStatus(enterpriseId, {
        status: ['paid', 'pending'],
        'supplier.id': 'supplier-uuid',
        issuedDate_from: '2026-01-01',
      });

      const [sql, parameters] = getLastQueryCall();
      expect(sql).toContain('s.status IN ($2, $3)');
      expect(sql).toContain('s.supplier_id IN ($4)');
      expect(sql).toContain('s.issued_date >= $5');
      expect(parameters).toEqual([
        enterpriseId,
        'paid',
        'pending',
        'supplier-uuid',
        '2026-01-01',
      ]);
    });

    it('agrega conteos y subtotales por estado y acumula desconocidos en el total', async () => {
      queryMock.mockResolvedValue([
        { status: 'paid', count: '2', subtotal: '10.125' },
        { status: 'partially_paid', count: 1, subtotal: '5.125' },
        { status: 'unknown', count: 3, subtotal: '1' },
        { status: null, count: 1, subtotal: '2.004' },
        { status: 'unknown', count: null, subtotal: undefined },
        { status: 'also-unknown', count: 'no-num', subtotal: 'no-num' },
      ]);

      const metrics = await spentRepositoryService.getSpentSubtotalsByStatus(enterpriseId);

      expect(metrics.paid).toEqual({ count: 2, subtotal: 10.13 });
      expect(metrics.partially_paid).toEqual({ count: 1, subtotal: 5.13 });
      expect(metrics.pending).toEqual({ count: 1, subtotal: 2 });
      expect(metrics.cancelled).toEqual({ count: 0, subtotal: 0 });
      expect(metrics.total.count).toBe(7);
      expect(metrics.total.subtotal).toBe(18.25);
    });

    it('devuelve métricas a cero cuando la consulta no retorna filas', async () => {
      const metrics = await spentRepositoryService.getSpentSubtotalsByStatus(enterpriseId);

      expect(metrics).toEqual({
        total: { count: 0, subtotal: 0 },
        pending: { count: 0, subtotal: 0 },
        paid: { count: 0, subtotal: 0 },
        partially_paid: { count: 0, subtotal: 0 },
        cancelled: { count: 0, subtotal: 0 },
      });
    });

    it('no añade IN si status o supplier.id llegan como arrays vacíos', async () => {
      await spentRepositoryService.getSpentSubtotalsByStatus(enterpriseId, {
        status: [],
        'supplier.id': [],
      });

      const [sql, parameters] = getLastQueryCall();
      expect(sql).not.toContain('s.status IN');
      expect(sql).not.toContain('s.supplier_id IN');
      expect(parameters).toEqual([enterpriseId]);
    });

    it('aplica un único status y el resto de fechas e ILIKE', async () => {
      await spentRepositoryService.getSpentSubtotalsByStatus(enterpriseId, {
        status: 'paid',
        'supplier.id': ['supplier-a', 'supplier-b'],
        issuedDate_to: '2026-01-31',
        declarationDate_from: '2026-01-01',
        declarationDate_to: '2026-01-31',
        createdAt_from: '2026-01-01',
        createdAt_to: '2026-01-31',
        updatedAt_from: '2026-02-01',
        updatedAt_to: '2026-02-28',
        name_ilike: 'hosting',
        'supplier.name_ilike': 'proveedor',
      });

      const [sql, parameters] = getLastQueryCall();
      expect(sql).toContain('s.status IN ($2)');
      expect(sql).toContain('s.supplier_id IN ($3, $4)');
      expect(sql).toContain('s.issued_date <= $5');
      expect(sql).toContain('s.declaration_date >= $6');
      expect(sql).toContain('s.declaration_date <= $7');
      expect(sql).toContain('s.created_at >= $8');
      expect(sql).toContain('s.created_at <= $9');
      expect(sql).toContain('s.updated_at >= $10');
      expect(sql).toContain('s.updated_at <= $11');
      expect(sql).toContain('LOWER(s.name) LIKE LOWER($12)');
      expect(sql).toContain('LOWER(sup.name) LIKE LOWER($13)');
      expect(parameters).toEqual([
        enterpriseId,
        'paid',
        'supplier-a',
        'supplier-b',
        '2026-01-31',
        '2026-01-01',
        '2026-01-31',
        '2026-01-01',
        '2026-01-31',
        '2026-02-01',
        '2026-02-28',
        '%hosting%',
        '%proveedor%',
      ]);
    });
  });
});
