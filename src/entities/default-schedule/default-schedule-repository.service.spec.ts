import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DefaultScheduleRepository } from './default-schedule-repository.service';
import { DefaultSchedule } from './default-schedule.entity';

describe('DefaultScheduleRepository', () => {
  let service: DefaultScheduleRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DefaultScheduleRepository,
        {
          provide: getRepositoryToken(DefaultSchedule),
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<DefaultScheduleRepository>(DefaultScheduleRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
