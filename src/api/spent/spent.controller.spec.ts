import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { MulterFile } from 'multer';
import { Spent } from 'src/entities/spent/spent.entity';
import { SpentController } from './spent.controller';
import { SpentService } from './spent.service';

describe('SpentController', () => {
  let controller: SpentController;
  let spentService: {
    create: jest.Mock;
    addFileToSpentById: jest.Mock;
    previewAiSpentFile: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
    downloadSpentFile: jest.Mock;
    removeFileFromSpentById: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const spentId = 'spent-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  /**
   * Construye un archivo Multer de prueba.
   * @param overrides - Campos a sobrescribir
   * @returns Archivo Multer simulado
   */
  const buildMulterFile = (overrides: Partial<MulterFile> = {}): MulterFile =>
    ({
      originalname: 'factura-proveedor.pdf',
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.from('contenido-pdf-de-prueba'),
      fieldname: 'file',
      encoding: '7bit',
      ...overrides,
    }) as MulterFile;

  beforeEach(async () => {
    spentService = {
      create: jest.fn().mockResolvedValue({ id: spentId }),
      addFileToSpentById: jest.fn().mockResolvedValue({ id: spentId }),
      previewAiSpentFile: jest.fn(),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
      downloadSpentFile: jest.fn(),
      removeFileFromSpentById: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [SpentController],
      providers: [{ provide: SpentService, useValue: spentService }],
    }).compile();

    controller = testingModule.get(SpentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('delega la creación al servicio', async () => {
      const spent = { name: 'Gasto Demo' } as Spent;

      await expect(controller.create(spent)).resolves.toEqual({ id: spentId });
      expect(spentService.create).toHaveBeenCalledWith(spent);
    });
  });

  describe('addFileToSpentById', () => {
    it('exige un archivo', async () => {
      await expect(
        controller.addFileToSpentById(undefined as unknown as MulterFile, spentId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'No se ha proporcionado ningún archivo',
      });
      expect(spentService.addFileToSpentById).not.toHaveBeenCalled();
    });

    it('exige spentId', async () => {
      await expect(controller.addFileToSpentById(buildMulterFile(), '')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'No se ha proporcionado el ID del gasto',
      });
      expect(spentService.addFileToSpentById).not.toHaveBeenCalled();
    });

    it('delega la subida al servicio', async () => {
      const file = buildMulterFile();

      await expect(controller.addFileToSpentById(file, spentId)).resolves.toEqual({
        id: spentId,
      });
      expect(spentService.addFileToSpentById).toHaveBeenCalledWith(spentId, file);
    });

    it('traduce un error síncrono a 400', async () => {
      spentService.addFileToSpentById.mockImplementation(() => {
        throw new Error('datos corruptos');
      });

      await expect(controller.addFileToSpentById(buildMulterFile(), spentId)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error al procesar los datos: datos corruptos',
      });
    });
  });

  describe('previewAiSpentFile', () => {
    it('exige un archivo', async () => {
      await expect(
        controller.previewAiSpentFile(undefined as unknown as MulterFile, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'No se ha proporcionado ningún archivo',
      });
      expect(spentService.previewAiSpentFile).not.toHaveBeenCalled();
    });

    it('exige enterpriseId', async () => {
      await expect(controller.previewAiSpentFile(buildMulterFile(), '')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(spentService.previewAiSpentFile).not.toHaveBeenCalled();
    });

    it('devuelve la previsualización generada por el servicio', async () => {
      const preview = { spentData: { name: 'Gasto IA' } };
      spentService.previewAiSpentFile.mockResolvedValue(preview);

      await expect(
        controller.previewAiSpentFile(buildMulterFile(), enterpriseId),
      ).resolves.toEqual(preview);
    });

    it('reenvía una HttpException del servicio', async () => {
      spentService.previewAiSpentFile.mockRejectedValue(
        new HttpException('PDF inválido', HttpStatus.BAD_REQUEST),
      );

      await expect(
        controller.previewAiSpentFile(buildMulterFile(), enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'PDF inválido',
      });
    });

    it('traduce un error genérico a 400', async () => {
      spentService.previewAiSpentFile.mockRejectedValue(new Error('timeout'));

      await expect(
        controller.previewAiSpentFile(buildMulterFile(), enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Error al procesar el archivo: timeout',
      });
    });
  });

  describe('findAll', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findAll('')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(spentService.findAll).not.toHaveBeenCalled();
    });

    it('usa paginación por defecto y omite filtro opcional', async () => {
      await controller.findAll(enterpriseId);

      expect(spentService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'issuedDate',
        'DESC',
        { 'supplier.enterpriseId': enterpriseId },
        ['supplier'],
      );
    });

    it('parsea el filtro JSON y fuerza supplier.enterpriseId', async () => {
      await controller.findAll(
        enterpriseId,
        2,
        20,
        'issuedDate',
        'ASC',
        JSON.stringify({ 'supplier.enterpriseId': 'empresa-atacante', status: 'paid' }),
        'supplier',
      );

      expect(spentService.findAll).toHaveBeenCalledWith(
        2,
        20,
        'issuedDate',
        'ASC',
        { status: 'paid', 'supplier.enterpriseId': enterpriseId },
        ['supplier'],
      );
    });

    it('conserva supplier.enterpriseId si el filtro JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId, 1, 10, 'issuedDate', 'DESC', '{no-es-json');

      expect(console.error).toHaveBeenCalled();
      expect(spentService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'issuedDate',
        'DESC',
        { 'supplier.enterpriseId': enterpriseId },
        ['supplier'],
      );
    });
  });

  describe('findById', () => {
    it('delega al servicio parseando las relaciones', async () => {
      spentService.findById.mockResolvedValue({ id: spentId });

      await expect(controller.findById(spentId, 'supplier')).resolves.toEqual({ id: spentId });
      expect(spentService.findById).toHaveBeenCalledWith(spentId, ['supplier']);
    });

    it('consulta sin relaciones cuando no se informan', async () => {
      spentService.findById.mockResolvedValue({ id: spentId });

      await controller.findById(spentId);

      expect(spentService.findById).toHaveBeenCalledWith(spentId, []);
    });
  });

  describe('updateById', () => {
    it('delega la actualización al servicio', async () => {
      const payload = { name: 'Gasto Actualizado' } as Spent;
      spentService.updateById.mockResolvedValue({ id: spentId, ...payload });

      await expect(controller.updateById(spentId, payload)).resolves.toEqual({
        id: spentId,
        name: 'Gasto Actualizado',
      });
      expect(spentService.updateById).toHaveBeenCalledWith(spentId, payload);
    });
  });

  describe('delete', () => {
    it('delega la eliminación al servicio', async () => {
      spentService.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(controller.delete(spentId)).resolves.toEqual({ affected: 1, raw: [] });
      expect(spentService.deleteById).toHaveBeenCalledWith(spentId);
    });
  });

  describe('downloadSpentFile', () => {
    it('delega la descarga al servicio', async () => {
      const response = {} as Response;
      spentService.downloadSpentFile.mockResolvedValue(undefined);

      await controller.downloadSpentFile(spentId, response);

      expect(spentService.downloadSpentFile).toHaveBeenCalledWith(spentId, response);
    });
  });

  describe('removeFileFromSpentById', () => {
    it('delega la eliminación del archivo al servicio', async () => {
      spentService.removeFileFromSpentById.mockResolvedValue({ id: spentId });

      await expect(controller.removeFileFromSpentById(spentId)).resolves.toEqual({
        id: spentId,
      });
      expect(spentService.removeFileFromSpentById).toHaveBeenCalledWith(spentId);
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
      const { SpentController: ReloadedSpentController } = require('./spent.controller');
      expect(ReloadedSpentController).toBeDefined();
    });
  });
});
