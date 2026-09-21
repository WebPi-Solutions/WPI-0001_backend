import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StockMovementRepository } from 'src/entities/stock-movement/stock-movement-repository.service';
import { ItemRepository } from 'src/entities/item/item-repository.service';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { StockMovement } from 'src/entities/stock-movement/stock-movement.entity';
import { StockMovementService } from './stock-movement.service';

describe('StockMovementService', () => {
  let service: StockMovementService;
  let stockMovementRepository: { findAll: jest.Mock; findById: jest.Mock };
  let itemRepository: { findById: jest.Mock };
  let enterpriseAccessService: {
    assertCurrentEntityAccessible: jest.Mock;
    mergeRelationNames: (relations: string[] | undefined, required: string[]) => string[];
  };

  const enterpriseId = 'enterprise-uuid';
  const itemId = 'item-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  beforeEach(async () => {
    stockMovementRepository = {
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
    };
    itemRepository = {
      findById: jest.fn().mockResolvedValue({
        id: itemId,
        itemCategory: { enterpriseId },
      }),
    };
    enterpriseAccessService = {
      assertCurrentEntityAccessible: jest.fn(),
      mergeRelationNames: (relations?: string[], required: string[] = []) =>
        [...new Set([...(relations ?? []), ...required])],
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        StockMovementService,
        { provide: StockMovementRepository, useValue: stockMovementRepository },
        { provide: ItemRepository, useValue: itemRepository },
        { provide: EnterpriseAccessService, useValue: enterpriseAccessService },
      ],
    }).compile();

    service = testingModule.get(StockMovementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('lista movimientos', async () => {
    await expect(
      service.findAll(1, 10, 'occurredAt', 'DESC', { itemId }, ['item']),
    ).resolves.toEqual(emptyPaginatedResponse);
  });

  describe('findById', () => {
    it('devuelve el movimiento', async () => {
      const stockMovement = {
        id: 'sm-1',
        item: { itemCategory: { enterpriseId } },
      } as StockMovement;
      stockMovementRepository.findById.mockResolvedValue(stockMovement);
      await expect(service.findById('sm-1')).resolves.toEqual(stockMovement);
      expect(stockMovementRepository.findById).toHaveBeenCalledWith('sm-1', [
        'item',
        'item.itemCategory',
        'itemSerial',
      ]);
    });

    it('lanza 404 si no existe', async () => {
      stockMovementRepository.findById.mockResolvedValue(null);
      await expect(service.findById('missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });
  });

  describe('assertItemAccessibleForList', () => {
    it('404 si no existe o es de otra empresa', async () => {
      itemRepository.findById.mockResolvedValue(null);
      await expect(service.assertItemAccessibleForList(itemId, enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
      itemRepository.findById.mockResolvedValue({ itemCategory: { enterpriseId: 'otra' } });
      await expect(service.assertItemAccessibleForList(itemId, enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });

    it('acepta el artículo de la empresa', async () => {
      await expect(
        service.assertItemAccessibleForList(itemId, enterpriseId),
      ).resolves.toBeUndefined();
    });
  });
});
