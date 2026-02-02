import { Test, TestingModule } from '@nestjs/testing';
import { SpentRepository } from './spent-repository.service';

describe('SpentService', () => {
  let service: SpentRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SpentRepository],
    }).compile();

    service = module.get<SpentRepository>(SpentRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
