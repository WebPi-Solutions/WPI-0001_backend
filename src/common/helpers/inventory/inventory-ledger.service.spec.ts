import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ItemSerialRepository } from 'src/entities/item-serial/item-serial-repository.service';
import { StockMovementRepository } from 'src/entities/stock-movement/stock-movement-repository.service';
import { SpentConceptRepository } from 'src/entities/spent-concept/spent-concept-repository.service';
import { SpentConceptSerialRepository } from 'src/entities/spent-concept-serial/spent-concept-serial-repository.service';
import { InvoiceConceptRepository } from 'src/entities/invoice-concept/invoice-concept-repository.service';
import { InvoiceConceptSerialRepository } from 'src/entities/invoice-concept-serial/invoice-concept-serial-repository.service';
import { Item } from 'src/entities/item/item.entity';
import { ItemSerial } from 'src/entities/item-serial/item-serial.entity';
import { SpentConcept } from 'src/entities/spent-concept/spent-concept.entity';
import { InvoiceConcept } from 'src/entities/invoice-concept/invoice-concept.entity';
import {
  ItemSerialStatus,
  SpentStatus,
  StockDirection,
  StockType,
} from 'src/common/enums';
import { InventoryLedgerService } from './inventory-ledger.service';

describe('InventoryLedgerService', () => {
  let service: InventoryLedgerService;
  let itemSerialRepository: Record<string, jest.Mock>;
  let stockMovementRepository: Record<string, jest.Mock>;
  let spentConceptRepository: Record<string, jest.Mock>;
  let spentConceptSerialRepository: Record<string, jest.Mock>;
  let invoiceConceptRepository: Record<string, jest.Mock>;

  const occurredAt = new Date('2026-01-01T00:00:00.000Z');
  const serialItem = {
    id: 'item-1',
    serialNumber: true,
    stock: true,
  } as Item;
  const quantityItem = {
    id: 'item-qty',
    serialNumber: false,
    stock: true,
  } as Item;

  const buildItemSerial = (overrides: Partial<ItemSerial> = {}): ItemSerial =>
    ({
      id: 'is-1',
      itemId: 'item-1',
      serialNumber: 'SN-1',
      status: ItemSerialStatus.IN_STOCK,
      ...overrides,
    }) as ItemSerial;

  beforeEach(async () => {
    itemSerialRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByItemIdAndSerialNumber: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };
    stockMovementRepository = {
      create: jest.fn().mockResolvedValue({ id: 'sm-1' }),
      findBySpentConceptId: jest.fn().mockResolvedValue([]),
      findByInvoiceConceptId: jest.fn().mockResolvedValue([]),
      deleteByItemSerialId: jest.fn(),
      deleteBySpentConceptId: jest.fn(),
      deleteById: jest.fn(),
      getBalancesByItemIds: jest.fn().mockResolvedValue(new Map()),
    };
    spentConceptRepository = { findBySpentId: jest.fn().mockResolvedValue([]) };
    spentConceptSerialRepository = {
      findBySpentConceptId: jest.fn().mockResolvedValue([]),
      deleteById: jest.fn(),
    };
    invoiceConceptRepository = { findByInvoiceId: jest.fn().mockResolvedValue([]) };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryLedgerService,
        { provide: ItemSerialRepository, useValue: itemSerialRepository },
        { provide: StockMovementRepository, useValue: stockMovementRepository },
        { provide: SpentConceptRepository, useValue: spentConceptRepository },
        { provide: SpentConceptSerialRepository, useValue: spentConceptSerialRepository },
        { provide: InvoiceConceptRepository, useValue: invoiceConceptRepository },
        { provide: InvoiceConceptSerialRepository, useValue: {} },
      ],
    }).compile();

    service = testingModule.get(InventoryLedgerService);
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  it('detecta gastos cancelados', () => {
    expect(service.isSpentCancelled(SpentStatus.CANCELLED)).toBe(true);
    expect(service.isSpentCancelled('CANCELLED')).toBe(true);
    expect(service.isSpentCancelled(SpentStatus.PAID)).toBe(false);
    expect(service.isSpentCancelled(null)).toBe(false);
  });

  describe('normalizeSerialNumber', () => {
    it('recorta el valor', () => {
      expect(service.normalizeSerialNumber('  SN-1  ')).toBe('SN-1');
    });

    it('rechaza no texto y vacío', () => {
      expect(() => service.normalizeSerialNumber(1)).toThrow(HttpException);
      expect(() => service.normalizeSerialNumber('   ')).toThrow(HttpException);
    });
  });

  describe('registerPurchaseSerial', () => {
    it('rechaza gasto cancelado y artículo sin serie', async () => {
      await expect(
        service.registerPurchaseSerial(
          serialItem,
          { id: 'sc-1' } as SpentConcept,
          SpentStatus.CANCELLED,
          'SN-1',
          occurredAt,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      await expect(
        service.registerPurchaseSerial(
          { id: 'item-1', serialNumber: false, stock: true } as Item,
          { id: 'sc-1' } as SpentConcept,
          SpentStatus.PAID,
          'SN-1',
          occurredAt,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('crea identidad y movimiento de entrada', async () => {
      const created = buildItemSerial();
      itemSerialRepository.findByItemIdAndSerialNumber.mockResolvedValue(null);
      itemSerialRepository.create.mockResolvedValue(created);

      await expect(
        service.registerPurchaseSerial(
          serialItem,
          { id: 'sc-1' } as SpentConcept,
          SpentStatus.PAID,
          'SN-1',
          occurredAt,
        ),
      ).resolves.toEqual(created);
      expect(stockMovementRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: StockDirection.IN,
          type: StockType.PURCHASE,
          quantity: 1,
        }),
      );
    });

    it('rechaza un número de serie ya existente indicando el valor', async () => {
      itemSerialRepository.findByItemIdAndSerialNumber.mockResolvedValue(
        buildItemSerial(),
      );

      await expect(
        service.registerPurchaseSerial(
          serialItem,
          { id: 'sc-1' } as SpentConcept,
          SpentStatus.PAID,
          'SN-1',
          occurredAt,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: 'El número de serie SN-1 ya existe para este artículo',
      });
      expect(itemSerialRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('renamePurchaseSerial', () => {
    it('no persiste si el valor no cambia', async () => {
      const itemSerial = buildItemSerial();
      await expect(service.renamePurchaseSerial(itemSerial, 'SN-1')).resolves.toEqual(itemSerial);
      expect(itemSerialRepository.updateById).not.toHaveBeenCalled();
    });

    it('rechaza unidades reservadas', async () => {
      await expect(
        service.renamePurchaseSerial(
          buildItemSerial({ status: ItemSerialStatus.RESERVED }),
          'SN-2',
        ),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    });

    it('actualiza el número', async () => {
      itemSerialRepository.updateById.mockResolvedValue(buildItemSerial({ serialNumber: 'SN-2' }));
      await service.renamePurchaseSerial(buildItemSerial(), 'SN-2');
      expect(itemSerialRepository.updateById).toHaveBeenCalled();
    });
  });

  describe('removePurchaseSerial', () => {
    it('borra movimientos e identidad si está en stock', async () => {
      await service.removePurchaseSerial(buildItemSerial());
      expect(stockMovementRepository.deleteByItemSerialId).toHaveBeenCalledWith('is-1');
      expect(itemSerialRepository.deleteById).toHaveBeenCalledWith('is-1');
    });

    it('rechaza unidades vendidas', async () => {
      await expect(
        service.removePurchaseSerial(buildItemSerial({ status: ItemSerialStatus.SOLD })),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    });
  });

  describe('reserveSaleSerial', () => {
    it('reserva una unidad en stock', async () => {
      itemSerialRepository.findById.mockResolvedValue(buildItemSerial());
      itemSerialRepository.updateById.mockResolvedValue(
        buildItemSerial({ status: ItemSerialStatus.RESERVED }),
      );
      await service.reserveSaleSerial(serialItem, 'is-1');
      expect(itemSerialRepository.updateById).toHaveBeenCalledWith('is-1', {
        status: ItemSerialStatus.RESERVED,
      });
    });

    it('rechaza unidad de otro artículo o no disponible', async () => {
      itemSerialRepository.findById.mockResolvedValue(buildItemSerial({ itemId: 'otro' }));
      await expect(service.reserveSaleSerial(serialItem, 'is-1')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      itemSerialRepository.findById.mockResolvedValue(
        buildItemSerial({ status: ItemSerialStatus.SOLD }),
      );
      await expect(service.reserveSaleSerial(serialItem, 'is-1')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('lanza 404 si no existe', async () => {
      itemSerialRepository.findById.mockResolvedValue(null);
      await expect(service.reserveSaleSerial(serialItem, 'missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });
  });

  describe('releaseReservedSaleSerial', () => {
    it('libera solo reservas', async () => {
      itemSerialRepository.updateById.mockResolvedValue(buildItemSerial());
      await service.releaseReservedSaleSerial(
        buildItemSerial({ status: ItemSerialStatus.RESERVED }),
      );
      expect(itemSerialRepository.updateById).toHaveBeenCalled();
      await service.releaseReservedSaleSerial(buildItemSerial());
      expect(itemSerialRepository.updateById).toHaveBeenCalledTimes(1);
    });
  });

  describe('replaceReservedSaleSerial', () => {
    it('devuelve la misma unidad si el id no cambia', async () => {
      const current = buildItemSerial({ status: ItemSerialStatus.RESERVED });
      await expect(
        service.replaceReservedSaleSerial(serialItem, current, current.id),
      ).resolves.toEqual(current);
    });

    it('reserva la nueva y libera la anterior', async () => {
      const current = buildItemSerial({ status: ItemSerialStatus.RESERVED });
      itemSerialRepository.findById.mockResolvedValue(buildItemSerial({ id: 'is-2' }));
      itemSerialRepository.updateById.mockResolvedValue(
        buildItemSerial({ id: 'is-2', status: ItemSerialStatus.RESERVED }),
      );
      await service.replaceReservedSaleSerial(serialItem, current, 'is-2');
      expect(itemSerialRepository.updateById).toHaveBeenCalledTimes(2);
    });
  });

  describe('resolveAvailableSaleSerial', () => {
    it('exige itemSerialId o serialNumber', async () => {
      await expect(
        service.resolveAvailableSaleSerial(serialItem, undefined, undefined),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('resuelve por UUID', async () => {
      itemSerialRepository.findById.mockResolvedValue(buildItemSerial());
      await expect(service.resolveAvailableSaleSerial(serialItem, 'is-1', undefined)).resolves.toEqual(
        buildItemSerial(),
      );
    });

    it('resuelve por número o 400 si no existe', async () => {
      itemSerialRepository.findByItemIdAndSerialNumber.mockResolvedValue(buildItemSerial());
      await service.resolveAvailableSaleSerial(serialItem, undefined, ' SN-1 ');
      itemSerialRepository.findByItemIdAndSerialNumber.mockResolvedValue(null);
      await expect(
        service.resolveAvailableSaleSerial(serialItem, undefined, 'SN-X'),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });
  });

  describe('confirmInvoiceIssue', () => {
    it('vende series y exige cantidad coincidente', async () => {
      invoiceConceptRepository.findByInvoiceId.mockResolvedValue([
        {
          id: 'ic-1',
          quantity: 1,
          item: serialItem,
          serials: [
            {
              itemSerial: buildItemSerial({ status: ItemSerialStatus.RESERVED }),
            },
          ],
        } as InvoiceConcept,
      ]);
      itemSerialRepository.updateById.mockResolvedValue(buildItemSerial({ status: ItemSerialStatus.SOLD }));
      await service.confirmInvoiceIssue('inv-1', occurredAt);
      expect(stockMovementRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: StockType.SALE, direction: StockDirection.OUT }),
      );
    });

    it('rechaza cantidad distinta o serie ausente', async () => {
      invoiceConceptRepository.findByInvoiceId.mockResolvedValue([
        {
          id: 'ic-1',
          quantity: 2,
          item: serialItem,
          serials: [{ itemSerial: buildItemSerial() }],
        } as InvoiceConcept,
      ]);
      await expect(service.confirmInvoiceIssue('inv-1', occurredAt)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      invoiceConceptRepository.findByInvoiceId.mockResolvedValue([
        {
          id: 'ic-1',
          quantity: 1,
          item: serialItem,
          serials: [{ itemSerial: null }],
        } as InvoiceConcept,
      ]);
      await expect(service.confirmInvoiceIssue('inv-1', occurredAt)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('mueve cantidad en artículos sin serie y omite líneas sin artículo', async () => {
      invoiceConceptRepository.findByInvoiceId.mockResolvedValue([
        { id: 'ic-manual', item: null, serials: [] } as InvoiceConcept,
        {
          id: 'ic-qty',
          quantity: 3,
          item: quantityItem,
          serials: [],
        } as InvoiceConcept,
      ]);
      await service.confirmInvoiceIssue('inv-1', occurredAt);
      expect(stockMovementRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 3, type: StockType.SALE }),
      );
    });

    it('rechaza vender una unidad ya vendida', async () => {
      invoiceConceptRepository.findByInvoiceId.mockResolvedValue([
        {
          id: 'ic-1',
          quantity: 1,
          item: serialItem,
          serials: [{ itemSerial: buildItemSerial({ status: ItemSerialStatus.SOLD }) }],
        } as InvoiceConcept,
      ]);
      await expect(service.confirmInvoiceIssue('inv-1', occurredAt)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });
  });

  describe('reverseInvoiceCancellation', () => {
    it('devuelve a stock las unidades vendidas y libera reservas', async () => {
      invoiceConceptRepository.findByInvoiceId.mockResolvedValue([
        {
          id: 'ic-1',
          item: serialItem,
          serials: [
            { itemSerial: buildItemSerial({ status: ItemSerialStatus.SOLD }) },
            { itemSerial: buildItemSerial({ id: 'is-2', status: ItemSerialStatus.RESERVED }) },
            { itemSerial: null },
          ],
        } as InvoiceConcept,
      ]);
      itemSerialRepository.updateById.mockResolvedValue(buildItemSerial());
      await service.reverseInvoiceCancellation('inv-1', occurredAt);
      expect(stockMovementRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: StockType.REVERSAL, direction: StockDirection.IN }),
      );
    });

    it('revierte salidas por cantidad y líneas sin artículo', async () => {
      invoiceConceptRepository.findByInvoiceId.mockResolvedValue([
        { id: 'ic-manual', item: null, serials: [] } as InvoiceConcept,
        {
          id: 'ic-qty',
          quantity: 2,
          item: quantityItem,
          serials: [],
        } as InvoiceConcept,
      ]);
      stockMovementRepository.findByInvoiceConceptId.mockResolvedValue([
        { direction: StockDirection.OUT, type: StockType.SALE },
      ]);
      await service.reverseInvoiceCancellation('inv-1', occurredAt);
      expect(stockMovementRepository.create).toHaveBeenCalled();
    });
  });

  describe('releaseDraftInvoiceReservations', () => {
    it('libera reservas de todas las líneas', async () => {
      invoiceConceptRepository.findByInvoiceId.mockResolvedValue([
        {
          id: 'ic-1',
          serials: [{ itemSerial: buildItemSerial({ status: ItemSerialStatus.RESERVED }) }],
        } as InvoiceConcept,
      ]);
      itemSerialRepository.updateById.mockResolvedValue(buildItemSerial());
      await service.releaseDraftInvoiceReservations('inv-1');
      expect(itemSerialRepository.updateById).toHaveBeenCalled();
    });
  });

  describe('releaseInvoiceConceptReservationsById', () => {
    it('no hace nada si la línea no existe', async () => {
      invoiceConceptRepository.findById = jest.fn().mockResolvedValue(null);
      await service.releaseInvoiceConceptReservationsById('missing');
      expect(itemSerialRepository.updateById).not.toHaveBeenCalled();
    });

    it('libera las reservas de la línea', async () => {
      invoiceConceptRepository.findById = jest.fn().mockResolvedValue({
        id: 'ic-1',
        serials: [{ itemSerial: buildItemSerial({ status: ItemSerialStatus.RESERVED }) }],
      });
      itemSerialRepository.updateById.mockResolvedValue(buildItemSerial());
      await service.releaseInvoiceConceptReservationsById('ic-1');
      expect(itemSerialRepository.updateById).toHaveBeenCalled();
    });
  });

  describe('syncPurchaseQuantityMovement', () => {
    it('no mueve stock cancelado o con serie', async () => {
      await service.syncPurchaseQuantityMovement(
        { id: 'sc-1', quantity: 2 } as SpentConcept,
        quantityItem,
        SpentStatus.CANCELLED,
        occurredAt,
      );
      await service.syncPurchaseQuantityMovement(
        { id: 'sc-1', quantity: 2 } as SpentConcept,
        serialItem,
        SpentStatus.PAID,
        occurredAt,
      );
      expect(stockMovementRepository.create).not.toHaveBeenCalled();
    });

    it('reemplaza movimientos de cantidad', async () => {
      stockMovementRepository.findBySpentConceptId.mockResolvedValue([
        { id: 'old', itemSerialId: null },
        { id: 'serial-mov', itemSerialId: 'is-1' },
      ]);
      await service.syncPurchaseQuantityMovement(
        { id: 'sc-1', quantity: 4 } as SpentConcept,
        quantityItem,
        SpentStatus.PAID,
        occurredAt,
      );
      expect(stockMovementRepository.deleteById).toHaveBeenCalledWith('old');
      expect(stockMovementRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 4, type: StockType.PURCHASE }),
      );
    });

    it('rechaza cantidad no positiva', async () => {
      await expect(
        service.syncPurchaseQuantityMovement(
          { id: 'sc-1', quantity: 0 } as SpentConcept,
          quantityItem,
          SpentStatus.PAID,
          occurredAt,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });
  });

  describe('purge y cancelación de gasto', () => {
    it('purgeSpentConceptInventory borra movimientos, snapshots e identidades', async () => {
      spentConceptSerialRepository.findBySpentConceptId.mockResolvedValue([
        { id: 'scs-1', itemSerialId: 'is-1', itemSerial: buildItemSerial() },
      ]);
      await service.purgeSpentConceptInventory('sc-1');
      expect(stockMovementRepository.deleteBySpentConceptId).toHaveBeenCalledWith('sc-1');
      expect(spentConceptSerialRepository.deleteById).toHaveBeenCalledWith('scs-1');
      expect(itemSerialRepository.deleteById).toHaveBeenCalledWith('is-1');
    });

    it('no anula un gasto con series vendidas', async () => {
      spentConceptRepository.findBySpentId.mockResolvedValue([
        {
          serials: [{ itemSerial: buildItemSerial({ status: ItemSerialStatus.SOLD }) }],
        },
      ]);
      await expect(service.cancelSpentInventory('spent-1', occurredAt)).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });
    });

    it('omite snapshots de compra sin unidad canónica', async () => {
      spentConceptRepository.findBySpentId.mockResolvedValue([
        {
          id: 'sc-1',
          item: serialItem,
          serials: [{ itemSerial: undefined }],
        },
      ]);
      await service.cancelSpentInventory('spent-1', occurredAt);
      expect(itemSerialRepository.updateById).not.toHaveBeenCalled();
    });

    it('anula series y revierte cantidad', async () => {
      spentConceptRepository.findBySpentId.mockResolvedValue([
        {
          id: 'sc-1',
          quantity: 2,
          item: quantityItem,
          serials: [{ itemSerial: buildItemSerial() }],
        },
      ]);
      itemSerialRepository.updateById.mockResolvedValue(
        buildItemSerial({ status: ItemSerialStatus.VOIDED }),
      );
      await service.cancelSpentInventory('spent-1', occurredAt);
      expect(itemSerialRepository.updateById).toHaveBeenCalledWith('is-1', {
        status: ItemSerialStatus.VOIDED,
      });
      expect(stockMovementRepository.create).toHaveBeenCalled();
    });

    it('cubre defaults de cantidad y series ausentes', async () => {
      invoiceConceptRepository.findByInvoiceId.mockResolvedValue([
        { id: 'ic-serial', item: serialItem } as InvoiceConcept,
      ]);
      await expect(service.confirmInvoiceIssue('inv-1', occurredAt)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });

      invoiceConceptRepository.findByInvoiceId.mockResolvedValue([
        { id: 'ic-qty', item: quantityItem } as InvoiceConcept,
      ]);
      await service.confirmInvoiceIssue('inv-1', occurredAt);
      expect(stockMovementRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 1, type: StockType.SALE }),
      );

      invoiceConceptRepository.findByInvoiceId.mockResolvedValue([
        { id: 'ic-serial-empty', item: serialItem } as InvoiceConcept,
        {
          id: 'ic-qty-empty',
          item: quantityItem,
        } as InvoiceConcept,
      ]);
      stockMovementRepository.findByInvoiceConceptId.mockResolvedValue([
        { direction: StockDirection.OUT, type: StockType.SALE },
      ]);
      await service.reverseInvoiceCancellation('inv-1', occurredAt);
      expect(stockMovementRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 1, type: StockType.REVERSAL }),
      );

      invoiceConceptRepository.findByInvoiceId.mockResolvedValue([
        { id: 'ic-release' } as InvoiceConcept,
      ]);
      await service.releaseDraftInvoiceReservations('inv-1');

      invoiceConceptRepository.findById = jest.fn().mockResolvedValue({
        id: 'ic-1',
        serials: [{ itemSerial: undefined }],
      });
      await service.releaseInvoiceConceptReservationsById('ic-1');

      spentConceptRepository.findBySpentId.mockResolvedValue([
        { id: 'sc-empty', item: quantityItem },
      ]);
      await service.cancelSpentInventory('spent-1', occurredAt);
      expect(stockMovementRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 1, type: StockType.REVERSAL }),
      );

      await service.syncPurchaseQuantityMovement(
        { id: 'sc-default' } as SpentConcept,
        quantityItem,
        SpentStatus.PAID,
        occurredAt,
      );
      expect(stockMovementRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 1, type: StockType.PURCHASE }),
      );
    });

    it('purgeSpentInventory recorre las líneas', async () => {
      spentConceptRepository.findBySpentId.mockResolvedValue([{ id: 'sc-1', serials: [] }]);
      spentConceptSerialRepository.findBySpentConceptId.mockResolvedValue([]);
      await service.purgeSpentInventory('spent-1');
      expect(stockMovementRepository.deleteBySpentConceptId).toHaveBeenCalledWith('sc-1');
    });
  });

  describe('saldos', () => {
    it('adjunta ceros si no hay movimientos', async () => {
      const item = { id: 'item-1' } as Item;
      await service.attachStockBalances([item]);
      expect(item.stockOnHand).toBe(0);
    });

    it('adjunta saldos existentes', async () => {
      stockMovementRepository.getBalancesByItemIds.mockResolvedValue(
        new Map([
          [
            'item-1',
            { itemId: 'item-1', stockEntries: 5, stockExits: 2, stockOnHand: 3 },
          ],
        ]),
      );
      const item = { id: 'item-1' } as Item;
      await service.attachStockBalances([item]);
      expect(item.stockEntries).toBe(5);
      const balance = await service.getItemStockBalance('item-2');
      expect(balance.stockOnHand).toBe(0);
    });
  });
});
