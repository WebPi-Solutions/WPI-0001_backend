import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ItemRepository } from 'src/entities/item/item-repository.service';
import { Item } from 'src/entities/item/item.entity';
import { ItemCategoryRepository } from 'src/entities/item-category/item-category-repository.service';
import { ItemCategory } from 'src/entities/item-category/item-category.entity';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { InventoryLedgerService } from 'src/common/helpers/inventory/inventory-ledger.service';
import { ITEM_SERIAL_NUMBER_REQUIRES_STOCK_MESSAGE, ItemService } from './item.service';

describe('ItemService', () => {
  let service: ItemService;
  let itemRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };
  let itemCategoryRepository: {
    findById: jest.Mock;
  };
  let enterpriseAccessService: {
    assertCurrentEntityAccessible: jest.Mock;
    mergeRelationNames: (relations: string[] | undefined, required: string[]) => string[];
  };
  let inventoryLedgerService: { attachStockBalances: jest.Mock };

  const itemId = 'item-uuid';
  const itemCategoryId = 'item-category-uuid';
  const enterpriseId = 'enterprise-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  /**
   * Construye una categoría de prueba.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad ItemCategory simulada
   */
  const buildItemCategory = (overrides: Partial<ItemCategory> = {}): ItemCategory =>
    ({
      id: itemCategoryId,
      name: 'Servicios',
      enterpriseId,
      ...overrides,
    }) as ItemCategory;

  /**
   * Construye un artículo de prueba con su categoría.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad Item simulada
   */
  const buildItem = (overrides: Partial<Item> = {}): Item =>
    ({
      id: itemId,
      name: 'Hora de consultoría',
      description: 'Artículo demo',
      itemCategoryId,
      itemCategory: buildItemCategory(),
      ...overrides,
    }) as Item;

  beforeEach(async () => {
    itemRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };
    itemCategoryRepository = {
      findById: jest.fn(),
    };
    enterpriseAccessService = {
      assertCurrentEntityAccessible: jest.fn(),
      mergeRelationNames: (relations?: string[], required: string[] = []) =>
        [...new Set([...(relations ?? []), ...required])],
    };
    inventoryLedgerService = {
      attachStockBalances: jest.fn().mockResolvedValue(undefined),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        ItemService,
        { provide: ItemRepository, useValue: itemRepository },
        { provide: ItemCategoryRepository, useValue: itemCategoryRepository },
        { provide: EnterpriseAccessService, useValue: enterpriseAccessService },
        { provide: InventoryLedgerService, useValue: inventoryLedgerService },
      ],
    }).compile();

    service = testingModule.get(ItemService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('exige una categoría', async () => {
      await expect(
        service.create({ name: 'Sin categoría' } as Item, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El artículo debe tener una categoría',
      });
      expect(itemRepository.create).not.toHaveBeenCalled();
    });

    it('lanza 404 si la categoría no existe', async () => {
      itemCategoryRepository.findById.mockResolvedValue(null);

      await expect(service.create(buildItem(), enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Artículo no encontrado',
      });
    });

    it('propaga 403 si el caller no tiene permiso items.write', async () => {
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());
      enterpriseAccessService.assertCurrentEntityAccessible.mockImplementation(() => {
        throw new HttpException(
          'No tiene permiso para realizar la acción items.write',
          HttpStatus.FORBIDDEN,
        );
      });

      await expect(service.create(buildItem(), enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        message: 'No tiene permiso para realizar la acción items.write',
      });
      expect(itemRepository.create).not.toHaveBeenCalled();
    });

    it('lanza 404 si la categoría es de otra empresa', async () => {
      itemCategoryRepository.findById.mockResolvedValue(
        buildItemCategory({ enterpriseId: 'otra-empresa' }),
      );

      await expect(service.create(buildItem(), enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Artículo no encontrado',
      });
      expect(itemRepository.create).not.toHaveBeenCalled();
    });

    it('persiste el artículo con la FK canónica y sin la categoría anidada', async () => {
      const createdItem = buildItem();
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());
      itemRepository.create.mockResolvedValue(createdItem);

      await expect(
        service.create(
          buildItem({ itemCategory: { id: itemCategoryId } as ItemCategory }),
          enterpriseId,
        ),
      ).resolves.toEqual(createdItem);

      expect(enterpriseAccessService.assertCurrentEntityAccessible).toHaveBeenCalledWith(
        enterpriseId,
        'Artículo no encontrado',
        { resource: 'items', action: 'write' },
      );
      expect(itemRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          itemCategoryId,
          name: 'Hora de consultoría',
          pricePvp: 0,
          lastPurchasePrice: 0,
          serialNumber: false,
          stock: false,
        }),
      );
      expect(itemRepository.create.mock.calls[0][0]).not.toHaveProperty('itemCategory');
    });

    it('persiste los campos comerciales informados y recorta el EAN', async () => {
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());
      itemRepository.create.mockResolvedValue(buildItem());

      await service.create(
        buildItem({
          pricePvp: 12.5,
          lastPurchasePrice: '8.10' as unknown as number,
          serialNumber: true,
          stock: true,
          ean: '  8412345678901  ',
        }),
        enterpriseId,
      );

      expect(itemRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          pricePvp: 12.5,
          lastPurchasePrice: 8.1,
          serialNumber: true,
          stock: true,
          ean: '8412345678901',
        }),
      );
    });

    it('convierte precios nulos y EAN vacío a sus defaults de esquema', async () => {
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());
      itemRepository.create.mockResolvedValue(buildItem());

      await service.create(
        buildItem({
          pricePvp: null as unknown as number,
          lastPurchasePrice: null as unknown as number,
          serialNumber: null as unknown as boolean,
          stock: null as unknown as boolean,
          ean: '   ',
        }),
        enterpriseId,
      );

      expect(itemRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          pricePvp: 0,
          lastPurchasePrice: 0,
          serialNumber: false,
          stock: false,
          ean: null,
        }),
      );
    });

    it('rechaza un precio PVP negativo', async () => {
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());

      await expect(
        service.create(buildItem({ pricePvp: -1 }), enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El precio PVP debe ser un número mayor o igual que 0',
      });
      expect(itemRepository.create).not.toHaveBeenCalled();
    });

    it('rechaza un último precio de compra no numérico', async () => {
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());

      await expect(
        service.create(buildItem({ lastPurchasePrice: 'abc' as unknown as number }), enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El último precio de compra debe ser un número mayor o igual que 0',
      });
    });

    it('rechaza un precio PVP no finito', async () => {
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());

      await expect(
        service.create(buildItem({ pricePvp: Number.POSITIVE_INFINITY }), enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El precio PVP debe ser un número mayor o igual que 0',
      });
    });

    it('rechaza un precio PVP de tipo no numérico', async () => {
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());

      await expect(
        service.create(buildItem({ pricePvp: true as unknown as number }), enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El precio PVP debe ser un número mayor o igual que 0',
      });
    });

    it('rechaza un indicador de número de serie que no es booleano', async () => {
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());

      await expect(
        service.create(buildItem({ serialNumber: 'si' as unknown as boolean }), enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El indicador de número de serie debe ser un valor booleano',
      });
    });

    it('rechaza número de serie activo con el stock deshabilitado', async () => {
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());

      await expect(
        service.create(buildItem({ serialNumber: true, stock: false }), enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: ITEM_SERIAL_NUMBER_REQUIRES_STOCK_MESSAGE,
      });
      expect(itemRepository.create).not.toHaveBeenCalled();
    });

    it('rechaza número de serie activo cuando el stock se omite (default false)', async () => {
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());

      await expect(
        service.create(buildItem({ serialNumber: true }), enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: ITEM_SERIAL_NUMBER_REQUIRES_STOCK_MESSAGE,
      });
      expect(itemRepository.create).not.toHaveBeenCalled();
    });

    it('rechaza un indicador de stock que no es booleano', async () => {
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());

      await expect(
        service.create(buildItem({ stock: 'si' as unknown as boolean }), enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El indicador de stock debe ser un valor booleano',
      });
    });

    it('rechaza un EAN que no es texto', async () => {
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());

      await expect(
        service.create(buildItem({ ean: 123 as unknown as string }), enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El código EAN debe ser una cadena de texto',
      });
    });

    it('persiste un EAN nulo como null', async () => {
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());
      itemRepository.create.mockResolvedValue(buildItem());

      await service.create(buildItem({ ean: null }), enterpriseId);

      expect(itemRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ ean: null }),
      );
    });

    it('acepta un precio PVP igual a 0 y rechaza una cadena vacía', async () => {
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());
      itemRepository.create.mockResolvedValue(buildItem());

      await service.create(buildItem({ pricePvp: 0 }), enterpriseId);
      expect(itemRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ pricePvp: 0 }),
      );

      await expect(
        service.create(buildItem({ pricePvp: '  ' as unknown as number }), enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El precio PVP debe ser un número mayor o igual que 0',
      });
    });

    it('acepta la categoría anidada cuando no hay itemCategoryId escalar', async () => {
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());
      itemRepository.create.mockResolvedValue(buildItem());

      await expect(
        service.create(
          { name: 'Desde relación', itemCategory: { id: itemCategoryId } } as Item,
          enterpriseId,
        ),
      ).resolves.toEqual(buildItem());
      expect(itemCategoryRepository.findById).toHaveBeenCalledWith(itemCategoryId);
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al crear');
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());
      itemRepository.create.mockRejectedValue(repositoryError);

      await expect(service.create(buildItem(), enterpriseId)).rejects.toBe(repositoryError);
    });
  });

  describe('findAll', () => {
    it('delega la consulta paginada al repositorio', async () => {
      itemRepository.findAll.mockResolvedValue(emptyPaginatedResponse);
      const filter = { 'itemCategory.enterpriseId': enterpriseId };

      await expect(
        service.findAll(1, 10, 'name', 'ASC', filter, ['itemCategory']),
      ).resolves.toEqual(emptyPaginatedResponse);
      expect(itemRepository.findAll).toHaveBeenCalledWith(
        1,
        10,
        'name',
        'ASC',
        filter,
        ['itemCategory'],
      );
    });
  });

  describe('findById', () => {
    it('carga itemCategory y comprueba el tenant', async () => {
      const existingItem = buildItem();
      itemRepository.findById.mockResolvedValue(existingItem);

      await expect(service.findById(itemId, ['itemCategory'])).resolves.toEqual(existingItem);
      expect(itemRepository.findById).toHaveBeenCalledWith(itemId, ['itemCategory']);
      expect(enterpriseAccessService.assertCurrentEntityAccessible).toHaveBeenCalledWith(
        enterpriseId,
        'Artículo no encontrado',
        { resource: 'items', action: 'read' },
      );
    });

    it('fusiona la relación itemCategory aunque el caller no la pida', async () => {
      itemRepository.findById.mockResolvedValue(buildItem());

      await service.findById(itemId);

      expect(itemRepository.findById).toHaveBeenCalledWith(itemId, ['itemCategory']);
    });

    it('lanza 404 cuando el artículo no existe', async () => {
      itemRepository.findById.mockResolvedValue(null);

      await expect(service.findById(itemId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Artículo no encontrado',
      });
    });

    it('propaga 403 si el caller no tiene permiso items.read', async () => {
      itemRepository.findById.mockResolvedValue(buildItem());
      enterpriseAccessService.assertCurrentEntityAccessible.mockImplementation(() => {
        throw new HttpException(
          'No tiene permiso para realizar la acción items.read',
          HttpStatus.FORBIDDEN,
        );
      });

      await expect(service.findById(itemId)).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        message: 'No tiene permiso para realizar la acción items.read',
      });
    });

    it('propaga 404 si el caller no pertenece a la empresa del artículo', async () => {
      itemRepository.findById.mockResolvedValue(buildItem());
      enterpriseAccessService.assertCurrentEntityAccessible.mockImplementation(() => {
        throw new HttpException('Artículo no encontrado', HttpStatus.NOT_FOUND);
      });

      await expect(service.findById(itemId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Artículo no encontrado',
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si el artículo no existe', async () => {
      itemRepository.findById.mockResolvedValue(null);

      await expect(service.updateById(itemId, buildItem())).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Artículo no encontrado',
      });
    });

    it('no actualiza si el caller no tiene permiso items.write', async () => {
      itemRepository.findById.mockResolvedValue(buildItem());
      enterpriseAccessService.assertCurrentEntityAccessible.mockImplementation(() => {
        throw new HttpException(
          'No tiene permiso para realizar la acción items.write',
          HttpStatus.FORBIDDEN,
        );
      });

      await expect(
        service.updateById(itemId, { name: 'Hackeado' } as Item),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        message: 'No tiene permiso para realizar la acción items.write',
      });
      expect(itemRepository.updateById).not.toHaveBeenCalled();
    });

    it('actualiza sin cambiar de categoría', async () => {
      const updatedItem = buildItem({ name: 'Artículo actualizado' });
      itemRepository.findById.mockResolvedValue(buildItem());
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());
      itemRepository.updateById.mockResolvedValue(updatedItem);

      await expect(
        service.updateById(itemId, { name: 'Artículo actualizado' } as Item),
      ).resolves.toEqual(updatedItem);
      expect(itemRepository.updateById).toHaveBeenCalledWith(
        itemId,
        expect.objectContaining({ name: 'Artículo actualizado', itemCategoryId }),
      );
      expect(itemRepository.updateById.mock.calls[0][1]).not.toHaveProperty('itemCategory');
      expect(itemRepository.updateById.mock.calls[0][1]).not.toHaveProperty('pricePvp');
      expect(itemRepository.updateById.mock.calls[0][1]).not.toHaveProperty('lastPurchasePrice');
      expect(itemRepository.updateById.mock.calls[0][1]).not.toHaveProperty('serialNumber');
      expect(itemRepository.updateById.mock.calls[0][1]).not.toHaveProperty('stock');
    });

    it('actualiza campos comerciales sin resetear los omitidos', async () => {
      itemRepository.findById.mockResolvedValue(buildItem());
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());
      itemRepository.updateById.mockResolvedValue(buildItem());

      await service.updateById(itemId, {
        lastPurchasePrice: 4.2,
        ean: null,
      } as Item);

      expect(itemRepository.updateById).toHaveBeenCalledWith(
        itemId,
        expect.objectContaining({
          lastPurchasePrice: 4.2,
          ean: null,
          itemCategoryId,
        }),
      );
      expect(itemRepository.updateById.mock.calls[0][1]).not.toHaveProperty('pricePvp');
      expect(itemRepository.updateById.mock.calls[0][1]).not.toHaveProperty('serialNumber');
      expect(itemRepository.updateById.mock.calls[0][1]).not.toHaveProperty('stock');
    });

    it('convierte precios nulos del parche a 0', async () => {
      itemRepository.findById.mockResolvedValue(buildItem());
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());
      itemRepository.updateById.mockResolvedValue(buildItem());

      await service.updateById(itemId, {
        pricePvp: null,
        serialNumber: null,
        stock: null,
      } as unknown as Item);

      expect(itemRepository.updateById).toHaveBeenCalledWith(
        itemId,
        expect.objectContaining({
          pricePvp: 0,
          serialNumber: false,
          stock: false,
        }),
      );
    });

    it('rechaza activar el número de serie si el stock resultante queda deshabilitado', async () => {
      itemRepository.findById.mockResolvedValue(buildItem({ serialNumber: false, stock: false }));
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());

      await expect(
        service.updateById(itemId, { serialNumber: true } as Item),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: ITEM_SERIAL_NUMBER_REQUIRES_STOCK_MESSAGE,
      });
      expect(itemRepository.updateById).not.toHaveBeenCalled();
    });

    it('rechaza desactivar el stock si el número de serie sigue activo', async () => {
      itemRepository.findById.mockResolvedValue(buildItem({ serialNumber: true, stock: true }));
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());

      await expect(
        service.updateById(itemId, { stock: false } as Item),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: ITEM_SERIAL_NUMBER_REQUIRES_STOCK_MESSAGE,
      });
      expect(itemRepository.updateById).not.toHaveBeenCalled();
    });

    it('permite activar el número de serie junto con el stock', async () => {
      itemRepository.findById.mockResolvedValue(buildItem({ serialNumber: false, stock: false }));
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());
      itemRepository.updateById.mockResolvedValue(buildItem({ serialNumber: true, stock: true }));

      await service.updateById(itemId, { serialNumber: true, stock: true } as Item);

      expect(itemRepository.updateById).toHaveBeenCalledWith(
        itemId,
        expect.objectContaining({ serialNumber: true, stock: true }),
      );
    });

    it('rechaza un último precio de compra negativo en el parche', async () => {
      itemRepository.findById.mockResolvedValue(buildItem());
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());

      await expect(
        service.updateById(itemId, { lastPurchasePrice: -0.01 } as Item),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El último precio de compra debe ser un número mayor o igual que 0',
      });
      expect(itemRepository.updateById).not.toHaveBeenCalled();
    });

    it('persiste un EAN vacío del parche como null', async () => {
      itemRepository.findById.mockResolvedValue(buildItem());
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());
      itemRepository.updateById.mockResolvedValue(buildItem());

      await service.updateById(itemId, { ean: '  ' } as Item);

      expect(itemRepository.updateById).toHaveBeenCalledWith(
        itemId,
        expect.objectContaining({ ean: null }),
      );
    });

    it('rechaza mover el artículo a una categoría de otra empresa', async () => {
      itemRepository.findById.mockResolvedValue(buildItem());
      itemCategoryRepository.findById.mockResolvedValue(
        buildItemCategory({ id: 'categoria-ajena', enterpriseId: 'otra-empresa' }),
      );

      await expect(
        service.updateById(itemId, { itemCategoryId: 'categoria-ajena' } as Item),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Artículo no encontrado',
      });
      expect(itemRepository.updateById).not.toHaveBeenCalled();
    });

    it('rechaza un retargeteo cruzado entre itemCategoryId y itemCategory.id', async () => {
      itemRepository.findById.mockResolvedValue(buildItem({ itemCategory: undefined }));
      itemCategoryRepository.findById.mockImplementation(async (id: string) => {
        if (id === itemCategoryId) {
          return buildItemCategory();
        }
        return buildItemCategory({ id, enterpriseId: 'otra-empresa' });
      });

      await expect(
        service.updateById(itemId, {
          itemCategoryId,
          itemCategory: { id: 'categoria-ajena' },
        } as Item),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Artículo no encontrado',
      });
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al actualizar');
      itemRepository.findById.mockResolvedValue(buildItem());
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());
      itemRepository.updateById.mockRejectedValue(repositoryError);

      await expect(service.updateById(itemId, buildItem())).rejects.toBe(repositoryError);
    });
  });

  describe('deleteById', () => {
    it('lanza 404 si el artículo no existe', async () => {
      itemRepository.findById.mockResolvedValue(null);

      await expect(service.deleteById(itemId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Artículo no encontrado',
      });
    });

    it('no elimina si el caller no tiene permiso items.delete', async () => {
      itemRepository.findById.mockResolvedValue(buildItem());
      enterpriseAccessService.assertCurrentEntityAccessible.mockImplementation(() => {
        throw new HttpException(
          'No tiene permiso para realizar la acción items.delete',
          HttpStatus.FORBIDDEN,
        );
      });

      await expect(service.deleteById(itemId)).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        message: 'No tiene permiso para realizar la acción items.delete',
      });
      expect(itemRepository.deleteById).not.toHaveBeenCalled();
    });

    it('elimina el artículo accesible', async () => {
      itemRepository.findById.mockResolvedValue(buildItem());
      itemRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.deleteById(itemId)).resolves.toEqual({ affected: 1, raw: [] });
      expect(enterpriseAccessService.assertCurrentEntityAccessible).toHaveBeenCalledWith(
        enterpriseId,
        'Artículo no encontrado',
        { resource: 'items', action: 'delete' },
      );
      expect(itemRepository.deleteById).toHaveBeenCalledWith(itemId);
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al eliminar');
      itemRepository.findById.mockResolvedValue(buildItem());
      itemRepository.deleteById.mockRejectedValue(repositoryError);

      await expect(service.deleteById(itemId)).rejects.toBe(repositoryError);
    });
  });
});
