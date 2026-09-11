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
import { Enterprise } from './enterprise.entity';
import { EnterpriseRepository } from './enterprise-repository.service';

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

describe('EnterpriseRepository', () => {
  let enterpriseRepositoryService: EnterpriseRepository;
  let typeOrmRepositoryMock: {
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
  };
  const originalFolderPath = process.env.DROPBOX_ENTERPRISE_FOLDER_PATH;
  const originalLogoPath = process.env.DROPBOX_ENTERPRISE_LOGO_FILE_PATH;

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
        EnterpriseRepository,
        {
          provide: getRepositoryToken(Enterprise),
          useValue: typeOrmRepositoryMock,
        },
      ],
    }).compile();

    enterpriseRepositoryService = testingModule.get(EnterpriseRepository);
  });

  afterEach(() => {
    process.env.DROPBOX_ENTERPRISE_FOLDER_PATH = originalFolderPath;
    process.env.DROPBOX_ENTERPRISE_LOGO_FILE_PATH = originalLogoPath;
  });

  it('debería estar definido', () => {
    expect(enterpriseRepositoryService).toBeDefined();
  });

  describe('create', () => {
    it('persiste la empresa mediante save', async () => {
      const enterpriseToCreate = { name: 'Empresa' } as Enterprise;
      typeOrmRepositoryMock.save.mockResolvedValue({
        id: 'enterprise-uuid',
        ...enterpriseToCreate,
      });

      const result = await enterpriseRepositoryService.create(enterpriseToCreate);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith(enterpriseToCreate);
      expect(result.id).toBe('enterprise-uuid');
    });
  });

  describe('findAll', () => {
    it('lista empresas paginadas usando QueryBuilderService', async () => {
      const result = await enterpriseRepositoryService.findAll(
        1,
        10,
        'name',
        'ASC',
        {},
        ['users'],
      );

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'enterprise',
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          sort: 'name',
          order: 'ASC',
          relations: [
            {
              property: 'users',
              alias: 'users',
              isLeftJoinAndSelect: true,
            },
          ],
        }),
      );
      expect(result.total).toBe(0);
    });

    it('lista empresas con valores por defecto y sin relaciones', async () => {
      await enterpriseRepositoryService.findAll();

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'enterprise',
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
    it('busca una empresa por identificador', async () => {
      const foundEnterprise = { id: 'enterprise-uuid' } as Enterprise;
      typeOrmRepositoryMock.findOne.mockResolvedValue(foundEnterprise);

      const result = await enterpriseRepositoryService.findById('enterprise-uuid');

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'enterprise-uuid' },
        relations: undefined,
      });
      expect(result).toEqual(foundEnterprise);
    });

    it('busca una empresa incluyendo relaciones', async () => {
      await enterpriseRepositoryService.findById('enterprise-uuid', ['users']);

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'enterprise-uuid' },
        relations: ['users'],
      });
    });
  });

  describe('findByNif', () => {
    it('busca una empresa por NIF', async () => {
      const foundEnterprise = { id: 'enterprise-uuid', nif: 'B12345678' } as Enterprise;
      typeOrmRepositoryMock.findOne.mockResolvedValue(foundEnterprise);

      const result = await enterpriseRepositoryService.findByNif('B12345678');

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { nif: 'B12345678' },
      });
      expect(result).toEqual(foundEnterprise);
    });
  });

  describe('updateById', () => {
    it('lanza 404 si la empresa no existe', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue(null);

      const thrownError = await expectHttpException(
        enterpriseRepositoryService.updateById('missing-id', { name: 'Nueva' } as Enterprise),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('fusiona y persiste la empresa existente', async () => {
      const existingEnterprise = { id: 'enterprise-uuid', name: 'Antigua' } as Enterprise;
      const payload = { name: 'Nueva' } as Enterprise;
      const reloadedEnterprise = { ...existingEnterprise, ...payload } as Enterprise;

      typeOrmRepositoryMock.findOne
        .mockResolvedValueOnce(existingEnterprise)
        .mockResolvedValueOnce(reloadedEnterprise);
      typeOrmRepositoryMock.save.mockResolvedValue(reloadedEnterprise);

      const result = await enterpriseRepositoryService.updateById('enterprise-uuid', payload);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith({
        ...existingEnterprise,
        ...payload,
      });
      expect(result).toEqual(reloadedEnterprise);
    });
  });

  describe('deleteById', () => {
    it('elimina la empresa por identificador', async () => {
      const deleteResult = { affected: 1, raw: [] };
      typeOrmRepositoryMock.delete.mockResolvedValue(deleteResult);

      const result = await enterpriseRepositoryService.deleteById('enterprise-uuid');

      expect(typeOrmRepositoryMock.delete).toHaveBeenCalledWith('enterprise-uuid');
      expect(result).toEqual(deleteResult);
    });
  });

  describe('getEnterpriseFolderPath', () => {
    it('sustituye el identificador de empresa en la carpeta de Dropbox', () => {
      process.env.DROPBOX_ENTERPRISE_FOLDER_PATH = '/empresas/:enterpriseId';

      const folderPath = enterpriseRepositoryService.getEnterpriseFolderPath('enterprise-uuid');

      expect(folderPath).toBe('/empresas/enterprise-uuid');
    });
  });

  describe('getLogoFilePath', () => {
    it('sustituye el identificador y añade la extensión del logo', () => {
      process.env.DROPBOX_ENTERPRISE_LOGO_FILE_PATH = '/empresas/:enterpriseId/logo';

      const logoPath = enterpriseRepositoryService.getLogoFilePath('enterprise-uuid', 'png');

      expect(logoPath).toBe('/empresas/enterprise-uuid/logo.png');
    });
  });
});
