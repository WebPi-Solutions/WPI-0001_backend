import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ItemCategory } from 'src/entities/item-category/item-category.entity';
import { ItemCategoryController } from './item-category.controller';
import { ItemCategoryService } from './item-category.service';

describe('ItemCategoryController', () => {
  let controller: ItemCategoryController;
  let itemCategoryService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const itemCategoryId = 'item-category-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  beforeEach(async () => {
    itemCategoryService = {
      create: jest.fn().mockResolvedValue({ id: itemCategoryId }),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [ItemCategoryController],
      providers: [{ provide: ItemCategoryService, useValue: itemCategoryService }],
    }).compile();

    controller = testingModule.get(ItemCategoryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('exige enterpriseId', async () => {
      await expect(
        controller.create('', { name: 'Categoría' } as ItemCategory),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(itemCategoryService.create).not.toHaveBeenCalled();
    });

    it('asigna el enterpriseId de la query a la categoría', async () => {
      const itemCategory = {
        name: 'Servicios',
        enterpriseId: 'empresa-atacante',
      } as ItemCategory;

      await expect(controller.create(enterpriseId, itemCategory)).resolves.toEqual({
        id: itemCategoryId,
      });
      expect(itemCategory.enterpriseId).toBe(enterpriseId);
      expect(itemCategoryService.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Servicios', enterpriseId }),
      );
    });
  });

  describe('findAll', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findAll('')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(itemCategoryService.findAll).not.toHaveBeenCalled();
    });

    it('parsea el filtro JSON y fuerza el enterpriseId de la query', async () => {
      await controller.findAll(
        enterpriseId,
        2,
        20,
        'name',
        'DESC',
        JSON.stringify({ enterpriseId: 'empresa-atacante', name: 'Servicios' }),
        'enterprise,items',
      );

      expect(itemCategoryService.findAll).toHaveBeenCalledWith(
        2,
        20,
        'name',
        'DESC',
        { name: 'Servicios', enterpriseId },
        ['enterprise', 'items'],
      );
    });

    it('conserva el enterpriseId si el filtro JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId, 1, 10, 'name', 'ASC', '{no-es-json');

      expect(console.error).toHaveBeenCalled();
      expect(itemCategoryService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'name',
        'ASC',
        { enterpriseId },
        [],
      );
    });

    it('usa valores por defecto al omitir query opcionales', async () => {
      await controller.findAll(enterpriseId);

      expect(itemCategoryService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'name',
        'ASC',
        { enterpriseId },
        [],
      );
    });
  });

  describe('findById', () => {
    it('delega al servicio parseando las relaciones', async () => {
      itemCategoryService.findById.mockResolvedValue({ id: itemCategoryId });

      await expect(controller.findById(itemCategoryId, 'enterprise,items')).resolves.toEqual({
        id: itemCategoryId,
      });
      expect(itemCategoryService.findById).toHaveBeenCalledWith(itemCategoryId, [
        'enterprise',
        'items',
      ]);
    });

    it('busca sin relaciones cuando no se informan', async () => {
      itemCategoryService.findById.mockResolvedValue({ id: itemCategoryId });

      await controller.findById(itemCategoryId);

      expect(itemCategoryService.findById).toHaveBeenCalledWith(itemCategoryId, []);
    });
  });

  describe('updateById', () => {
    it('delega la actualización al servicio', async () => {
      const payload = { name: 'Categoría actualizada' } as ItemCategory;
      itemCategoryService.updateById.mockResolvedValue({ id: itemCategoryId, ...payload });

      await expect(controller.updateById(itemCategoryId, payload)).resolves.toEqual({
        id: itemCategoryId,
        name: 'Categoría actualizada',
      });
      expect(itemCategoryService.updateById).toHaveBeenCalledWith(itemCategoryId, payload);
    });
  });

  describe('delete', () => {
    it('delega la eliminación al servicio', async () => {
      itemCategoryService.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(controller.delete(itemCategoryId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
      expect(itemCategoryService.deleteById).toHaveBeenCalledWith(itemCategoryId);
    });
  });
});
