import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RecurrentEarningRepository } from './recurrent-earning-repository.service';
import { RecurrentEarning } from './recurrent-earning.entity';

describe('RecurrentEarningRepository', () => {
  let repository: RecurrentEarningRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecurrentEarningRepository,
        {
          provide: getRepositoryToken(RecurrentEarning),
          useValue: {
            save: jest.fn(),
            findOne: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    repository = module.get<RecurrentEarningRepository>(RecurrentEarningRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });
});
