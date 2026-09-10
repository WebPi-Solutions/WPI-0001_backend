const filesUploadMock = jest.fn();
const filesListFolderMock = jest.fn();
const filesDownloadMock = jest.fn();
const filesDeleteV2Mock = jest.fn();
const filesMoveV2Mock = jest.fn();

jest.mock('dropbox', () => ({
  Dropbox: jest.fn().mockImplementation(() => ({
    filesUpload: filesUploadMock,
    filesListFolder: filesListFolderMock,
    filesDownload: filesDownloadMock,
    filesDeleteV2: filesDeleteV2Mock,
    filesMoveV2: filesMoveV2Mock,
  })),
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

jest.mock('dotenv', () => ({ config: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { Dropbox } from 'dropbox';
import { File as MulterFile } from 'multer';
import { DropboxService } from './dropbox.service';

describe('DropboxService', () => {
  let dropboxService: DropboxService;
  const axiosPostMock = axios.post as jest.Mock;

  /**
   * Espera a que termine la inicialización asíncrona del constructor.
   * @returns Promesa resuelta cuando el token mockeado ya se ha aplicado
   */
  const waitForClientInitialization = async (): Promise<void> => {
    await new Promise((resolve) => setImmediate(resolve));
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    axiosPostMock.mockResolvedValue({
      data: {
        access_token: 'dropbox-access-token',
        expires_in: 3600,
      },
    });
    filesUploadMock.mockResolvedValue({ result: { id: 'file-id' } });
    filesListFolderMock.mockResolvedValue({ result: { entries: [{ name: 'a.pdf' }] } });
    filesDownloadMock.mockResolvedValue({ result: { fileBinary: Buffer.from('pdf') } });
    filesDeleteV2Mock.mockResolvedValue({});
    filesMoveV2Mock.mockResolvedValue({});

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [DropboxService],
    }).compile();

    dropboxService = testingModule.get(DropboxService);
    await waitForClientInitialization();
  });

  it('should be defined', () => {
    expect(dropboxService).toBeDefined();
  });

  describe('sanitizeFileName', () => {
    it('devuelve un nombre por defecto si llega vacío', () => {
      expect(dropboxService.sanitizeFileName('')).toBe('documento');
    });

    it('sustituye caracteres inválidos y no ASCII', () => {
      expect(dropboxService.sanitizeFileName('Factura <1>.pdf')).toBe('Factura_1_.pdf');
      expect(dropboxService.sanitizeFileName('año 2026.pdf')).toBe('a_o_2026.pdf');
    });
  });

  describe('uploadFile', () => {
    it('sube el archivo con modo overwrite', async () => {
      const uploadedFile = {
        buffer: Buffer.from('contenido'),
        originalname: 'gasto.pdf',
      } as MulterFile;

      await expect(dropboxService.uploadFile('/empresa/gasto.pdf', uploadedFile)).resolves.toEqual({
        result: { id: 'file-id' },
      });
      expect(filesUploadMock).toHaveBeenCalledWith({
        path: '/empresa/gasto.pdf',
        contents: uploadedFile.buffer,
        mode: { '.tag': 'overwrite' },
      });
    });

    it('propaga el error de subida envuelto', async () => {
      filesUploadMock.mockRejectedValue({ message: 'quota' });

      await expect(
        dropboxService.uploadFile('/empresa/gasto.pdf', { buffer: Buffer.from('x') } as MulterFile),
      ).rejects.toThrow('Error uploading file: quota');
    });
  });

  describe('listFiles', () => {
    it('devuelve las entradas de la carpeta', async () => {
      await expect(dropboxService.listFiles('/empresa')).resolves.toEqual([{ name: 'a.pdf' }]);
    });

    it('devuelve una lista vacía ante error 409', async () => {
      filesListFolderMock.mockRejectedValue({ status: 409 });

      await expect(dropboxService.listFiles('/no-existe')).resolves.toEqual({
        entries: [],
        cursor: '',
        has_more: false,
      });
    });
  });

  describe('downloadFile', () => {
    it('devuelve el buffer del archivo', async () => {
      await expect(dropboxService.downloadFile('/empresa/gasto.pdf')).resolves.toEqual(Buffer.from('pdf'));
    });

    it('falla si Dropbox no envía fileBinary', async () => {
      filesDownloadMock.mockResolvedValue({ result: {} });

      await expect(dropboxService.downloadFile('/empresa/gasto.pdf')).rejects.toThrow(
        'Error downloading file: No se pudo obtener el contenido del archivo',
      );
    });
  });

  describe('deleteFile y moveFile', () => {
    it('elimina el archivo por ruta', async () => {
      await dropboxService.deleteFile('/empresa/gasto.pdf');
      expect(filesDeleteV2Mock).toHaveBeenCalledWith({ path: '/empresa/gasto.pdf' });
    });

    it('mueve el archivo a la nueva ruta', async () => {
      await dropboxService.moveFile('/origen.pdf', '/destino.pdf');
      expect(filesMoveV2Mock).toHaveBeenCalledWith({
        from_path: '/origen.pdf',
        to_path: '/destino.pdf',
      });
    });
  });

  describe('checkFolderExists', () => {
    it('devuelve true si la carpeta existe', async () => {
      await expect(dropboxService.checkFolderExists('/empresa')).resolves.toBe(true);
    });

    it('devuelve false ante error 409', async () => {
      filesListFolderMock.mockRejectedValue({ status: 409 });
      await expect(dropboxService.checkFolderExists('/ausente')).resolves.toBe(false);
    });

    it('propaga un error distinto de 409 al verificar carpeta', async () => {
      filesListFolderMock.mockRejectedValue({ status: 500, message: 'timeout' });

      await expect(dropboxService.checkFolderExists('/empresa')).rejects.toThrow(
        'Error verificando si existe una carpeta en Dropbox: timeout',
      );
    });
  });

  describe('getFile, deleteFile y moveFile errores', () => {
    it('descarga metadatos del archivo', async () => {
      filesDownloadMock.mockResolvedValue({ result: { name: 'gasto.pdf' } });

      await expect(dropboxService.getFile('/empresa/gasto.pdf')).resolves.toEqual({
        name: 'gasto.pdf',
      });
      expect(filesDownloadMock).toHaveBeenCalledWith({ path: '/empresa/gasto.pdf' });
    });

    it('propaga el error de descarga de metadatos', async () => {
      filesDownloadMock.mockRejectedValue({ message: 'not_found' });

      await expect(dropboxService.getFile('/empresa/gasto.pdf')).rejects.toThrow(
        'Error downloading file: not_found',
      );
    });

    it('propaga el error al eliminar', async () => {
      filesDeleteV2Mock.mockRejectedValue({ message: 'locked' });

      await expect(dropboxService.deleteFile('/empresa/gasto.pdf')).rejects.toThrow(
        'Error deleting file: locked',
      );
    });

    it('propaga el error al mover', async () => {
      filesMoveV2Mock.mockRejectedValue({ message: 'conflict' });

      await expect(dropboxService.moveFile('/a.pdf', '/b.pdf')).rejects.toThrow(
        'Error moving file: conflict',
      );
    });
  });

  describe('listFiles errores no 409 y token', () => {
    it('propaga un error distinto de 409 al listar', async () => {
      filesListFolderMock.mockRejectedValue({ status: 500, message: 'unavailable' });

      await expect(dropboxService.listFiles('/empresa')).rejects.toThrow(
        'Error listing files: unavailable',
      );
    });

    it('refresca el token si ha expirado', async () => {
      dropboxService.token_expiration_time = Date.now() - 1;
      axiosPostMock.mockResolvedValue({
        data: {
          access_token: 'nuevo-token',
          expires_in: 3600,
        },
      });

      await dropboxService.listFiles('/empresa');

      expect(axiosPostMock).toHaveBeenCalled();
    });
  });

  describe('constructor y getAccessToken', () => {
    it('registra el fallo de inicialización si axios rechaza al arrancar', async () => {
      axiosPostMock.mockRejectedValue({ message: 'invalid_grant' });

      const testingModule: TestingModule = await Test.createTestingModule({
        providers: [DropboxService],
      }).compile();
      const failingService = testingModule.get(DropboxService);
      await new Promise((resolve) => setImmediate(resolve));

      expect(failingService).toBeDefined();
    });

    it('registra el mensaje de Error si la inicialización rechaza con Error', async () => {
      axiosPostMock.mockRejectedValue(new Error('credenciales inválidas'));

      const testingModule: TestingModule = await Test.createTestingModule({
        providers: [DropboxService],
      }).compile();
      const failingService = testingModule.get(DropboxService);
      await new Promise((resolve) => setImmediate(resolve));

      expect(failingService).toBeDefined();
    });

    it('registra el rechazo no-Error si el cliente Dropbox lanza un string', async () => {
      axiosPostMock.mockResolvedValue({
        data: { access_token: 'token', expires_in: 3600 },
      });
      (Dropbox as unknown as jest.Mock).mockImplementationOnce(() => {
        throw 'dropbox-init-fail';
      });

      const testingModule: TestingModule = await Test.createTestingModule({
        providers: [DropboxService],
      }).compile();
      const failingService = testingModule.get(DropboxService);
      await new Promise((resolve) => setImmediate(resolve));

      expect(failingService).toBeDefined();
    });

    it('propaga el error de token en una operación posterior', async () => {
      dropboxService.token_expiration_time = 0;
      axiosPostMock.mockRejectedValue({ message: 'invalid_grant' });

      await expect(dropboxService.listFiles('/empresa')).rejects.toThrow(
        'Error obtaining access token: invalid_grant',
      );
    });
  });

  describe('downloadFile buffer no Buffer y sanitize vacío', () => {
    it('convierte fileBinary que no es Buffer', async () => {
      filesDownloadMock.mockResolvedValue({ result: { fileBinary: 'contenido' } });

      const downloaded = await dropboxService.downloadFile('/empresa/gasto.pdf');

      expect(Buffer.isBuffer(downloaded)).toBe(true);
      expect(downloaded.toString()).toBe('contenido');
    });

    it('devuelve documento si el nombre queda vacío tras sanitizar', () => {
      expect(dropboxService.sanitizeFileName('___')).toBe('documento');
    });
  });
});
