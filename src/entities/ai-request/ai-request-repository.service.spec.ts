import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiRequestRepository } from './ai-request-repository.service';
import { AiRequest } from './ai-request.entity';

describe('AiRequestRepository', () => {
  let repository: AiRequestRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiRequestRepository,
        {
          provide: getRepositoryToken(AiRequest),
          useValue: {
            save: jest.fn(),
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    repository = module.get<AiRequestRepository>(AiRequestRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });
});
