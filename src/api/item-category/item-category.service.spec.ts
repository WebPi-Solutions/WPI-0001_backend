import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ItemCategoryRepository } from 'src/entities/item-category/item-category-repository.service';
import { ItemCategory } from 'src/entities/item-category/item-category.entity';
import { ItemRepository } from 'src/entities/item/item-repository.service';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { ItemCategoryService } from './item-category.service';

describe('ItemCategoryService', () => {
  let service: ItemCategoryService;
  let itemCategoryRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };
  let itemRepository: {
    findAll: jest.Mock;
  };
  let enterpriseAccessService: {
    assertCurrentEntityAccessible: jest.Mock;
  };

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
      description: 'Categoría demo',
      enterpriseId,
      ...overrides,
    }) as ItemCategory;

  beforeEach(async () => {
    itemCategoryRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };
    itemRepository = {
      findAll: jest.fn(),
    };
    enterpriseAccessService = {
      assertCurrentEntityAccessible: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        ItemCategoryService,
        { provide: ItemCategoryRepository, useValue: itemCategoryRepository },
        { provide: ItemRepository, useValue: itemRepository },
        { provide: EnterpriseAccessService, useValue: enterpriseAccessService },
      ],
    }).compile();

    service = testingModule.get(ItemCategoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('persiste la categoría sin la relación enterprise anidada', async () => {
      const createdItemCategory = buildItemCategory();
      itemCategoryRepository.create.mockResolvedValue(createdItemCategory);
      const payload = buildItemCategory({
        enterprise: { id: 'empresa-atacante' },
      } as Partial<ItemCategory>);

      await expect(service.create(payload)).resolves.toEqual(createdItemCategory);
      expect(payload).not.toHaveProperty('enterprise');
      expect(itemCategoryRepository.create).toHaveBeenCalledWith(
        expect.not.objectContaining({ enterprise: expect.anything() }),
      );
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al crear');
      itemCategoryRepository.create.mockRejectedValue(repositoryError);

      await expect(service.create(buildItemCategory())).rejects.toBe(repositoryError);
    });
  });

  describe('findAll', () => {
    it('delega la consulta paginada al repositorio', async () => {
      itemCategoryRepository.findAll.mockResolvedValue(emptyPaginatedResponse);
      const filter = { enterpriseId };

      await expect(
        service.findAll(1, 10, 'name', 'ASC', filter, ['enterprise']),
      ).resolves.toEqual(emptyPaginatedResponse);
      expect(itemCategoryRepository.findAll).toHaveBeenCalledWith(
        1,
        10,
        'name',
        'ASC',
        filter,
        ['enterprise'],
      );
    });
  });

  describe('findById', () => {
    it('devuelve la categoría cuando existe y es accesible', async () => {
      const existingItemCategory = buildItemCategory();
      itemCategoryRepository.findById.mockResolvedValue(existingItemCategory);

      await expect(service.findById(itemCategoryId, ['enterprise'])).resolves.toEqual(
        existingItemCategory,
      );
      expect(itemCategoryRepository.findById).toHaveBeenCalledWith(itemCategoryId, [
        'enterprise',
      ]);
      expect(enterpriseAccessService.assertCurrentEntityAccessible).toHaveBeenCalledWith(
        enterpriseId,
        'Categoría de artículos no encontrada',
        { resource: 'itemCategories', action: 'read' },
      );
    });

    it('lanza 404 cuando la categoría no existe', async () => {
      itemCategoryRepository.findById.mockResolvedValue(null);

      await expect(service.findById(itemCategoryId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Categoría de artículos no encontrada',
      });
    });

    it('propaga 403 si el caller no tiene permiso itemCategories.read', async () => {
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());
      enterpriseAccessService.assertCurrentEntityAccessible.mockImplementation(() => {
        throw new HttpException(
          'No tiene permiso para realizar la acción itemCategories.read',
          HttpStatus.FORBIDDEN,
        );
      });

      await expect(service.findById(itemCategoryId)).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        message: 'No tiene permiso para realizar la acción itemCategories.read',
      });
    });

    it('propaga 404 si el caller no pertenece a la empresa de la categoría', async () => {
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());
      enterpriseAccessService.assertCurrentEntityAccessible.mockImplementation(() => {
        throw new HttpException('Categoría de artículos no encontrada', HttpStatus.NOT_FOUND);
      });

      await expect(service.findById(itemCategoryId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Categoría de artículos no encontrada',
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si la categoría no existe', async () => {
      itemCategoryRepository.findById.mockResolvedValue(null);

      await expect(service.updateById(itemCategoryId, buildItemCategory())).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Categoría de artículos no encontrada',
      });
    });

    it('congela el enterpriseId y no persiste la empresa anidada', async () => {
      const existingItemCategory = buildItemCategory();
      const updatedItemCategory = buildItemCategory({ name: 'Servicios actualizados' });
      itemCategoryRepository.findById.mockResolvedValue(existingItemCategory);
      itemCategoryRepository.updateById.mockResolvedValue(updatedItemCategory);

      await expect(
        service.updateById(itemCategoryId, {
          name: 'Servicios actualizados',
          enterpriseId: 'empresa-atacante',
          enterprise: { id: 'empresa-atacante' },
        } as ItemCategory),
      ).resolves.toEqual(updatedItemCategory);

      expect(itemCategoryRepository.updateById).toHaveBeenCalledWith(
        itemCategoryId,
        expect.objectContaining({
          name: 'Servicios actualizados',
          enterpriseId,
        }),
      );
      expect(itemCategoryRepository.updateById.mock.calls[0][1]).not.toHaveProperty('enterprise');
      expect(enterpriseAccessService.assertCurrentEntityAccessible).toHaveBeenCalledWith(
        enterpriseId,
        'Categoría de artículos no encontrada',
        { resource: 'itemCategories', action: 'write' },
      );
    });

    it('no actualiza si el caller no tiene permiso itemCategories.write', async () => {
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());
      enterpriseAccessService.assertCurrentEntityAccessible.mockImplementation(() => {
        throw new HttpException(
          'No tiene permiso para realizar la acción itemCategories.write',
          HttpStatus.FORBIDDEN,
        );
      });

      await expect(
        service.updateById(itemCategoryId, { name: 'Hackeada' } as ItemCategory),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        message: 'No tiene permiso para realizar la acción itemCategories.write',
      });
      expect(itemCategoryRepository.updateById).not.toHaveBeenCalled();
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al actualizar');
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());
      itemCategoryRepository.updateById.mockRejectedValue(repositoryError);

      await expect(service.updateById(itemCategoryId, buildItemCategory())).rejects.toBe(
        repositoryError,
      );
    });
  });

  describe('deleteById', () => {
    it('lanza 404 si la categoría no existe', async () => {
      itemCategoryRepository.findById.mockResolvedValue(null);

      await expect(service.deleteById(itemCategoryId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Categoría de artículos no encontrada',
      });
    });

    it('no elimina si el caller no tiene permiso itemCategories.delete', async () => {
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());
      enterpriseAccessService.assertCurrentEntityAccessible.mockImplementation(() => {
        throw new HttpException(
          'No tiene permiso para realizar la acción itemCategories.delete',
          HttpStatus.FORBIDDEN,
        );
      });

      await expect(service.deleteById(itemCategoryId)).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        message: 'No tiene permiso para realizar la acción itemCategories.delete',
      });
      expect(itemCategoryRepository.deleteById).not.toHaveBeenCalled();
    });

    it('bloquea el borrado si hay artículos asociados', async () => {
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());
      itemRepository.findAll.mockResolvedValue({
        items: [{ id: 'item-uuid' }],
        total: 1,
        currentPage: 1,
        totalPages: 1,
      });

      await expect(service.deleteById(itemCategoryId)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'No se puede eliminar la categoría de artículos porque tiene artículos asociados',
      });
      expect(itemCategoryRepository.deleteById).not.toHaveBeenCalled();
    });

    it('elimina la categoría vacía y devuelve el resultado', async () => {
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());
      itemRepository.findAll.mockResolvedValue(emptyPaginatedResponse);
      itemCategoryRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.deleteById(itemCategoryId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
      expect(enterpriseAccessService.assertCurrentEntityAccessible).toHaveBeenCalledWith(
        enterpriseId,
        'Categoría de artículos no encontrada',
        { resource: 'itemCategories', action: 'delete' },
      );
      expect(itemCategoryRepository.deleteById).toHaveBeenCalledWith(itemCategoryId);
    });

    it('relanza el error del repositorio', async () => {
      const repositoryError = new Error('fallo al eliminar');
      itemCategoryRepository.findById.mockResolvedValue(buildItemCategory());
      itemRepository.findAll.mockResolvedValue(emptyPaginatedResponse);
      itemCategoryRepository.deleteById.mockRejectedValue(repositoryError);

      await expect(service.deleteById(itemCategoryId)).rejects.toBe(repositoryError);
    });
  });
});
