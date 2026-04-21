import { Test, TestingModule } from '@nestjs/testing';
import { SpentService } from './spent.service';

describe('SpentService', () => {
  let service: SpentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SpentService],
    }).compile();

    service = module.get<SpentService>(SpentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
