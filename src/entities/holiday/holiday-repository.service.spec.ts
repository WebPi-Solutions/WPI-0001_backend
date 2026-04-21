import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HolidayRepository } from './holiday-repository.service';
import { Holiday } from './holiday.entity';

describe('HolidayRepository', () => {
  let service: HolidayRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HolidayRepository,
        {
          provide: getRepositoryToken(Holiday),
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<HolidayRepository>(HolidayRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
