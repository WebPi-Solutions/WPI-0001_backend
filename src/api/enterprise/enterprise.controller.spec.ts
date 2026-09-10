import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { MulterFile } from 'multer';
import { Enterprise } from 'src/entities/enterprise/enterprise.entity';
import { EnterpriseController } from './enterprise.controller';
import { EnterpriseService } from './enterprise.service';

describe('EnterpriseController', () => {
  let controller: EnterpriseController;
  let enterpriseService: {
    create: jest.Mock;
    createLogoInDropbox: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    downloadLogoFile: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  /**
   * Construye un archivo Multer de prueba para el logo.
   * @param overrides - Campos a sobrescribir
   * @returns Archivo Multer simulado
   */
  const buildMulterFile = (overrides: Partial<MulterFile> = {}): MulterFile =>
    ({
      originalname: 'logo.png',
      mimetype: 'image/png',
      size: 1024,
      buffer: Buffer.from('contenido-logo'),
      fieldname: 'file',
      encoding: '7bit',
      ...overrides,
    }) as MulterFile;

  beforeEach(async () => {
    enterpriseService = {
      create: jest.fn().mockResolvedValue({ id: enterpriseId }),
      createLogoInDropbox: jest.fn().mockResolvedValue({ id: enterpriseId }),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
      downloadLogoFile: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [EnterpriseController],
      providers: [{ provide: EnterpriseService, useValue: enterpriseService }],
    }).compile();

    controller = testingModule.get(EnterpriseController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('delega la creación al servicio', async () => {
      const enterprise = { name: 'Empresa Demo' } as Enterprise;

      await expect(controller.create(enterprise)).resolves.toEqual({ id: enterpriseId });
      expect(enterpriseService.create).toHaveBeenCalledWith(enterprise);
    });
  });

  describe('createLogoInDropbox', () => {
    it('exige un archivo', async () => {
      await expect(
        controller.createLogoInDropbox(undefined as unknown as MulterFile, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'No se ha proporcionado ningún archivo',
      });
      expect(enterpriseService.createLogoInDropbox).not.toHaveBeenCalled();
    });

    it('exige enterpriseId', async () => {
      await expect(controller.createLogoInDropbox(buildMulterFile(), '')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'No se ha proporcionado el ID de la empresa',
      });
      expect(enterpriseService.createLogoInDropbox).not.toHaveBeenCalled();
    });

    it('delega la subida del logo al servicio', async () => {
      const file = buildMulterFile();

      await expect(controller.createLogoInDropbox(file, enterpriseId)).resolves.toEqual({
        id: enterpriseId,
      });
      expect(enterpriseService.createLogoInDropbox).toHaveBeenCalledWith(enterpriseId, file);
    });

    it('envuelve un error síncrono del servicio en 400', async () => {
      enterpriseService.createLogoInDropbox.mockImplementation(() => {
        throw new Error('fallo sincrono');
      });

      await expect(
        controller.createLogoInDropbox(buildMulterFile(), enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error al procesar los datos: fallo sincrono',
      });
    });
  });

  describe('findAll', () => {
    it('parsea el filtro JSON y las relaciones', async () => {
      await controller.findAll(
        2,
        20,
        'name',
        'DESC',
        JSON.stringify({ nif: 'A12345678' }),
        'clients,suppliers',
      );

      expect(enterpriseService.findAll).toHaveBeenCalledWith(
        2,
        20,
        'name',
        'DESC',
        { nif: 'A12345678' },
        ['clients', 'suppliers'],
      );
    });

    it('consulta sin filtro si el JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await controller.findAll(1, 10, 'name', 'ASC', '{no-es-json');

      expect(console.error).toHaveBeenCalled();
      expect(enterpriseService.findAll).toHaveBeenCalledWith(1, 10, 'name', 'ASC', {}, []);
    });

    it('usa los valores por defecto cuando no hay filtro ni relaciones', async () => {
      await controller.findAll();

      expect(enterpriseService.findAll).toHaveBeenCalledWith(1, 10, 'name', 'ASC', {}, []);
    });
  });

  describe('findById', () => {
    it('delega al servicio parseando las relaciones', async () => {
      enterpriseService.findById.mockResolvedValue({ id: enterpriseId });

      await expect(controller.findById(enterpriseId, 'clients,users')).resolves.toEqual({
        id: enterpriseId,
      });
      expect(enterpriseService.findById).toHaveBeenCalledWith(enterpriseId, [
        'clients',
        'users',
      ]);
    });

    it('consulta sin relaciones cuando no se informan', async () => {
      enterpriseService.findById.mockResolvedValue({ id: enterpriseId });

      await controller.findById(enterpriseId);

      expect(enterpriseService.findById).toHaveBeenCalledWith(enterpriseId, []);
    });
  });

  describe('downloadLogoFile', () => {
    it('delega la descarga al servicio', async () => {
      const response = {} as Response;
      enterpriseService.downloadLogoFile.mockResolvedValue(undefined);

      await controller.downloadLogoFile(enterpriseId, response);

      expect(enterpriseService.downloadLogoFile).toHaveBeenCalledWith(enterpriseId, response);
    });
  });

  describe('updateById', () => {
    it('delega la actualización al servicio', async () => {
      const payload = { name: 'Empresa Actualizada' } as Enterprise;
      enterpriseService.updateById.mockResolvedValue({ id: enterpriseId, ...payload });

      await expect(controller.updateById(enterpriseId, payload)).resolves.toEqual({
        id: enterpriseId,
        name: 'Empresa Actualizada',
      });
      expect(enterpriseService.updateById).toHaveBeenCalledWith(enterpriseId, payload);
    });
  });

  describe('delete', () => {
    it('delega la eliminación al servicio', async () => {
      enterpriseService.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(controller.delete(enterpriseId)).resolves.toEqual({ affected: 1, raw: [] });
      expect(enterpriseService.deleteById).toHaveBeenCalledWith(enterpriseId);
    });
  });

  /**
   * Recarga el controlador con `MulterFile` como clase real para cubrir
   * el ternario de `emitDecoratorMetadata` en `@UploadedFile()`.
   */
  it('cubre los metadatos de MulterFile cuando la clase existe en runtime', () => {
    jest.isolateModules(() => {
      jest.doMock('multer', () => ({
        MulterFile: class MulterFile {},
      }));
      const { EnterpriseController: ReloadedEnterpriseController } = require('./enterprise.controller');
      expect(ReloadedEnterpriseController).toBeDefined();
    });
  });
});
