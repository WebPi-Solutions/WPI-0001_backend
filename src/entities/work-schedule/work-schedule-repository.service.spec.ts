import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WorkScheduleRepository } from './work-schedule-repository.service';
import { WorkSchedule } from './work-schedule.entity';

describe('WorkScheduleRepository', () => {
  let service: WorkScheduleRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkScheduleRepository,
        {
          provide: getRepositoryToken(WorkSchedule),
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<WorkScheduleRepository>(WorkScheduleRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
