import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { ClientRepository } from 'src/entities/client/client-repository.service';
import { ClientDocument } from 'src/entities/client-document/client-document.entity';
import { ClientDocumentRepository } from 'src/entities/client-document/client-document-repository.service';
import { ClientDocumentService } from './client-document.service';
import { DropboxService } from 'src/services/dropbox/dropbox.service';
import { MulterFile } from 'multer';

describe('ClientDocumentService', () => {
  let service: ClientDocumentService;
  let documentRepository: Record<string, jest.Mock>;
  let clientRepository: Record<string, jest.Mock>;
  let enterpriseAccessService: Record<string, jest.Mock>;
  let dropboxService: Record<string, jest.Mock>;

  const client = { id: 'client-uuid', enterpriseId: 'enterprise-uuid' };

  beforeEach(async () => {
    documentRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };
    clientRepository = { findById: jest.fn() };
    enterpriseAccessService = {
      assertCurrentEntityAccessible: jest.fn(),
      mergeRelationNames: jest.fn(
        (relations: string[] = [], required: string[] = []) => [
          ...new Set([...relations, ...required]),
        ],
      ),
    };
    dropboxService = {
      uploadFile: jest.fn(),
      deleteFile: jest.fn(),
      downloadFile: jest.fn(),
      sanitizeFileName: jest.fn((name: string) => name),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientDocumentService,
        { provide: ClientDocumentRepository, useValue: documentRepository },
        { provide: ClientRepository, useValue: clientRepository },
        { provide: EnterpriseAccessService, useValue: enterpriseAccessService },
        { provide: DropboxService, useValue: dropboxService },
      ],
    }).compile();
    service = module.get(ClientDocumentService);
  });

  it('crea metadatos desde el archivo y lo sube a Dropbox', async () => {
    clientRepository.findById.mockResolvedValue(client);
    documentRepository.create.mockResolvedValue({ id: 'document-uuid' });
    documentRepository.getClientDocumentFilePath = jest
      .fn()
      .mockReturnValue('/empresa/cliente/documento');
    const file = { originalname: ' contrato.pdf ', size: 42 } as MulterFile;

    await service.create(client.id, file, client.enterpriseId);

    expect(documentRepository.create).toHaveBeenCalledWith({
      clientId: client.id,
      name: 'contrato.pdf',
      size: 42,
    });
    expect(dropboxService.uploadFile).toHaveBeenCalledWith(
      '/empresa/cliente/documento',
      file,
    );
    expect(
      enterpriseAccessService.assertCurrentEntityAccessible,
    ).toHaveBeenCalledWith(
      client.enterpriseId,
      'Documento de cliente no encontrado',
      { resource: 'documentManagement', action: 'write' },
    );
  });

  it('rechaza un cliente de otra empresa sin crear el documento', async () => {
    clientRepository.findById.mockResolvedValue({
      ...client,
      enterpriseId: 'otra-empresa',
    });
    await expect(
      service.create(
        client.id,
        { originalname: 'a.pdf', size: 1 } as MulterFile,
        client.enterpriseId,
      ),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    expect(documentRepository.create).not.toHaveBeenCalled();
  });

  it('carga el cliente para proteger el acceso por UUID', async () => {
    const document = {
      id: 'document-uuid',
      clientId: client.id,
      client,
    } as ClientDocument;
    documentRepository.findById.mockResolvedValue(document);
    await expect(service.findById(document.id)).resolves.toEqual(document);
    expect(documentRepository.findById).toHaveBeenCalledWith(document.id, [
      'client',
    ]);
    expect(
      enterpriseAccessService.assertCurrentEntityAccessible,
    ).toHaveBeenCalledWith(
      client.enterpriseId,
      'Documento de cliente no encontrado',
      { resource: 'documentManagement', action: 'read' },
    );
  });

  it('revierte el registro si Dropbox rechaza la subida', async () => {
    clientRepository.findById.mockResolvedValue(client);
    documentRepository.create.mockResolvedValue({ id: 'document-uuid' });
    documentRepository.getClientDocumentFilePath = jest
      .fn()
      .mockReturnValue('/empresa/cliente/documento');
    const uploadError = new Error('Dropbox no disponible');
    dropboxService.uploadFile.mockRejectedValue(uploadError);

    await expect(
      service.create(
        client.id,
        { originalname: 'contrato.pdf', size: 42 } as MulterFile,
        client.enterpriseId,
      ),
    ).rejects.toBe(uploadError);
    expect(documentRepository.deleteById).toHaveBeenCalledWith('document-uuid');
  });

  it('solo permite actualizar el nombre del documento', async () => {
    const existing = {
      id: 'document-uuid',
      clientId: client.id,
      client,
    } as ClientDocument;
    documentRepository.findById.mockResolvedValue(existing);
    documentRepository.updateById.mockResolvedValue(existing);
    await service.updateById(existing.id, {
      clientId: 'otro-cliente',
      name: 'nuevo.pdf',
      size: 10,
    } as ClientDocument);
    expect(documentRepository.updateById).toHaveBeenCalledWith(existing.id, {
      name: 'nuevo.pdf',
    });
  });

  it('elimina primero el archivo de Dropbox y después los metadatos', async () => {
    const document = {
      id: 'document-uuid',
      clientId: client.id,
      client,
    } as ClientDocument;
    documentRepository.findById.mockResolvedValue(document);
    documentRepository.getClientDocumentFilePath = jest
      .fn()
      .mockReturnValue('/empresa/cliente/documento');
    dropboxService.deleteFile.mockResolvedValue(undefined);
    documentRepository.deleteById.mockResolvedValue({ affected: 1 });

    await service.deleteById(document.id);

    expect(dropboxService.deleteFile).toHaveBeenCalledWith('/empresa/cliente/documento');
    expect(documentRepository.deleteById).toHaveBeenCalledWith(document.id);
    expect(dropboxService.deleteFile.mock.invocationCallOrder[0]).toBeLessThan(
      documentRepository.deleteById.mock.invocationCallOrder[0],
    );
  });

  it('conserva los metadatos si Dropbox no puede eliminar el archivo', async () => {
    const document = {
      id: 'document-uuid',
      clientId: client.id,
      client,
    } as ClientDocument;
    const dropboxError = new Error('Dropbox no disponible');
    documentRepository.findById.mockResolvedValue(document);
    documentRepository.getClientDocumentFilePath = jest
      .fn()
      .mockReturnValue('/empresa/cliente/documento');
    dropboxService.deleteFile.mockRejectedValue(dropboxError);

    await expect(service.deleteById(document.id)).rejects.toBe(dropboxError);

    expect(documentRepository.deleteById).not.toHaveBeenCalled();
  });

  it('descarga el archivo desde Dropbox tras validar el acceso de lectura', async () => {
    const document = {
      id: 'document-uuid',
      clientId: client.id,
      name: 'contrato firmado.pdf',
      client,
    } as ClientDocument;
    const response = { set: jest.fn(), send: jest.fn() } as any;
    documentRepository.findById.mockResolvedValue(document);
    documentRepository.getClientDocumentFilePath = jest.fn().mockReturnValue('/empresa/cliente/documento');
    dropboxService.downloadFile.mockResolvedValue(Buffer.from('contenido'));

    await service.downloadById(document.id, response);

    expect(dropboxService.downloadFile).toHaveBeenCalledWith('/empresa/cliente/documento');
    expect(response.set).toHaveBeenCalledWith(expect.objectContaining({
      'Content-Disposition': expect.stringContaining('contrato firmado.pdf'),
      'Content-Length': '9',
    }));
    expect(response.send).toHaveBeenCalledWith(Buffer.from('contenido'));
  });
});
