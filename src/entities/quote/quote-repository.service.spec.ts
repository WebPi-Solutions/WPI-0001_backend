import { Test, TestingModule } from '@nestjs/testing';
import { QuoteRepository } from './quote-repository.service';

describe('QuoteRepository', () => {
  let service: QuoteRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QuoteRepository],
    }).compile();

    service = module.get<QuoteRepository>(QuoteRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
