import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceSeriesRepository } from './invoice-series-repository.service';

describe('InvoiceSeriesService', () => {
  let service: InvoiceSeriesRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InvoiceSeriesRepository],
    }).compile();

    service = module.get<InvoiceSeriesRepository>(InvoiceSeriesRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
