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

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryBuilderService } from 'src/common/helpers/query-builder/query-builder.service';
import { StockDirection } from 'src/common/enums';
import { StockMovement } from './stock-movement.entity';
import { StockMovementRepository } from './stock-movement-repository.service';

describe('StockMovementRepository', () => {
  let stockMovementRepositoryService: StockMovementRepository;
  let typeOrmRepositoryMock: {
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let queryBuilderMock: {
    select: jest.Mock;
    addSelect: jest.Mock;
    where: jest.Mock;
    setParameters: jest.Mock;
    groupBy: jest.Mock;
    getRawMany: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    queryBuilderMock = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    typeOrmRepositoryMock = {
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        StockMovementRepository,
        {
          provide: getRepositoryToken(StockMovement),
          useValue: typeOrmRepositoryMock,
        },
      ],
    }).compile();

    stockMovementRepositoryService = testingModule.get(StockMovementRepository);
  });

  it('debería estar definido', () => {
    expect(stockMovementRepositoryService).toBeDefined();
  });

  it('crea un movimiento', async () => {
    typeOrmRepositoryMock.save.mockResolvedValue({ id: 'sm-uuid' });
    await expect(
      stockMovementRepositoryService.create({
        itemId: 'item-1',
        quantity: 2,
        direction: StockDirection.IN,
      }),
    ).resolves.toEqual({ id: 'sm-uuid' });
  });

  it('lista con valores por defecto', async () => {
    await stockMovementRepositoryService.findAll();
    expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
      typeOrmRepositoryMock,
      'stockMovement',
      expect.objectContaining({ sort: 'occurredAt', order: 'DESC' }),
    );
  });

  it('lista con relaciones', async () => {
    await stockMovementRepositoryService.findAll(1, 10, 'createdAt', 'ASC', {}, ['item']);
    expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalled();
  });

  it('busca por id', async () => {
    typeOrmRepositoryMock.findOne.mockResolvedValue({ id: 'sm-uuid' });
    await expect(stockMovementRepositoryService.findById('sm-uuid')).resolves.toEqual({
      id: 'sm-uuid',
    });
  });

  it('lista por línea de gasto, factura y serie', async () => {
    typeOrmRepositoryMock.find.mockResolvedValue([]);
    await stockMovementRepositoryService.findBySpentConceptId('sc-1');
    await stockMovementRepositoryService.findByInvoiceConceptId('ic-1');
    await stockMovementRepositoryService.findByItemSerialId('is-1');
    expect(typeOrmRepositoryMock.find).toHaveBeenCalledTimes(3);
  });

  it('elimina por línea, serie e id', async () => {
    typeOrmRepositoryMock.delete.mockResolvedValue({ affected: 1 });
    await stockMovementRepositoryService.deleteBySpentConceptId('sc-1');
    await stockMovementRepositoryService.deleteByInvoiceConceptId('ic-1');
    await stockMovementRepositoryService.deleteByItemSerialId('is-1');
    await stockMovementRepositoryService.deleteById('sm-uuid');
    expect(typeOrmRepositoryMock.delete).toHaveBeenCalledTimes(4);
  });

  describe('getBalancesByItemIds', () => {
    it('devuelve ceros si no hay ids', async () => {
      const balances = await stockMovementRepositoryService.getBalancesByItemIds([]);
      expect(balances.size).toBe(0);
      expect(typeOrmRepositoryMock.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('agrega entradas y salidas', async () => {
      queryBuilderMock.getRawMany.mockResolvedValue([
        { itemId: 'item-1', stockEntries: '4', stockExits: '1' },
      ]);
      const balances = await stockMovementRepositoryService.getBalancesByItemIds([
        'item-1',
        'item-2',
      ]);
      expect(balances.get('item-1')).toEqual({
        itemId: 'item-1',
        stockEntries: 4,
        stockExits: 1,
        stockOnHand: 3,
      });
      expect(balances.get('item-2')).toEqual({
        itemId: 'item-2',
        stockEntries: 0,
        stockExits: 0,
        stockOnHand: 0,
      });
    });

    it('trata valores no numéricos como cero', async () => {
      queryBuilderMock.getRawMany.mockResolvedValue([
        { itemId: 'item-1', stockEntries: 'x', stockExits: null },
      ]);
      const balances = await stockMovementRepositoryService.getBalancesByItemIds(['item-1']);
      expect(balances.get('item-1')?.stockOnHand).toBe(0);
    });
  });
});
