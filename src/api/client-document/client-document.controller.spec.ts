import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClientDocumentController } from './client-document.controller';
import { ClientDocumentService } from './client-document.service';
import { MulterFile } from 'multer';

describe('ClientDocumentController', () => {
  let controller: ClientDocumentController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      create: jest.fn().mockResolvedValue({ id: 'document-uuid' }),
      assertClientAccessibleForList: jest.fn().mockResolvedValue(undefined),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      findById: jest.fn().mockResolvedValue({ id: 'document-uuid' }),
      updateById: jest.fn().mockResolvedValue({ id: 'document-uuid' }),
      deleteById: jest.fn().mockResolvedValue({ affected: 1 }),
      downloadById: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientDocumentController],
      providers: [{ provide: ClientDocumentService, useValue: service }],
    }).compile();
    controller = module.get(ClientDocumentController);
  });

  it('exige enterpriseId al crear', async () => {
    await expect(
      controller.create('', 'client-uuid', {} as MulterFile),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
    expect(service.create).not.toHaveBeenCalled();
  });

  it('recibe el archivo y delega su creación con cliente y empresa', async () => {
    const file = { originalname: 'contrato.pdf', size: 42 } as MulterFile;
    await controller.create('enterprise-uuid', 'client-uuid', file);
    expect(service.create).toHaveBeenCalledWith(
      'client-uuid',
      file,
      'enterprise-uuid',
    );
  });

  it('fuerza clientId en el filtro del listado y valida el cliente', async () => {
    await controller.findAll(
      'enterprise-uuid',
      'client-uuid',
      2,
      20,
      'name',
      'ASC',
      JSON.stringify({ clientId: 'otro-cliente', name: 'contrato' }),
      'client',
    );
    expect(service.assertClientAccessibleForList).toHaveBeenCalledWith(
      'client-uuid',
      'enterprise-uuid',
    );
    expect(service.findAll).toHaveBeenCalledWith(
      2,
      20,
      'name',
      'ASC',
      { clientId: 'client-uuid', name: 'contrato' },
      ['client'],
    );
  });

  it('exige clientId al listar', async () => {
    await expect(
      controller.findAll('enterprise-uuid', ''),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('delega la descarga del documento', async () => {
    const response = {} as any;
    await controller.downloadById('document-uuid', response);
    expect(service.downloadById).toHaveBeenCalledWith('document-uuid', response);
  });
});
