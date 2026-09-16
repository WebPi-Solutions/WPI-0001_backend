import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Item } from 'src/entities/item/item.entity';
import { ItemController } from './item.controller';
import { ItemService } from './item.service';

describe('ItemController', () => {
  let controller: ItemController;
  let itemService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const itemId = 'item-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  beforeEach(async () => {
    itemService = {
      create: jest.fn().mockResolvedValue({ id: itemId }),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [ItemController],
      providers: [{ provide: ItemService, useValue: itemService }],
    }).compile();

    controller = testingModule.get(ItemController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('exige enterpriseId', async () => {
      await expect(
        controller.create('', { name: 'Artículo', itemCategoryId: 'cat' } as Item),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(itemService.create).not.toHaveBeenCalled();
    });

    it('delega al servicio con el enterpriseId de la query', async () => {
      const item = { name: 'Hora de consultoría', itemCategoryId: 'category-uuid' } as Item;

      await expect(controller.create(enterpriseId, item)).resolves.toEqual({ id: itemId });
      expect(itemService.create).toHaveBeenCalledWith(item, enterpriseId);
    });
  });

  describe('findAll', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findAll('')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(itemService.findAll).not.toHaveBeenCalled();
    });

    it('parsea el filtro JSON y fuerza itemCategory.enterpriseId', async () => {
      await controller.findAll(
        enterpriseId,
        2,
        20,
        'name',
        'DESC',
        JSON.stringify({ 'itemCategory.enterpriseId': 'empresa-atacante', name: 'Hora' }),
        'itemCategory,itemCategory.enterprise',
      );

      expect(itemService.findAll).toHaveBeenCalledWith(
        2,
        20,
        'name',
        'DESC',
        { name: 'Hora', 'itemCategory.enterpriseId': enterpriseId },
        ['itemCategory', 'itemCategory.enterprise'],
      );
    });

    it('añade la relación itemCategory si el cliente no la pide', async () => {
      await controller.findAll(enterpriseId, 1, 10, 'name', 'ASC');

      expect(itemService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'name',
        'ASC',
        { 'itemCategory.enterpriseId': enterpriseId },
        ['itemCategory'],
      );
    });

    it('conserva el tenant si el filtro JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId, 1, 10, 'name', 'ASC', '{no-es-json');

      expect(console.error).toHaveBeenCalled();
      expect(itemService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'name',
        'ASC',
        { 'itemCategory.enterpriseId': enterpriseId },
        ['itemCategory'],
      );
    });
  });

  describe('findById', () => {
    it('delega al servicio parseando las relaciones', async () => {
      itemService.findById.mockResolvedValue({ id: itemId });

      await expect(controller.findById(itemId, 'itemCategory')).resolves.toEqual({ id: itemId });
      expect(itemService.findById).toHaveBeenCalledWith(itemId, ['itemCategory']);
    });

    it('busca sin relaciones cuando no se informan', async () => {
      itemService.findById.mockResolvedValue({ id: itemId });

      await controller.findById(itemId);

      expect(itemService.findById).toHaveBeenCalledWith(itemId, []);
    });
  });

  describe('updateById', () => {
    it('delega la actualización al servicio', async () => {
      const payload = { name: 'Artículo actualizado' } as Item;
      itemService.updateById.mockResolvedValue({ id: itemId, ...payload });

      await expect(controller.updateById(itemId, payload)).resolves.toEqual({
        id: itemId,
        name: 'Artículo actualizado',
      });
      expect(itemService.updateById).toHaveBeenCalledWith(itemId, payload);
    });
  });

  describe('delete', () => {
    it('delega la eliminación al servicio', async () => {
      itemService.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(controller.delete(itemId)).resolves.toEqual({ affected: 1, raw: [] });
      expect(itemService.deleteById).toHaveBeenCalledWith(itemId);
    });
  });
});
