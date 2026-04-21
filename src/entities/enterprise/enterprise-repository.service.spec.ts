import { Test, TestingModule } from '@nestjs/testing';
import { EnterpriseRepository } from './enterprise-repository.service';

describe('EnterpriseService', () => {
  let service: EnterpriseRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EnterpriseRepository],
    }).compile();

    service = module.get<EnterpriseRepository>(EnterpriseRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
