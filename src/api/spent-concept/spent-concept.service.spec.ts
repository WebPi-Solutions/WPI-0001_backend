import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SpentConceptRepository } from 'src/entities/spent-concept/spent-concept-repository.service';
import { SpentConcept } from 'src/entities/spent-concept/spent-concept.entity';
import { SpentRepository } from 'src/entities/spent/spent-repository.service';
import { Spent } from 'src/entities/spent/spent.entity';
import { ItemRepository } from 'src/entities/item/item-repository.service';
import { Item } from 'src/entities/item/item.entity';
import { ItemCategory } from 'src/entities/item-category/item-category.entity';
import { SpentConceptSerialRepository } from 'src/entities/spent-concept-serial/spent-concept-serial-repository.service';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { SpentConceptService } from './spent-concept.service';
import { InventoryLedgerService } from 'src/common/helpers/inventory/inventory-ledger.service';

describe('SpentConceptService', () => {
  let service: SpentConceptService;
  let spentConceptRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    findMaxPositionBySpentId: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };
  let spentRepository: { findById: jest.Mock };
  let itemRepository: { findById: jest.Mock };
  let spentConceptSerialRepository: { countBySpentConceptId: jest.Mock };
  let enterpriseAccessService: {
    assertCurrentEntityAccessible: jest.Mock;
    mergeRelationNames: (relations: string[] | undefined, required: string[]) => string[];
  };
  let inventoryLedgerService: {
    syncPurchaseQuantityMovement: jest.Mock;
    purgeSpentConceptInventory: jest.Mock;
  };

  const spentConceptId = 'sc-uuid';
  const spentId = 'spent-uuid';
  const itemId = 'item-uuid';
  const enterpriseId = 'enterprise-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  const buildSpent = (overrides: Partial<Spent> = {}): Spent =>
    ({
      id: spentId,
      supplier: { enterpriseId },
      ...overrides,
    }) as Spent;

  const buildItem = (overrides: Partial<Item> = {}): Item =>
    ({
      id: itemId,
      name: 'Tornillo',
      pricePvp: 1.5,
      ean: '8412345678901',
      itemCategory: { enterpriseId } as ItemCategory,
      ...overrides,
    }) as Item;

  const buildSpentConcept = (overrides: Partial<SpentConcept> = {}): SpentConcept =>
    ({
      id: spentConceptId,
      spentId,
      itemId,
      name: 'Tornillo',
      spent: buildSpent(),
      ...overrides,
    }) as SpentConcept;

  beforeEach(async () => {
    spentConceptRepository = {
      create: jest.fn(),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
      findMaxPositionBySpentId: jest.fn().mockResolvedValue(null),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };
    spentRepository = { findById: jest.fn().mockResolvedValue(buildSpent()) };
    itemRepository = { findById: jest.fn() };
    spentConceptSerialRepository = {
      countBySpentConceptId: jest.fn().mockResolvedValue(0),
    };
    enterpriseAccessService = {
      assertCurrentEntityAccessible: jest.fn(),
      mergeRelationNames: (relations?: string[], required: string[] = []) =>
        [...new Set([...(relations ?? []), ...required])],
    };
    inventoryLedgerService = {
      syncPurchaseQuantityMovement: jest.fn().mockResolvedValue(undefined),
      purgeSpentConceptInventory: jest.fn().mockResolvedValue(undefined),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        SpentConceptService,
        { provide: SpentConceptRepository, useValue: spentConceptRepository },
        { provide: SpentRepository, useValue: spentRepository },
        { provide: ItemRepository, useValue: itemRepository },
        {
          provide: SpentConceptSerialRepository,
          useValue: spentConceptSerialRepository,
        },
        { provide: EnterpriseAccessService, useValue: enterpriseAccessService },
        { provide: InventoryLedgerService, useValue: inventoryLedgerService },
      ],
    }).compile();

    service = testingModule.get(SpentConceptService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('exige un gasto', async () => {
      await expect(
        service.create({ name: 'Hora', itemId } as SpentConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El concepto debe pertenecer a un gasto',
      });
    });

    it('lanza 404 si spentId y spent.id no coinciden', async () => {
      await expect(
        service.create(
          { spentId, spent: { id: 'otra' }, itemId } as SpentConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de gasto no encontrado',
      });
    });

    it('lanza 404 si el gasto no existe', async () => {
      spentRepository.findById.mockResolvedValue(null);

      await expect(
        service.create({ spentId, name: 'Hora' } as SpentConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de gasto no encontrado',
      });
    });

    it('lanza 404 si el gasto es de otra empresa', async () => {
      spentRepository.findById.mockResolvedValue(
        buildSpent({ supplier: { enterpriseId: 'otra' } as Spent['supplier'] }),
      );

      await expect(
        service.create({ spentId, name: 'Hora' } as SpentConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de gasto no encontrado',
      });
    });

    it('propaga 403 si el caller no tiene spents.write', async () => {
      enterpriseAccessService.assertCurrentEntityAccessible.mockImplementation(() => {
        throw new HttpException(
          'No tiene permiso para realizar la acción spents.write',
          HttpStatus.FORBIDDEN,
        );
      });

      await expect(
        service.create({ spentId, name: 'Hora' } as SpentConcept, enterpriseId),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    });

    it('exige nombre en una línea manual', async () => {
      await expect(
        service.create({ spentId } as SpentConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El concepto debe tener un nombre',
      });
    });

    it('persiste una línea manual con defaults y posición 0', async () => {
      const created = buildSpentConcept();
      spentConceptRepository.create.mockResolvedValue(created);

      await expect(
        service.create({ spentId, name: '  Hora  ' } as SpentConcept, enterpriseId),
      ).resolves.toEqual(created);
      expect(spentConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          spentId,
          itemId: null,
          position: 0,
          name: 'Hora',
          basePrice: 0,
          vat: 21,
          irpf: 0,
          quantity: 1,
          ean: null,
        }),
      );
    });

    it('usa la fecha de emisión del gasto en el kardex', async () => {
      spentRepository.findById.mockResolvedValue(
        buildSpent({ issuedDate: new Date('2026-06-01') }),
      );
      spentConceptRepository.create.mockResolvedValue(buildSpentConcept());

      await service.create({ spentId, name: 'Hora' } as SpentConcept, enterpriseId);

      expect(inventoryLedgerService.syncPurchaseQuantityMovement).toHaveBeenCalledWith(
        expect.anything(),
        null,
        undefined,
        new Date('2026-06-01'),
      );
    });

    it('rechaza un nombre que no es texto', async () => {
      await expect(
        service.create(
          { spentId, name: 12 as unknown as string } as SpentConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El nombre del concepto debe ser una cadena de texto',
      });
    });

    it('rechaza un nombre vacío', async () => {
      await expect(
        service.create({ spentId, name: '   ' } as SpentConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El nombre del concepto no puede estar vacío',
      });
    });

    it('acepta el gasto anidado sin spentId escalar', async () => {
      spentConceptRepository.create.mockResolvedValue(buildSpentConcept());

      await service.create(
        { spent: { id: spentId } as Spent, name: 'Hora' } as SpentConcept,
        enterpriseId,
      );

      expect(spentRepository.findById).toHaveBeenCalledWith(spentId, ['supplier']);
    });

    it('usa MAX(position)+1 cuando hay líneas previas', async () => {
      spentConceptRepository.findMaxPositionBySpentId.mockResolvedValue(4);
      spentConceptRepository.create.mockResolvedValue(buildSpentConcept());

      await service.create({ spentId, name: 'Hora' } as SpentConcept, enterpriseId);

      expect(spentConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ position: 5 }),
      );
    });

    it('respeta la posición informada y recorta el EAN', async () => {
      spentConceptRepository.create.mockResolvedValue(buildSpentConcept());

      await service.create(
        {
          spentId,
          name: 'Hora',
          position: '2' as unknown as number,
          ean: '  123  ',
          basePrice: null as unknown as number,
          vat: null as unknown as number,
          irpf: null as unknown as number,
          quantity: null as unknown as number,
        } as SpentConcept,
        enterpriseId,
      );

      expect(spentConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          position: 2,
          ean: '123',
          basePrice: 0,
          vat: 21,
          irpf: 0,
          quantity: 1,
        }),
      );
    });

    it('instantánea el artículo cuando solo llega item.id y el EAN del catálogo es nulo', async () => {
      itemRepository.findById.mockResolvedValue(buildItem({ ean: null }));
      spentConceptRepository.create.mockResolvedValue(buildSpentConcept());

      await service.create(
        { spentId, item: { id: itemId } as Item } as SpentConcept,
        enterpriseId,
      );

      expect(itemRepository.findById).toHaveBeenCalledWith(itemId, ['itemCategory']);
      expect(spentConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId,
          name: 'Tornillo',
          ean: null,
        }),
      );
    });

    it('persiste ean nulo cuando el cuerpo lo informa explícitamente', async () => {
      spentConceptRepository.create.mockResolvedValue(buildSpentConcept());

      await service.create(
        { spentId, name: 'Hora', ean: null } as SpentConcept,
        enterpriseId,
      );

      expect(spentConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ ean: null }),
      );
    });

    it('instantánea el artículo cuando hay itemId', async () => {
      itemRepository.findById.mockResolvedValue(buildItem());
      spentConceptRepository.create.mockResolvedValue(buildSpentConcept());

      await service.create({ spentId, itemId } as SpentConcept, enterpriseId);

      expect(spentConceptRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId,
          name: 'Tornillo',
          basePrice: 1.5,
          ean: '8412345678901',
        }),
      );
    });

    it('propaga 403 si el caller no puede escribir el artículo vinculado', async () => {
      itemRepository.findById.mockResolvedValue(buildItem());
      enterpriseAccessService.assertCurrentEntityAccessible
        .mockImplementationOnce(() => undefined)
        .mockImplementationOnce(() => {
          throw new HttpException(
            'No tiene permiso para realizar la acción spents.write',
            HttpStatus.FORBIDDEN,
          );
        });

      await expect(
        service.create({ spentId, itemId, name: 'X' } as SpentConcept, enterpriseId),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    });

    it('lanza 404 si el artículo no existe', async () => {
      itemRepository.findById.mockResolvedValue(null);

      await expect(
        service.create({ spentId, itemId, name: 'X' } as SpentConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de gasto no encontrado',
      });
    });

    it('lanza 404 si itemId e item.id no coinciden', async () => {
      await expect(
        service.create(
          { spentId, itemId, item: { id: 'otro' } as Item, name: 'X' } as SpentConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de gasto no encontrado',
      });
    });

    it('lanza 404 si el artículo es de otra empresa', async () => {
      itemRepository.findById.mockResolvedValue(
        buildItem({ itemCategory: { enterpriseId: 'otra' } as ItemCategory }),
      );

      await expect(
        service.create({ spentId, itemId, name: 'X' } as SpentConcept, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de gasto no encontrado',
      });
    });

    it('rechaza un precio que no es convertible a número', async () => {
      await expect(
        service.create(
          { spentId, name: 'Hora', basePrice: '  ' as unknown as number } as SpentConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'El precio base debe ser un número mayor o igual que 0',
      });
    });

    it('rechaza precio, enteros y EAN inválidos', async () => {
      await expect(
        service.create(
          { spentId, name: 'Hora', basePrice: -1 } as SpentConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'El precio base debe ser un número mayor o igual que 0',
      });
      await expect(
        service.create(
          { spentId, name: 'Hora', vat: 'x' as unknown as number } as SpentConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'El IVA debe ser un número entero mayor o igual que 0',
      });
      await expect(
        service.create(
          { spentId, name: 'Hora', quantity: Number.POSITIVE_INFINITY } as SpentConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'La cantidad debe ser un número entero mayor o igual que 0',
      });
      await expect(
        service.create(
          { spentId, name: 'Hora', irpf: true as unknown as number } as SpentConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'El IRPF debe ser un número entero mayor o igual que 0',
      });
      await expect(
        service.create(
          { spentId, name: 'Hora', ean: 1 as unknown as string } as SpentConcept,
          enterpriseId,
        ),
      ).rejects.toMatchObject({
        message: 'El código EAN debe ser una cadena de texto',
      });
    });

    it('propaga el error del repositorio', async () => {
      const unexpectedError = new Error('db');
      spentConceptRepository.create.mockRejectedValue(unexpectedError);

      await expect(
        service.create({ spentId, name: 'Hora' } as SpentConcept, enterpriseId),
      ).rejects.toBe(unexpectedError);
    });
  });

  describe('findAll', () => {
    it('delega al repositorio', async () => {
      await expect(
        service.findAll(1, 10, 'position', 'ASC', { 'supplier.enterpriseId': enterpriseId }, [
          'spent',
        ]),
      ).resolves.toEqual(emptyPaginatedResponse);
    });
  });

  describe('findById', () => {
    it('devuelve la línea', async () => {
      const existing = buildSpentConcept();
      spentConceptRepository.findById.mockResolvedValue(existing);

      await expect(service.findById(spentConceptId, ['item'])).resolves.toEqual(existing);
      expect(spentConceptRepository.findById).toHaveBeenCalledWith(spentConceptId, [
        'item',
        'spent',
        'spent.supplier',
      ]);
    });

    it('lanza 404 si no existe', async () => {
      spentConceptRepository.findById.mockResolvedValue(null);

      await expect(service.findById(spentConceptId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de gasto no encontrado',
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si no existe', async () => {
      spentConceptRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateById(spentConceptId, { name: 'X' } as SpentConcept),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Concepto de gasto no encontrado',
      });
    });

    it('congela spentId y actualiza campos', async () => {
      spentConceptRepository.findById.mockResolvedValue(buildSpentConcept({ itemId }));
      spentConceptRepository.updateById.mockResolvedValue(buildSpentConcept());

      await service.updateById(spentConceptId, {
        spentId: 'hackeada',
        name: 'Nuevo',
        position: 3,
        basePrice: '8.5' as unknown as number,
        ean: '   ',
      } as SpentConcept);

      expect(spentConceptRepository.updateById).toHaveBeenCalledWith(
        spentConceptId,
        expect.objectContaining({
          name: 'Nuevo',
          position: 3,
          basePrice: 8.5,
          ean: null,
        }),
      );
      expect(spentConceptRepository.updateById.mock.calls[0][1].spentId).toBeUndefined();
    });

    it('desvincula el artículo cuando itemId llega a null', async () => {
      spentConceptRepository.findById.mockResolvedValue(buildSpentConcept({ itemId }));
      spentConceptRepository.updateById.mockResolvedValue(buildSpentConcept());

      await service.updateById(spentConceptId, { itemId: null } as unknown as SpentConcept);

      expect(spentConceptRepository.updateById).toHaveBeenCalledWith(
        spentConceptId,
        expect.objectContaining({ itemId: null }),
      );
    });

    it('rechaza desvincular el artículo si hay series asignadas', async () => {
      spentConceptRepository.findById.mockResolvedValue(buildSpentConcept({ itemId }));
      spentConceptSerialRepository.countBySpentConceptId.mockResolvedValue(1);

      await expect(
        service.updateById(spentConceptId, { itemId: null } as unknown as SpentConcept),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message:
          'No se puede quitar el artículo con número de serie mientras el concepto tenga series asignadas',
      });
    });

    it('vincula un artículo en la actualización sin tocar campos omitidos', async () => {
      itemRepository.findById.mockResolvedValue(buildItem());
      spentConceptRepository.findById.mockResolvedValue(buildSpentConcept());
      spentConceptRepository.updateById.mockResolvedValue(buildSpentConcept());

      await service.updateById(spentConceptId, {
        itemId,
      } as SpentConcept);

      expect(spentConceptRepository.updateById).toHaveBeenCalledWith(
        spentConceptId,
        expect.objectContaining({ itemId }),
      );
      expect(spentConceptRepository.updateById.mock.calls[0][1].name).toBeUndefined();
    });

    it('conserva el itemId existente cuando el cuerpo no lo toca', async () => {
      spentConceptRepository.findById.mockResolvedValue(buildSpentConcept({ itemId }));
      spentConceptRepository.updateById.mockResolvedValue(buildSpentConcept());

      await service.updateById(spentConceptId, { name: 'Solo nombre' } as SpentConcept);

      expect(itemRepository.findById).not.toHaveBeenCalled();
      expect(spentConceptRepository.updateById.mock.calls[0][1].itemId).toBeUndefined();
    });

    it('conserva el itemId si el cuerpo trae un item vacío', async () => {
      spentConceptRepository.findById.mockResolvedValue(buildSpentConcept({ itemId }));
      spentConceptRepository.updateById.mockResolvedValue(buildSpentConcept());

      await service.updateById(spentConceptId, {
        item: {} as Item,
        vat: 10,
        irpf: 5,
        quantity: 2,
      } as SpentConcept);

      expect(spentConceptRepository.updateById).toHaveBeenCalledWith(
        spentConceptId,
        expect.objectContaining({
          itemId,
          vat: 10,
          irpf: 5,
          quantity: 2,
        }),
      );
    });

    it('propaga el error del repositorio', async () => {
      const unexpectedError = new Error('db');
      spentConceptRepository.findById.mockResolvedValue(buildSpentConcept());
      spentConceptRepository.updateById.mockRejectedValue(unexpectedError);

      await expect(
        service.updateById(spentConceptId, { name: 'X' } as SpentConcept),
      ).rejects.toBe(unexpectedError);
    });

    it('rechaza bajar la cantidad por debajo de las series asignadas', async () => {
      spentConceptRepository.findById.mockResolvedValue(
        buildSpentConcept({ itemId, quantity: 2 }),
      );
      spentConceptSerialRepository.countBySpentConceptId.mockResolvedValue(2);

      await expect(
        service.updateById(spentConceptId, { quantity: 1 } as SpentConcept),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'La cantidad no puede ser menor que el número de series asignadas',
      });
      expect(spentConceptRepository.updateById).not.toHaveBeenCalled();
    });

    it('usa cantidad 1 al validar series si la línea no tiene cantidad', async () => {
      spentConceptRepository.findById.mockResolvedValue(
        buildSpentConcept({ itemId, quantity: undefined }),
      );
      spentConceptSerialRepository.countBySpentConceptId.mockResolvedValue(2);

      await expect(
        service.updateById(spentConceptId, { name: 'Sin toque de cantidad' } as SpentConcept),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'La cantidad no puede ser menor que el número de series asignadas',
      });
    });

    it('permite dejar la cantidad igual al número de series', async () => {
      spentConceptRepository.findById.mockResolvedValue(
        buildSpentConcept({ itemId, quantity: 3 }),
      );
      spentConceptSerialRepository.countBySpentConceptId.mockResolvedValue(2);
      spentConceptRepository.updateById.mockResolvedValue(buildSpentConcept());

      await service.updateById(spentConceptId, { quantity: 2 } as SpentConcept);

      expect(spentConceptRepository.updateById).toHaveBeenCalledWith(
        spentConceptId,
        expect.objectContaining({ quantity: 2 }),
      );
    });

    it('rechaza cambiar a un artículo sin número de serie si hay series asignadas', async () => {
      const itemWithoutSerialId = 'item-sin-serie';
      itemRepository.findById.mockResolvedValue(
        buildItem({ id: itemWithoutSerialId, serialNumber: false }),
      );
      spentConceptRepository.findById.mockResolvedValue(buildSpentConcept({ itemId }));
      spentConceptSerialRepository.countBySpentConceptId.mockResolvedValue(1);

      await expect(
        service.updateById(spentConceptId, {
          itemId: itemWithoutSerialId,
        } as SpentConcept),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message:
          'No se puede quitar el artículo con número de serie mientras el concepto tenga series asignadas',
      });
    });

    it('permite cambiar a otro artículo con número de serie aunque haya series', async () => {
      const serialTrackedItemId = 'item-con-serie';
      itemRepository.findById.mockResolvedValue(
        buildItem({ id: serialTrackedItemId, serialNumber: true }),
      );
      spentConceptRepository.findById.mockResolvedValue(buildSpentConcept({ itemId }));
      spentConceptSerialRepository.countBySpentConceptId.mockResolvedValue(1);
      spentConceptRepository.updateById.mockResolvedValue(buildSpentConcept());

      await service.updateById(spentConceptId, {
        itemId: serialTrackedItemId,
      } as SpentConcept);

      expect(spentConceptRepository.updateById).toHaveBeenCalledWith(
        spentConceptId,
        expect.objectContaining({ itemId: serialTrackedItemId }),
      );
    });
  });

  describe('deleteById', () => {
    it('lanza 404 si no existe', async () => {
      spentConceptRepository.findById.mockResolvedValue(null);

      await expect(service.deleteById(spentConceptId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });

    it('elimina la línea', async () => {
      spentConceptRepository.findById.mockResolvedValue(buildSpentConcept());
      spentConceptRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.deleteById(spentConceptId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
    });

    it('propaga el error del repositorio', async () => {
      const unexpectedError = new Error('db');
      spentConceptRepository.findById.mockResolvedValue(buildSpentConcept());
      spentConceptRepository.deleteById.mockRejectedValue(unexpectedError);

      await expect(service.deleteById(spentConceptId)).rejects.toBe(unexpectedError);
    });
  });
});
