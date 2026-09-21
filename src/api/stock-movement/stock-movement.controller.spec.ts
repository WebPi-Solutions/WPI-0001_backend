import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StockMovementController } from './stock-movement.controller';
import { StockMovementService } from './stock-movement.service';

describe('StockMovementController', () => {
  let controller: StockMovementController;
  let stockMovementService: {
    findAll: jest.Mock;
    findById: jest.Mock;
    assertItemAccessibleForList: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const itemId = 'item-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  beforeEach(async () => {
    stockMovementService = {
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
      assertItemAccessibleForList: jest.fn().mockResolvedValue(undefined),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [StockMovementController],
      providers: [{ provide: StockMovementService, useValue: stockMovementService }],
    }).compile();

    controller = testingModule.get(StockMovementController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('exige enterpriseId e itemId', async () => {
    await expect(controller.findAll('', itemId)).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
    await expect(controller.findAll(enterpriseId, '')).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('delega el listado y tolera JSON inválido', async () => {
    await controller.findAll(enterpriseId, itemId, 1, 10, 'occurredAt', 'DESC', '{invalido');
    await controller.findAll(
      enterpriseId,
      itemId,
      1,
      10,
      'occurredAt',
      'DESC',
      '{"foo":1}',
      'item',
    );
    expect(stockMovementService.findAll).toHaveBeenCalledWith(
      1,
      10,
      'occurredAt',
      'DESC',
      { itemId },
      ['item', 'itemSerial'],
    );
    expect(stockMovementService.findAll).toHaveBeenCalledWith(
      1,
      10,
      'occurredAt',
      'DESC',
      { foo: 1, itemId },
      ['item', 'itemSerial'],
    );
  });

  it('obtiene un movimiento por id', async () => {
    stockMovementService.findById.mockResolvedValue({ id: 'sm-1' });
    await expect(controller.findById('sm-1')).resolves.toEqual({ id: 'sm-1' });
    await controller.findById('sm-1', 'item');
    expect(stockMovementService.findById).toHaveBeenCalledWith('sm-1', ['item']);
  });
});
