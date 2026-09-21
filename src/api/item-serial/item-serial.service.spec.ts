import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ItemSerialRepository } from 'src/entities/item-serial/item-serial-repository.service';
import { ItemRepository } from 'src/entities/item/item-repository.service';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { InventoryLedgerService } from 'src/common/helpers/inventory/inventory-ledger.service';
import { ItemSerial } from 'src/entities/item-serial/item-serial.entity';
import { Item } from 'src/entities/item/item.entity';
import { ItemSerialStatus } from 'src/common/enums';
import { ItemSerialService } from './item-serial.service';

describe('ItemSerialService', () => {
  let service: ItemSerialService;
  let itemSerialRepository: { findAll: jest.Mock; findById: jest.Mock };
  let itemRepository: { findById: jest.Mock };
  let enterpriseAccessService: {
    assertCurrentEntityAccessible: jest.Mock;
    mergeRelationNames: (relations: string[] | undefined, required: string[]) => string[];
  };
  let inventoryLedgerService: { loadItemSerialOrThrow: jest.Mock };

  const enterpriseId = 'enterprise-uuid';
  const itemId = 'item-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  const buildItem = (): Item =>
    ({
      id: itemId,
      itemCategory: { enterpriseId },
    }) as Item;

  const buildItemSerial = (): ItemSerial =>
    ({
      id: 'is-1',
      itemId,
      item: buildItem(),
    }) as ItemSerial;

  beforeEach(async () => {
    itemSerialRepository = {
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
    };
    itemRepository = { findById: jest.fn().mockResolvedValue(buildItem()) };
    enterpriseAccessService = {
      assertCurrentEntityAccessible: jest.fn(),
      mergeRelationNames: (relations?: string[], required: string[] = []) =>
        [...new Set([...(relations ?? []), ...required])],
    };
    inventoryLedgerService = {
      loadItemSerialOrThrow: jest.fn().mockResolvedValue(buildItemSerial()),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        ItemSerialService,
        { provide: ItemSerialRepository, useValue: itemSerialRepository },
        { provide: ItemRepository, useValue: itemRepository },
        { provide: EnterpriseAccessService, useValue: enterpriseAccessService },
        { provide: InventoryLedgerService, useValue: inventoryLedgerService },
      ],
    }).compile();

    service = testingModule.get(ItemSerialService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('lista números de serie', async () => {
    await expect(
      service.findAll(1, 10, 'serialNumber', 'ASC', { itemId }, ['item']),
    ).resolves.toEqual(emptyPaginatedResponse);
  });

  describe('findById', () => {
    it('devuelve la unidad', async () => {
      await expect(service.findById('is-1')).resolves.toEqual(buildItemSerial());
    });

    it('recarga si hay más relaciones', async () => {
      itemSerialRepository.findById.mockResolvedValue(buildItemSerial());
      await service.findById('is-1', ['item', 'stockMovements']);
      expect(itemSerialRepository.findById).toHaveBeenCalled();
    });

    it('lanza 404 si la recarga no encuentra', async () => {
      itemSerialRepository.findById.mockResolvedValue(null);
      await expect(service.findById('is-1', ['stockMovements'])).rejects.toMatchObject({
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
      itemRepository.findById.mockResolvedValue({
        itemCategory: { enterpriseId: 'otra' },
      });
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

  describe('parseStatusFilter', () => {
    it('devuelve undefined si falta', () => {
      expect(service.parseStatusFilter(undefined)).toBeUndefined();
    });

    it('parsea un estado válido', () => {
      expect(service.parseStatusFilter('in_stock')).toBe(ItemSerialStatus.IN_STOCK);
    });

    it('rechaza un estado inválido', () => {
      expect(() => service.parseStatusFilter('draft')).toThrow(HttpException);
    });
  });
});
