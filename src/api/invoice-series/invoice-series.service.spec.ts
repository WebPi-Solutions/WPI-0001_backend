import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceSeriesService } from './invoice-series.service';

describe('InvoiceSeriesService', () => {
  let service: InvoiceSeriesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InvoiceSeriesService],
    }).compile();

    service = module.get<InvoiceSeriesService>(InvoiceSeriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
