jest.mock('src/common/helpers/query-builder/query-builder.service', () => ({
  QueryBuilderService: {
    getPaginatedResults: jest.fn(),
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ClientDocument } from './client-document.entity';
import { ClientDocumentRepository } from './client-document-repository.service';

describe('ClientDocumentRepository', () => {
  let service: ClientDocumentRepository;
  const originalPath = process.env.DROPBOX_CLIENT_FILE_PATH;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientDocumentRepository,
        {
          provide: getRepositoryToken(ClientDocument),
          useValue: { save: jest.fn(), findOne: jest.fn(), delete: jest.fn() },
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
});
