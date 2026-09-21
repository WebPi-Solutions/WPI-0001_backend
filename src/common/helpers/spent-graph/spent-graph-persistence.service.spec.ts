import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, EntityManager } from 'typeorm';
import { ItemSerialStatus, SpentStatus, StockDirection, StockType } from 'src/common/enums';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { InventoryLedgerService } from 'src/common/helpers/inventory/inventory-ledger.service';
import { Item } from 'src/entities/item/item.entity';
import { ItemRepository } from 'src/entities/item/item-repository.service';
import { ItemSerial } from 'src/entities/item-serial/item-serial.entity';
import { ItemSerialRepository } from 'src/entities/item-serial/item-serial-repository.service';
import { Spent } from 'src/entities/spent/spent.entity';
import { SpentRepository } from 'src/entities/spent/spent-repository.service';
import { SpentConcept } from 'src/entities/spent-concept/spent-concept.entity';
import { SpentConceptRepository } from 'src/entities/spent-concept/spent-concept-repository.service';
import { SpentConceptSerial } from 'src/entities/spent-concept-serial/spent-concept-serial.entity';
import { StockMovement } from 'src/entities/stock-movement/stock-movement.entity';
import { SpentGraphPersistenceService } from './spent-graph-persistence.service';

describe('SpentGraphPersistenceService', () => {
  const enterpriseId = 'enterprise-1';
  const existingSpentId = 'spent-existing';
  let service: SpentGraphPersistenceService;
  let dataSource: { transaction: jest.Mock };
  let entityManager: { save: jest.Mock; delete: jest.Mock };
  let spentRepository: { findById: jest.Mock };
  let spentConceptRepository: { findBySpentId: jest.Mock };
  let itemRepository: { findById: jest.Mock };
  let itemSerialRepository: { findByItemIdAndSerialNumber: jest.Mock };
  let enterpriseAccessService: { assertCurrentEntityAccessible: jest.Mock };
  let inventoryLedgerService: {
    isSpentCancelled: jest.Mock;
    normalizeSerialNumber: jest.Mock;
  };

  const serialItem = {
    id: 'item-serial',
    serialNumber: true,
    stock: true,
    ean: '1111111111111',
    itemCategory: { enterpriseId },
  } as Item;
  const quantityItem = {
    id: 'item-qty',
    serialNumber: false,
    stock: true,
    ean: '2222222222222',
    itemCategory: { enterpriseId },
  } as Item;
  const foreignItem = {
    id: 'item-foreign',
    serialNumber: true,
    stock: true,
    itemCategory: { enterpriseId: 'otra-empresa' },
  } as Item;

  /**
   * Cabecera de gasto de prueba.
   *
   * @param overrides - Campos a sobrescribir
   * @returns Gasto simulado
   */
  const buildSpentHeader = (overrides: Partial<Spent> = {}): Spent =>
    ({
      supplierId: 'supplier-1',
      name: 'Factura Apple',
      issuedDate: new Date('2026-01-15'),
      collectionDate: new Date('2026-01-20'),
      declarationDate: new Date('2026-01-15'),
      status: SpentStatus.PAID,
      file: false,
      ...overrides,
    }) as Spent;

  /**
   * Línea de gasto de prueba.
   *
   * @param overrides - Campos a sobrescribir
   * @returns Concepto simulado
   */
  const buildSpentConcept = (overrides: Partial<SpentConcept> = {}): SpentConcept =>
    ({
      name: 'Macbook',
      itemId: serialItem.id,
      quantity: 1,
      basePrice: 1000,
      vat: 21,
      irpf: 0,
      position: 0,
      serials: [{ serialNumber: 'SN-MAC-1' } as SpentConceptSerial],
      ...overrides,
    }) as SpentConcept;

  /**
   * Recarga simulada tras el commit.
   *
   * @returns Gasto con líneas
   */
  const buildReloadedSpent = (): Spent =>
    ({
      id: 'spent-new',
      name: 'Factura Apple',
      spentConcepts: [],
    }) as Spent;

  beforeEach(async () => {
    entityManager = {
      save: jest.fn(async (entityClass: unknown, payload: Record<string, unknown>) => {
        if (entityClass === Spent) {
          return { id: 'spent-new', status: payload.status, ...payload };
        }
        if (entityClass === SpentConcept) {
          return { id: (payload.id as string) ?? 'concept-new', ...payload };
        }
        if (entityClass === ItemSerial) {
          return { id: 'item-serial-new', serialNumber: payload.serialNumber, ...payload };
        }
        return { id: 'row-new', ...payload };
      }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = {
      transaction: jest.fn(async (transactionCallback: (manager: EntityManager) => Promise<unknown>) =>
        transactionCallback(entityManager as unknown as EntityManager),
      ),
    };
    spentRepository = {
      findById: jest.fn().mockResolvedValue(buildReloadedSpent()),
    };
    spentConceptRepository = {
      findBySpentId: jest.fn().mockResolvedValue([]),
    };
    itemRepository = {
      findById: jest.fn(async (itemId: string) => {
        const itemsById = new Map<string, Item>([
          [serialItem.id, serialItem],
          [quantityItem.id, quantityItem],
          [foreignItem.id, foreignItem],
        ]);
        return itemsById.get(itemId) ?? null;
      }),
    };
    itemSerialRepository = {
      findByItemIdAndSerialNumber: jest.fn().mockResolvedValue(null),
    };
    enterpriseAccessService = {
      assertCurrentEntityAccessible: jest.fn(),
    };
    inventoryLedgerService = {
      isSpentCancelled: jest.fn(
        (spentStatus: string) => (spentStatus ?? '').trim().toLowerCase() === SpentStatus.CANCELLED,
      ),
      normalizeSerialNumber: jest.fn((rawSerialNumber: unknown) => {
        if (typeof rawSerialNumber !== 'string') {
          throw new HttpException(
            'El número de serie debe ser una cadena de texto',
            HttpStatus.BAD_REQUEST,
          );
        }
        const trimmedSerialNumber = rawSerialNumber.trim();
        if (trimmedSerialNumber === '') {
          throw new HttpException(
            'El número de serie no puede estar vacío',
            HttpStatus.BAD_REQUEST,
          );
        }
        return trimmedSerialNumber;
      }),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        SpentGraphPersistenceService,
        { provide: DataSource, useValue: dataSource },
        { provide: SpentRepository, useValue: spentRepository },
        { provide: SpentConceptRepository, useValue: spentConceptRepository },
        { provide: ItemRepository, useValue: itemRepository },
        { provide: ItemSerialRepository, useValue: itemSerialRepository },
        { provide: EnterpriseAccessService, useValue: enterpriseAccessService },
        { provide: InventoryLedgerService, useValue: inventoryLedgerService },
      ],
    }).compile();

    service = testingModule.get(SpentGraphPersistenceService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('createSpentGraph', () => {
    it('no abre la transacción si un número de serie del catálogo choca', async () => {
      itemSerialRepository.findByItemIdAndSerialNumber.mockResolvedValue({
        id: 'existing-serial',
        serialNumber: 'SN-MAC-1',
      });

      await expect(
        service.createSpentGraph(buildSpentHeader(), [buildSpentConcept()], enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        message: 'El número de serie SN-MAC-1 ya existe para este artículo',
      });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('lista todos los números de serie en conflicto en un único 409', async () => {
      itemSerialRepository.findByItemIdAndSerialNumber.mockImplementation(
        async (_itemId: string, serialNumber: string) => ({ id: 'x', serialNumber }),
      );

      await expect(
        service.createSpentGraph(
          buildSpentHeader(),
          [
            buildSpentConcept({
              quantity: 1,
              serials: [{ serialNumber: 'SN-1' } as SpentConceptSerial],
            }),
            buildSpentConcept({
              name: 'iPhone',
              position: 1,
              quantity: 1,
              serials: [{ serialNumber: 'SN-2' } as SpentConceptSerial],
            }),
          ],
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        message: 'Los números de serie SN-1, SN-2 ya existen para este artículo',
      });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('guarda cabecera, iPhone y Macbook en la misma transacción', async () => {
      const created = await service.createSpentGraph(
        buildSpentHeader(),
        [
          buildSpentConcept({
            name: 'iPhone',
            quantity: 1,
            serials: [{ serialNumber: ' SN-IPHONE-1 ' } as SpentConceptSerial],
          }),
          buildSpentConcept({
            name: 'Macbook',
            position: 1,
            quantity: 1,
            serials: [{ serialNumber: 'SN-MAC-1' } as SpentConceptSerial],
          }),
        ],
        enterpriseId,
      );

      expect(created.id).toBe('spent-new');
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(entityManager.save).toHaveBeenCalledWith(
        Spent,
        expect.objectContaining({ supplierId: 'supplier-1', name: 'Factura Apple' }),
      );
      expect(entityManager.save).toHaveBeenCalledWith(
        ItemSerial,
        expect.objectContaining({ serialNumber: 'SN-IPHONE-1', status: ItemSerialStatus.IN_STOCK }),
      );
      expect(entityManager.save).toHaveBeenCalledWith(
        ItemSerial,
        expect.objectContaining({ serialNumber: 'SN-MAC-1' }),
      );
      expect(entityManager.save).toHaveBeenCalledWith(
        StockMovement,
        expect.objectContaining({
          direction: StockDirection.IN,
          type: StockType.PURCHASE,
          quantity: 1,
        }),
      );
      expect(entityManager.save).toHaveBeenCalledWith(
        SpentConceptSerial,
        expect.objectContaining({ serialNumber: 'SN-IPHONE-1' }),
      );
    });

    it('persiste un movimiento de cantidad si el artículo no usa series', async () => {
      await service.createSpentGraph(
        buildSpentHeader(),
        [
          buildSpentConcept({
            itemId: quantityItem.id,
            quantity: 3,
            serials: [],
            ean: undefined,
          }),
        ],
        enterpriseId,
      );

      expect(entityManager.save).toHaveBeenCalledWith(
        StockMovement,
        expect.objectContaining({
          itemId: quantityItem.id,
          itemSerialId: null,
          quantity: 3,
        }),
      );
      expect(entityManager.save).not.toHaveBeenCalledWith(ItemSerial, expect.anything());
    });

    it('no escribe inventario si el gasto nace cancelado', async () => {
      await service.createSpentGraph(
        buildSpentHeader({ status: SpentStatus.CANCELLED, issuedDate: undefined }),
        [buildSpentConcept()],
        enterpriseId,
      );

      expect(entityManager.save).not.toHaveBeenCalledWith(ItemSerial, expect.anything());
      expect(entityManager.save).not.toHaveBeenCalledWith(StockMovement, expect.anything());
    });

    it('crea solo la cabecera si no hay líneas', async () => {
      await service.createSpentGraph(buildSpentHeader(), undefined, enterpriseId);

      expect(entityManager.save).toHaveBeenCalledTimes(1);
      expect(entityManager.save).toHaveBeenCalledWith(Spent, expect.any(Object));
    });

    it('traduce 23505 de item_serials a 409', async () => {
      dataSource.transaction.mockRejectedValue({
        code: '23505',
        constraint: 'item_serials_item_id_serial_number_key',
      });

      await expect(
        service.createSpentGraph(buildSpentHeader(), [], enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        message: 'El número de serie ya existe para este artículo',
      });
    });

    it('traduce otros 23505 a un 409 genérico', async () => {
      dataSource.transaction.mockRejectedValue({
        driverError: {
          code: '23505',
          constraint: 'spent_concepts_spent_id_position_key',
        },
      });

      await expect(
        service.createSpentGraph(buildSpentHeader(), [], enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        message: 'No se pudo guardar el gasto por un conflicto de datos duplicados',
      });
    });

    it('propaga HttpException surgida dentro de la transacción', async () => {
      entityManager.save.mockRejectedValue(
        new HttpException('fallo interno', HttpStatus.BAD_REQUEST),
      );

      await expect(
        service.createSpentGraph(buildSpentHeader(), [], enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'fallo interno',
      });
    });

    it('traduce 23505 sin nombre de restricción a un 409 genérico', async () => {
      dataSource.transaction.mockRejectedValue({ code: '23505' });

      await expect(
        service.createSpentGraph(buildSpentHeader(), [], enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        message: 'No se pudo guardar el gasto por un conflicto de datos duplicados',
      });
    });

    it('propaga errores que no son de unicidad', async () => {
      dataSource.transaction.mockRejectedValue(new Error('conexion'));

      await expect(
        service.createSpentGraph(buildSpentHeader(), [], enterpriseId),
      ).rejects.toThrow('conexion');
    });

    it('exige proveedor al construir la cabecera', async () => {
      await expect(
        service.createSpentGraph(
          buildSpentHeader({ supplierId: '  ', supplier: undefined }),
          [],
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El gasto debe tener un proveedor',
      });
    });

    it('lanza 404 si la recarga posterior al commit no encuentra el gasto', async () => {
      spentRepository.findById.mockResolvedValue(null);

      await expect(
        service.createSpentGraph(buildSpentHeader(), [], enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Gasto no encontrado',
      });
    });
  });

  describe('validación de líneas', () => {
    it('exige nombre de línea', async () => {
      await expect(
        service.createSpentGraph(
          buildSpentHeader(),
          [buildSpentConcept({ name: '  ' })],
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El concepto debe tener un nombre',
      });
    });

    it('exige un número de serie por unidad', async () => {
      await expect(
        service.createSpentGraph(
          buildSpentHeader(),
          [buildSpentConcept({ quantity: 2 })],
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Debe informar un número de serie por cada unidad',
      });
    });

    it('rechaza series repetidas en el mismo concepto', async () => {
      await expect(
        service.createSpentGraph(
          buildSpentHeader(),
          [
            buildSpentConcept({
              quantity: 2,
              serials: [
                { serialNumber: 'SN-DUP' } as SpentConceptSerial,
                { serialNumber: 'SN-DUP' } as SpentConceptSerial,
              ],
            }),
          ],
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Los números de serie de un mismo concepto no pueden repetirse',
      });
    });

    it('rechaza el mismo número de serie en dos conceptos del artículo', async () => {
      await expect(
        service.createSpentGraph(
          buildSpentHeader(),
          [
            buildSpentConcept({
              serials: [{ serialNumber: 'SN-SHARED' } as SpentConceptSerial],
            }),
            buildSpentConcept({
              name: 'iPhone',
              position: 1,
              serials: [{ serialNumber: 'SN-SHARED' } as SpentConceptSerial],
            }),
          ],
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El número de serie SN-SHARED ya está asignado a otro concepto de este artículo',
      });
    });

    it('prohíbe series en un artículo que no las gestiona', async () => {
      await expect(
        service.createSpentGraph(
          buildSpentHeader(),
          [
            buildSpentConcept({
              itemId: quantityItem.id,
              serials: [{ serialNumber: 'SN-NO' } as SpentConceptSerial],
            }),
          ],
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message:
          'Solo se pueden asignar números de serie a conceptos vinculados a un artículo que se gestiona con número de serie',
      });
    });

    it('lanza 404 si el artículo no existe', async () => {
      await expect(
        service.createSpentGraph(
          buildSpentHeader(),
          [buildSpentConcept({ itemId: 'missing-item', serials: [] })],
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de gasto no encontrado',
      });
    });

    it('lanza 404 si el artículo es de otra empresa', async () => {
      await expect(
        service.createSpentGraph(
          buildSpentHeader(),
          [buildSpentConcept({ itemId: foreignItem.id, serials: [] })],
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de gasto no encontrado',
      });
    });

    it('acepta el artículo anidado y recorta el EAN vacío', async () => {
      await service.createSpentGraph(
        buildSpentHeader(),
        [
          buildSpentConcept({
            itemId: undefined,
            item: serialItem,
            ean: '   ',
          }),
        ],
        enterpriseId,
      );

      expect(entityManager.save).toHaveBeenCalledWith(
        SpentConcept,
        expect.objectContaining({ itemId: serialItem.id, ean: null }),
      );
    });

    it('usa el EAN del artículo si la línea no informa ninguno', async () => {
      await service.createSpentGraph(
        buildSpentHeader(),
        [buildSpentConcept({ ean: undefined })],
        enterpriseId,
      );

      expect(entityManager.save).toHaveBeenCalledWith(
        SpentConcept,
        expect.objectContaining({ ean: serialItem.ean }),
      );
    });

    it('rechaza cantidades inválidas', async () => {
      await expect(
        service.createSpentGraph(
          buildSpentHeader(),
          [buildSpentConcept({ quantity: 0, serials: [] })],
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'La cantidad debe ser un número entero mayor o igual que 1',
      });
    });

    it('rechaza IVA negativo', async () => {
      await expect(
        service.createSpentGraph(
          buildSpentHeader(),
          [buildSpentConcept({ vat: -1 })],
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El IVA debe ser un número entero mayor o igual que 0',
      });
    });

    it('rechaza importes no numéricos', async () => {
      await expect(
        service.createSpentGraph(
          buildSpentHeader(),
          [buildSpentConcept({ basePrice: 'abc' as unknown as number })],
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El precio base debe ser un número válido',
      });
    });

    it('rechaza importes en blanco', async () => {
      await expect(
        service.createSpentGraph(
          buildSpentHeader(),
          [buildSpentConcept({ basePrice: '  ' as unknown as number })],
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El precio base debe ser un número válido',
      });
    });

    it('acepta importes y posición en cadena', async () => {
      await service.createSpentGraph(
        buildSpentHeader(),
        [
          buildSpentConcept({
            basePrice: '12.5' as unknown as number,
            vat: '21' as unknown as number,
            irpf: '0' as unknown as number,
            position: '2' as unknown as number,
            quantity: '1' as unknown as number,
          }),
        ],
        enterpriseId,
      );

      expect(entityManager.save).toHaveBeenCalledWith(
        SpentConcept,
        expect.objectContaining({ basePrice: 12.5, vat: 21, position: 2 }),
      );
    });

    it('rechaza un número de serie que no es texto', async () => {
      await expect(
        service.createSpentGraph(
          buildSpentHeader(),
          [
            buildSpentConcept({
              serials: [{ serialNumber: 12 as unknown as string } as SpentConceptSerial],
            }),
          ],
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El número de serie debe ser una cadena de texto',
      });
    });

    it('envuelve errores inesperados al normalizar el número de serie', async () => {
      inventoryLedgerService.normalizeSerialNumber.mockImplementation(() => {
        throw new Error('boom');
      });

      await expect(
        service.createSpentGraph(buildSpentHeader(), [buildSpentConcept()], enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El número de serie no puede estar vacío',
      });
    });

    it('ignora series que el ledger recorta a vacío', async () => {
      inventoryLedgerService.normalizeSerialNumber.mockReturnValue('');

      await expect(
        service.createSpentGraph(buildSpentHeader(), [buildSpentConcept()], enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Debe informar un número de serie por cada unidad',
      });
    });

    it('acepta el proveedor anidado y un artículo sin stock', async () => {
      const noStockItem = {
        id: 'item-no-stock',
        serialNumber: false,
        stock: false,
        itemCategory: { enterpriseId },
      } as Item;
      itemRepository.findById.mockImplementation(async (itemId: string) => {
        if (itemId === noStockItem.id) {
          return noStockItem;
        }
        return serialItem;
      });

      await service.createSpentGraph(
        buildSpentHeader({
          supplierId: undefined,
          supplier: { id: 'supplier-nested' } as Spent['supplier'],
        }),
        [
          buildSpentConcept({
            itemId: noStockItem.id,
            serials: [],
          }),
        ],
        enterpriseId,
      );

      expect(entityManager.save).toHaveBeenCalledWith(
        Spent,
        expect.objectContaining({ supplierId: 'supplier-nested' }),
      );
      expect(entityManager.save).not.toHaveBeenCalledWith(StockMovement, expect.anything());
    });

    it('rechaza un nombre de línea que no es texto', async () => {
      await expect(
        service.createSpentGraph(
          buildSpentHeader(),
          [buildSpentConcept({ name: 1 as unknown as string, serials: [] })],
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El concepto debe tener un nombre',
      });
    });

    it('aplica valores por defecto de cantidad, IVA e IRPF', async () => {
      await service.createSpentGraph(
        buildSpentHeader(),
        [
          {
            name: 'Línea mínima',
            itemId: null,
          } as SpentConcept,
        ],
        enterpriseId,
      );

      expect(entityManager.save).toHaveBeenCalledWith(
        SpentConcept,
        expect.objectContaining({ quantity: 1, vat: 21, irpf: 0, position: 0 }),
      );
    });

    it('permite un concepto de texto libre sin artículo', async () => {
      await service.createSpentGraph(
        buildSpentHeader(),
        [
          buildSpentConcept({
            itemId: null,
            item: undefined,
            serials: [],
            ean: 'EAN-LIBRE',
          }),
        ],
        enterpriseId,
      );

      expect(entityManager.save).toHaveBeenCalledWith(
        SpentConcept,
        expect.objectContaining({ itemId: null, ean: 'EAN-LIBRE' }),
      );
      expect(entityManager.save).not.toHaveBeenCalledWith(StockMovement, expect.anything());
    });
  });

  describe('updateSpentGraph', () => {
    /**
     * Gasto persistido de prueba.
     *
     * @returns Gasto existente
     */
    const buildExistingSpent = (): Spent =>
      ({
        id: existingSpentId,
        supplierId: 'supplier-1',
        name: 'Factura previa',
        status: SpentStatus.PAID,
        issuedDate: new Date('2026-01-01'),
        supplier: { id: 'supplier-1', enterpriseId },
      }) as Spent;

    /**
     * Línea persistida con series.
     *
     * @param overrides - Campos a sobrescribir
     * @returns Línea existente
     */
    const buildExistingLine = (overrides: Partial<SpentConcept> = {}): SpentConcept =>
      ({
        id: 'concept-1',
        spentId: existingSpentId,
        itemId: serialItem.id,
        name: 'Macbook',
        quantity: 1,
        serials: [
          {
            id: 'scs-1',
            itemSerialId: 'is-1',
            serialNumber: 'SN-OWNED',
            itemSerial: { id: 'is-1', status: ItemSerialStatus.IN_STOCK },
          } as SpentConceptSerial,
        ],
        ...overrides,
      }) as SpentConcept;

    beforeEach(() => {
      spentConceptRepository.findBySpentId.mockResolvedValue([buildExistingLine()]);
    });

    it('usa el estado previo si la cabecera no envía status', async () => {
      await service.updateSpentGraph(
        buildExistingSpent(),
        { supplierId: 'supplier-1', name: 'Sin estado' } as Spent,
        [
          buildSpentConcept({
            id: 'concept-1',
            serials: [{ serialNumber: 'SN-OWNED' } as SpentConceptSerial],
          }),
        ],
        enterpriseId,
      );

      expect(entityManager.save).toHaveBeenCalledWith(
        Spent,
        expect.objectContaining({ status: SpentStatus.PAID, name: 'Sin estado' }),
      );
    });

    it('trata itemId ausente como nulo al comparar el artículo', async () => {
      spentConceptRepository.findBySpentId.mockResolvedValue([
        buildExistingLine({ itemId: undefined, serials: undefined }),
      ]);

      await service.updateSpentGraph(
        buildExistingSpent(),
        buildSpentHeader(),
        [
          buildSpentConcept({
            id: 'concept-1',
            serials: [{ serialNumber: 'SN-NEW' } as SpentConceptSerial],
          }),
        ],
        enterpriseId,
      );

      expect(entityManager.save).toHaveBeenCalledWith(
        ItemSerial,
        expect.objectContaining({ serialNumber: 'SN-NEW' }),
      );
    });

    it('difunde series cuando la línea persistida no trae la relación cargada', async () => {
      spentConceptRepository.findBySpentId.mockResolvedValue([
        buildExistingLine({
          serials: undefined,
        }),
      ]);

      await service.updateSpentGraph(
        buildExistingSpent(),
        buildSpentHeader(),
        [
          buildSpentConcept({
            id: 'concept-1',
            serials: [{ serialNumber: 'SN-NEW' } as SpentConceptSerial],
          }),
        ],
        enterpriseId,
      );

      expect(entityManager.save).toHaveBeenCalledWith(
        ItemSerial,
        expect.objectContaining({ serialNumber: 'SN-NEW' }),
      );
    });

    it('impide asignar un artículo a una serie reservada sin línea de catálogo previa', async () => {
      spentConceptRepository.findBySpentId.mockResolvedValue([
        buildExistingLine({
          itemId: null,
          serials: [
            {
              serialNumber: 'SN-RES',
              itemSerial: { status: ItemSerialStatus.RESERVED },
            } as SpentConceptSerial,
          ],
        }),
      ]);

      await expect(
        service.updateSpentGraph(
          buildExistingSpent(),
          buildSpentHeader(),
          [
            buildSpentConcept({
              id: 'concept-1',
              serials: [{ serialNumber: 'SN-RES' } as SpentConceptSerial],
            }),
          ],
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        message: 'No se puede modificar un número de serie reservado o vendido',
      });
    });

    it('impide pasar a texto libre una serie reservada', async () => {
      spentConceptRepository.findBySpentId.mockResolvedValue([
        buildExistingLine({
          serials: [
            {
              serialNumber: 'SN-RES',
              itemSerial: { status: ItemSerialStatus.RESERVED },
            } as SpentConceptSerial,
          ],
        }),
      ]);

      await expect(
        service.updateSpentGraph(
          buildExistingSpent(),
          buildSpentHeader(),
          [
            buildSpentConcept({
              id: 'concept-1',
              itemId: null,
              serials: [],
            }),
          ],
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        message: 'No se puede modificar un número de serie reservado o vendido',
      });
    });

    it('recrea inventario de una línea libre sin artículo de origen', async () => {
      spentConceptRepository.findBySpentId.mockResolvedValue([
        buildExistingLine({ itemId: null, serials: [] }),
      ]);

      await service.updateSpentGraph(
        buildExistingSpent(),
        buildSpentHeader(),
        [
          buildSpentConcept({
            id: 'concept-1',
            itemId: null,
            serials: [],
          }),
        ],
        enterpriseId,
      );

      expect(entityManager.save).toHaveBeenCalledWith(
        SpentConcept,
        expect.objectContaining({ itemId: null, id: 'concept-1' }),
      );
    });

    it('impide cambiar el artículo de una serie reservada sin número capturado', async () => {
      spentConceptRepository.findBySpentId.mockResolvedValue([
        buildExistingLine({
          serials: [
            {
              serialNumber: undefined,
              itemSerial: { status: ItemSerialStatus.RESERVED },
            } as unknown as SpentConceptSerial,
          ],
        }),
      ]);

      await expect(
        service.updateSpentGraph(
          buildExistingSpent(),
          buildSpentHeader(),
          [
            buildSpentConcept({
              id: 'concept-1',
              itemId: quantityItem.id,
              serials: [],
            }),
          ],
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        message: 'No se puede modificar un número de serie reservado o vendido',
      });
    });

    it('permite reutilizar un número de serie ya propio del gasto', async () => {
      itemSerialRepository.findByItemIdAndSerialNumber.mockResolvedValue({
        id: 'is-1',
        serialNumber: 'SN-OWNED',
      });

      await service.updateSpentGraph(
        buildExistingSpent(),
        buildSpentHeader({ name: 'Actualizado' }),
        [
          buildSpentConcept({
            id: 'concept-1',
            serials: [{ serialNumber: 'SN-OWNED' } as SpentConceptSerial],
          }),
        ],
        enterpriseId,
      );

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(entityManager.save).toHaveBeenCalledWith(
        Spent,
        expect.objectContaining({ id: existingSpentId, name: 'Actualizado' }),
      );
    });

    it('borra las líneas quitadas y crea las nuevas', async () => {
      await service.updateSpentGraph(
        buildExistingSpent(),
        buildSpentHeader(),
        [
          buildSpentConcept({
            id: undefined,
            name: 'iPhone',
            serials: [{ serialNumber: 'SN-NEW' } as SpentConceptSerial],
          }),
        ],
        enterpriseId,
      );

      expect(entityManager.delete).toHaveBeenCalledWith(StockMovement, {
        spentConceptId: 'concept-1',
      });
      expect(entityManager.delete).toHaveBeenCalledWith(SpentConcept, { id: 'concept-1' });
      expect(entityManager.save).toHaveBeenCalledWith(
        SpentConcept,
        expect.objectContaining({ name: 'iPhone' }),
      );
    });

    it('añade y quita solo las series que cambian', async () => {
      spentConceptRepository.findBySpentId.mockResolvedValue([
        buildExistingLine({
          quantity: 1,
          serials: [
            {
              id: 'scs-old',
              itemSerialId: 'is-old',
              serialNumber: 'SN-OLD',
              itemSerial: { status: ItemSerialStatus.IN_STOCK },
            } as SpentConceptSerial,
          ],
        }),
      ]);

      await service.updateSpentGraph(
        buildExistingSpent(),
        buildSpentHeader(),
        [
          buildSpentConcept({
            id: 'concept-1',
            serials: [{ serialNumber: 'SN-NEW' } as SpentConceptSerial],
          }),
        ],
        enterpriseId,
      );

      expect(entityManager.delete).toHaveBeenCalledWith(StockMovement, { itemSerialId: 'is-old' });
      expect(entityManager.delete).toHaveBeenCalledWith(SpentConceptSerial, { id: 'scs-old' });
      expect(entityManager.delete).toHaveBeenCalledWith(ItemSerial, { id: 'is-old' });
      expect(entityManager.save).toHaveBeenCalledWith(
        ItemSerial,
        expect.objectContaining({ serialNumber: 'SN-NEW' }),
      );
    });

    it('borra una serie sin identidad canónica', async () => {
      spentConceptRepository.findBySpentId.mockResolvedValue([
        buildExistingLine({
          serials: [
            {
              id: 'scs-orphan',
              itemSerialId: null,
              serialNumber: 'SN-ORPHAN',
              itemSerial: { status: ItemSerialStatus.IN_STOCK },
            } as unknown as SpentConceptSerial,
          ],
        }),
      ]);

      await service.updateSpentGraph(
        buildExistingSpent(),
        buildSpentHeader(),
        [
          buildSpentConcept({
            id: 'concept-1',
            serials: [{ serialNumber: 'SN-NEW' } as SpentConceptSerial],
          }),
        ],
        enterpriseId,
      );

      expect(entityManager.delete).toHaveBeenCalledWith(SpentConceptSerial, { id: 'scs-orphan' });
      expect(entityManager.delete).not.toHaveBeenCalledWith(ItemSerial, { id: null });
    });

    it('recrea el inventario si cambia el artículo', async () => {
      await service.updateSpentGraph(
        buildExistingSpent(),
        buildSpentHeader(),
        [
          buildSpentConcept({
            id: 'concept-1',
            itemId: quantityItem.id,
            serials: [],
          }),
        ],
        enterpriseId,
      );

      expect(entityManager.delete).toHaveBeenCalledWith(StockMovement, {
        spentConceptId: 'concept-1',
      });
      expect(entityManager.save).toHaveBeenCalledWith(
        StockMovement,
        expect.objectContaining({ itemId: quantityItem.id }),
      );
    });

    it('no toca el inventario al actualizar un gasto cancelado', async () => {
      await service.updateSpentGraph(
        buildExistingSpent(),
        buildSpentHeader({ status: SpentStatus.CANCELLED }),
        [
          buildSpentConcept({
            id: 'concept-1',
            name: 'Renombrado',
            serials: [{ serialNumber: 'SN-OWNED' } as SpentConceptSerial],
          }),
        ],
        enterpriseId,
      );

      expect(entityManager.save).not.toHaveBeenCalledWith(ItemSerial, expect.anything());
      expect(entityManager.delete).not.toHaveBeenCalledWith(
        StockMovement,
        expect.objectContaining({ itemSerialId: 'is-1' }),
      );
    });

    it('impide quitar una serie reservada', async () => {
      spentConceptRepository.findBySpentId.mockResolvedValue([
        buildExistingLine({
          serials: [
            {
              serialNumber: 'SN-RES',
              itemSerial: { status: ItemSerialStatus.RESERVED },
            } as SpentConceptSerial,
          ],
        }),
      ]);

      await expect(
        service.updateSpentGraph(
          buildExistingSpent(),
          buildSpentHeader(),
          [
            buildSpentConcept({
              id: 'concept-1',
              serials: [{ serialNumber: 'SN-OTRO' } as SpentConceptSerial],
            }),
          ],
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        message: 'No se puede modificar un número de serie reservado o vendido',
      });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('impide borrar una línea con serie vendida', async () => {
      spentConceptRepository.findBySpentId.mockResolvedValue([
        buildExistingLine({
          serials: [
            {
              serialNumber: 'SN-SOLD',
              itemSerial: { status: ItemSerialStatus.SOLD },
            } as SpentConceptSerial,
          ],
        }),
      ]);

      await expect(
        service.updateSpentGraph(buildExistingSpent(), buildSpentHeader(), [], enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        message: 'No se puede modificar un número de serie reservado o vendido',
      });
    });

    it('permite conservar una serie reservada sin cambiarla', async () => {
      spentConceptRepository.findBySpentId.mockResolvedValue([
        buildExistingLine({
          serials: [
            {
              id: 'scs-res',
              itemSerialId: 'is-res',
              serialNumber: 'SN-RES',
              itemSerial: { status: ItemSerialStatus.RESERVED },
            } as SpentConceptSerial,
          ],
        }),
      ]);

      await service.updateSpentGraph(
        buildExistingSpent(),
        buildSpentHeader(),
        [
          buildSpentConcept({
            id: 'concept-1',
            serials: [{ serialNumber: 'SN-RES' } as SpentConceptSerial],
          }),
        ],
        enterpriseId,
      );

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(entityManager.delete).not.toHaveBeenCalledWith(ItemSerial, { id: 'is-res' });
    });

    it('borra una línea de texto libre sin series', async () => {
      spentConceptRepository.findBySpentId.mockResolvedValue([
        buildExistingLine({
          id: 'concept-free',
          itemId: null,
          serials: undefined,
        }),
      ]);

      await service.updateSpentGraph(
        buildExistingSpent(),
        buildSpentHeader(),
        [],
        enterpriseId,
      );

      expect(entityManager.delete).toHaveBeenCalledWith(SpentConcept, { id: 'concept-free' });
      expect(entityManager.delete).not.toHaveBeenCalledWith(ItemSerial, expect.objectContaining({ id: expect.anything() }));
    });

    it('lanza 404 si la línea no pertenece al gasto', async () => {
      spentConceptRepository.findBySpentId.mockResolvedValue([
        buildExistingLine({ spentId: 'otro-gasto' }),
      ]);

      await expect(
        service.updateSpentGraph(
          buildExistingSpent(),
          buildSpentHeader(),
          [buildSpentConcept({ id: 'concept-1' })],
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de gasto no encontrado',
      });
    });

    it('lanza 404 si el id de línea no existe', async () => {
      await expect(
        service.updateSpentGraph(
          buildExistingSpent(),
          buildSpentHeader(),
          [buildSpentConcept({ id: 'concept-missing' })],
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de gasto no encontrado',
      });
    });

    it('no añade series nuevas si el gasto actualizado queda cancelado', async () => {
      spentConceptRepository.findBySpentId.mockResolvedValue([
        buildExistingLine({
          serials: [
            {
              id: 'scs-keep',
              itemSerialId: 'is-keep',
              serialNumber: 'SN-KEEP',
              itemSerial: { status: ItemSerialStatus.IN_STOCK },
            } as SpentConceptSerial,
          ],
        }),
      ]);

      await service.updateSpentGraph(
        buildExistingSpent(),
        buildSpentHeader({ status: SpentStatus.CANCELLED }),
        [
          buildSpentConcept({
            id: 'concept-1',
            quantity: 2,
            serials: [
              { serialNumber: 'SN-KEEP' } as SpentConceptSerial,
              { serialNumber: 'SN-NEW' } as SpentConceptSerial,
            ],
          }),
        ],
        enterpriseId,
      );

      expect(entityManager.save).not.toHaveBeenCalledWith(
        ItemSerial,
        expect.objectContaining({ serialNumber: 'SN-NEW' }),
      );
    });

    it('omite líneas propias sin artículo al indexar series ya persistidas', async () => {
      spentConceptRepository.findBySpentId.mockResolvedValue([
        buildExistingLine({ itemId: '  ', serials: [{ serialNumber: '  ' } as SpentConceptSerial] }),
        buildExistingLine({
          id: 'concept-2',
          itemId: serialItem.id,
          serials: [
            { serialNumber: '  ' } as SpentConceptSerial,
            { serialNumber: undefined } as unknown as SpentConceptSerial,
          ],
        }),
      ]);

      await service.updateSpentGraph(
        buildExistingSpent(),
        buildSpentHeader(),
        [
          buildSpentConcept({
            id: 'concept-2',
            serials: [{ serialNumber: 'SN-OWNED' } as SpentConceptSerial],
          }),
        ],
        enterpriseId,
      );

      expect(dataSource.transaction).toHaveBeenCalled();
    });
  });
});
