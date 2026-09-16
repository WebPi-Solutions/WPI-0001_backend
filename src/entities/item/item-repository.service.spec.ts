jest.mock('src/common/helpers/query-builder/query-builder.service', () => ({
  QueryBuilderService: {
    getCount: jest.fn().mockResolvedValue(0),
    getPaginatedResults: jest.fn().mockResolvedValue({
      items: [],
      total: 0,
      currentPage: 1,
      totalPages: 0,
    }),
  },
}));

import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryBuilderService } from 'src/common/helpers/query-builder/query-builder.service';
import { Item } from './item.entity';
import { ItemRepository } from './item-repository.service';

/**
 * Extrae la HttpException lanzada por una promesa rechazada.
 * @param rejectedPromise - Promesa que debe fallar
 * @returns La excepción HTTP capturada
 */
async function expectHttpException(
  rejectedPromise: Promise<unknown>,
): Promise<HttpException> {
  try {
    await rejectedPromise;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HttpException);
    return error as HttpException;
  }
  throw new Error('Se esperaba una HttpException');
}

describe('ItemRepository', () => {
  let itemRepositoryService: ItemRepository;
  let typeOrmRepositoryMock: {
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
  };

  /**
   * Crea el módulo de pruebas con repositorio TypeORM simulado.
   */
  beforeEach(async () => {
    jest.clearAllMocks();
    (QueryBuilderService.getPaginatedResults as jest.Mock).mockResolvedValue({
      items: [],
      total: 0,
      currentPage: 1,
      totalPages: 0,
    });

    typeOrmRepositoryMock = {
      save: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        ItemRepository,
        {
          provide: getRepositoryToken(Item),
          useValue: typeOrmRepositoryMock,
        },
      ],
    }).compile();

    itemRepositoryService = testingModule.get(ItemRepository);
  });

  it('debería estar definido', () => {
    expect(itemRepositoryService).toBeDefined();
  });

  describe('create', () => {
    it('persiste el artículo', async () => {
      const itemToCreate = { name: 'Tornillo' } as Partial<Item>;
      typeOrmRepositoryMock.save.mockResolvedValue({ id: 'item-uuid', ...itemToCreate });

      const result = await itemRepositoryService.create(itemToCreate);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith(itemToCreate);
      expect(result.id).toBe('item-uuid');
    });
  });

  describe('findAll', () => {
    it('lista artículos paginados usando QueryBuilderService', async () => {
      const result = await itemRepositoryService.findAll(
        1,
        10,
        'name',
        'ASC',
        {},
        ['itemCategory'],
      );

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'item',
        expect.objectContaining({
          relations: [
            {
              property: 'itemCategory',
              alias: 'itemCategory',
              isLeftJoinAndSelect: true,
            },
          ],
        }),
      );
      expect(result.total).toBe(0);
    });

    it('lista artículos con valores por defecto y sin relaciones', async () => {
      await itemRepositoryService.findAll();

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'item',
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          sort: 'name',
          order: 'ASC',
          filter: {},
          relations: [],
        }),
      );
    });
  });

  describe('findById', () => {
    it('busca un artículo por identificador', async () => {
      const foundItem = { id: 'item-uuid' } as Item;
      typeOrmRepositoryMock.findOne.mockResolvedValue(foundItem);

      const result = await itemRepositoryService.findById('item-uuid');

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'item-uuid' },
        relations: undefined,
      });
      expect(result).toEqual(foundItem);
    });

    it('busca un artículo incluyendo relaciones', async () => {
      await itemRepositoryService.findById('item-uuid', ['itemCategory']);

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'item-uuid' },
        relations: ['itemCategory'],
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si el artículo no existe', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue(null);

      const thrownError = await expectHttpException(
        itemRepositoryService.updateById('missing-id', {}),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('fusiona y recarga el artículo con su categoría', async () => {
      const existingItem = { id: 'item-uuid', name: 'Antiguo' } as Item;
      const payload = { name: 'Nuevo' } as Partial<Item>;
      const reloadedItem = { ...existingItem, ...payload } as Item;

      typeOrmRepositoryMock.findOne
        .mockResolvedValueOnce(existingItem)
        .mockResolvedValueOnce(reloadedItem);
      typeOrmRepositoryMock.save.mockResolvedValue(reloadedItem);

      const result = await itemRepositoryService.updateById('item-uuid', payload);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith({
        ...existingItem,
        ...payload,
      });
      expect(typeOrmRepositoryMock.findOne).toHaveBeenLastCalledWith({
        where: { id: 'item-uuid' },
        relations: ['itemCategory'],
      });
      expect(result).toEqual(reloadedItem);
    });
  });

  describe('deleteById', () => {
    it('elimina el artículo por identificador', async () => {
      const deleteResult = { affected: 1, raw: [] };
      typeOrmRepositoryMock.delete.mockResolvedValue(deleteResult);

      const result = await itemRepositoryService.deleteById('item-uuid');

      expect(typeOrmRepositoryMock.delete).toHaveBeenCalledWith('item-uuid');
      expect(result).toEqual(deleteResult);
    });
  });
});
