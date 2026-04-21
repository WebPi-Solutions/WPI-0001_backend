import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { VacationRepository } from './vacation-repository.service';
import { Vacation } from './vacation.entity';

describe('VacationRepository', () => {
  let service: VacationRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VacationRepository,
        {
          provide: getRepositoryToken(Vacation),
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<VacationRepository>(VacationRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
