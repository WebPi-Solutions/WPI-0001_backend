jest.mock('src/common/helpers/query-builder/query-builder.service', () => ({
  QueryBuilderService: {
    getPaginatedResults: jest.fn(),
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ClientDocument } from './client-document.entity';
import { ClientDocumentRepository } from './client-document-repository.service';
import { QueryBuilderService } from 'src/common/helpers/query-builder/query-builder.service';

describe('ClientDocumentRepository', () => {
  let service: ClientDocumentRepository;
  let repository: { save: jest.Mock; findOne: jest.Mock; delete: jest.Mock };
  const originalPath = process.env.DROPBOX_CLIENT_FILE_PATH;

  beforeEach(async () => {
    repository = { save: jest.fn(), findOne: jest.fn(), delete: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientDocumentRepository,
        {
          provide: getRepositoryToken(ClientDocument),
          useValue: repository,
        },
      ],
    }).compile();
    service = module.get(ClientDocumentRepository);
  });

  afterEach(() => {
    process.env.DROPBOX_CLIENT_FILE_PATH = originalPath;
  });

  it('sustituye los marcadores dinámicos de la ruta documental de Dropbox', () => {
    process.env.DROPBOX_CLIENT_FILE_PATH =
      '/enterprises/:enterpriseId/clients/:clientId/documents/:documentId';

    expect(
      service.getClientDocumentFilePath(
        'enterprise-uuid',
        'client-uuid',
        'document-uuid',
      ),
    ).toBe(
      '/enterprises/enterprise-uuid/clients/client-uuid/documents/document-uuid',
    );
  });

  it('persiste, busca y elimina documentos', async () => {
    const document = { id: 'document-uuid', name: 'contrato.pdf' } as ClientDocument;
    repository.save.mockResolvedValue(document);
    repository.findOne.mockResolvedValue(document);
    repository.delete.mockResolvedValue({ affected: 1 });

    await expect(service.create({ name: document.name })).resolves.toEqual(document);
    await expect(service.findById(document.id, ['client'])).resolves.toEqual(document);
    await expect(service.deleteById(document.id)).resolves.toEqual({ affected: 1 });
    expect(repository.findOne).toHaveBeenCalledWith({ where: { id: document.id }, relations: ['client'] });
  });

  it('construye la consulta paginada con valores por defecto y relaciones', async () => {
    const paginated = { items: [], total: 0, currentPage: 1, totalPages: 0 };
    (QueryBuilderService.getPaginatedResults as jest.Mock).mockResolvedValue(paginated);

    await expect(service.findAll()).resolves.toEqual(paginated);
    await service.findAll(2, 25, 'name', 'ASC', { name_ilike: 'contrato' }, ['client']);

    expect(QueryBuilderService.getPaginatedResults).toHaveBeenLastCalledWith(
      repository,
      'clientDocument',
      expect.objectContaining({
        page: 2,
        pageSize: 25,
        sort: 'name',
        order: 'ASC',
        filter: { name_ilike: 'contrato' },
        relations: [{ property: 'client', alias: 'client', isLeftJoinAndSelect: true }],
      }),
    );
  });

  it('actualiza un documento existente y rechaza uno inexistente', async () => {
    const existing = { id: 'document-uuid', name: 'original.pdf' } as ClientDocument;
    repository.findOne.mockResolvedValueOnce(null);
    await expect(service.updateById(existing.id, { name: 'nuevo.pdf' })).rejects.toMatchObject({ status: 404 });

    repository.findOne.mockResolvedValueOnce(existing).mockResolvedValueOnce({ ...existing, name: 'nuevo.pdf' });
    repository.save.mockResolvedValue({ ...existing, name: 'nuevo.pdf' });
    await expect(service.updateById(existing.id, { name: 'nuevo.pdf' })).resolves.toEqual({ ...existing, name: 'nuevo.pdf' });
  });
});
