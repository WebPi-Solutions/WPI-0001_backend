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
import { ItemCategory } from './item-category.entity';
import { ItemCategoryRepository } from './item-category-repository.service';

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

describe('ItemCategoryRepository', () => {
  let itemCategoryRepositoryService: ItemCategoryRepository;
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
        ItemCategoryRepository,
        {
          provide: getRepositoryToken(ItemCategory),
          useValue: typeOrmRepositoryMock,
        },
      ],
    }).compile();

    itemCategoryRepositoryService = testingModule.get(ItemCategoryRepository);
  });

  it('debería estar definido', () => {
    expect(itemCategoryRepositoryService).toBeDefined();
  });

  describe('create', () => {
    it('persiste la categoría de artículos', async () => {
      const categoryToCreate = { name: 'Material' } as Partial<ItemCategory>;
      typeOrmRepositoryMock.save.mockResolvedValue({ id: 'category-uuid', ...categoryToCreate });

      const result = await itemCategoryRepositoryService.create(categoryToCreate);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith(categoryToCreate);
      expect(result.id).toBe('category-uuid');
    });
  });

  describe('findAll', () => {
    it('lista categorías paginadas usando QueryBuilderService', async () => {
      const result = await itemCategoryRepositoryService.findAll(
        1,
        10,
        'name',
        'ASC',
        {},
        ['enterprise'],
      );

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'itemCategory',
        expect.objectContaining({
          relations: [
            {
              property: 'enterprise',
              alias: 'enterprise',
              isLeftJoinAndSelect: true,
            },
          ],
        }),
      );
      expect(result.total).toBe(0);
    });

    it('lista categorías con valores por defecto y sin relaciones', async () => {
      await itemCategoryRepositoryService.findAll();

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'itemCategory',
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
    it('busca una categoría por identificador', async () => {
      const foundCategory = { id: 'category-uuid' } as ItemCategory;
      typeOrmRepositoryMock.findOne.mockResolvedValue(foundCategory);

      const result = await itemCategoryRepositoryService.findById('category-uuid');

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'category-uuid' },
        relations: undefined,
      });
      expect(result).toEqual(foundCategory);
    });

    it('busca una categoría incluyendo relaciones', async () => {
      await itemCategoryRepositoryService.findById('category-uuid', ['enterprise']);

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'category-uuid' },
        relations: ['enterprise'],
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si la categoría no existe', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue(null);

      const thrownError = await expectHttpException(
        itemCategoryRepositoryService.updateById('missing-id', {}),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('fusiona y recarga la categoría con empresa', async () => {
      const existingCategory = { id: 'category-uuid', name: 'Antiguo' } as ItemCategory;
      const payload = { name: 'Nuevo' } as Partial<ItemCategory>;
      const reloadedCategory = { ...existingCategory, ...payload } as ItemCategory;

      typeOrmRepositoryMock.findOne
        .mockResolvedValueOnce(existingCategory)
        .mockResolvedValueOnce(reloadedCategory);
      typeOrmRepositoryMock.save.mockResolvedValue(reloadedCategory);

      const result = await itemCategoryRepositoryService.updateById('category-uuid', payload);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith({
        ...existingCategory,
        ...payload,
      });
      expect(typeOrmRepositoryMock.findOne).toHaveBeenLastCalledWith({
        where: { id: 'category-uuid' },
        relations: ['enterprise'],
      });
      expect(result).toEqual(reloadedCategory);
    });
  });

  describe('deleteById', () => {
    it('elimina la categoría por identificador', async () => {
      const deleteResult = { affected: 1, raw: [] };
      typeOrmRepositoryMock.delete.mockResolvedValue(deleteResult);

      const result = await itemCategoryRepositoryService.deleteById('category-uuid');

      expect(typeOrmRepositoryMock.delete).toHaveBeenCalledWith('category-uuid');
      expect(result).toEqual(deleteResult);
    });
  });
});
