import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceRepository } from './invoice-repository.service';

describe('InvoiceService', () => {
  let service: InvoiceRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InvoiceRepository],
    }).compile();

    service = module.get<InvoiceRepository>(InvoiceRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
