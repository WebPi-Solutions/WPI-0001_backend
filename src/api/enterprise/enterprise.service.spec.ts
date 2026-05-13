import { Test, TestingModule } from '@nestjs/testing';
import { EnterpriseRepository } from 'src/entities/enterprise/enterprise-repository.service';
import { DropboxService } from 'src/services/dropbox/dropbox.service';
import { EnterpriseService } from './enterprise.service';

describe('EnterpriseService', () => {
  let service: EnterpriseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnterpriseService,
        { provide: EnterpriseRepository, useValue: {} },
        { provide: DropboxService, useValue: {} },
      ],
    }).compile();

    service = module.get<EnterpriseService>(EnterpriseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
