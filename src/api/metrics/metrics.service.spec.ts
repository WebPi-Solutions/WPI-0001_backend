import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';
import { InvoiceRepository } from '../../entities/invoice/invoice-repository.service';
import { QuoteRepository } from '../../entities/quote/quote-repository.service';
import { SpentRepository } from '../../entities/spent/spent-repository.service';
import { UserRepository } from '../../entities/user/user-repository.service';
import { ClientRepository } from '../../entities/client/client-repository.service';
import { SupplierRepository } from '../../entities/supplier/supplier-repository.service';
import { InvoiceSeriesRepository } from '../../entities/invoice-series/invoice-series-repository.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        { provide: InvoiceRepository, useValue: {} },
        { provide: QuoteRepository, useValue: {} },
        { provide: SpentRepository, useValue: {} },
        { provide: UserRepository, useValue: {} },
        { provide: ClientRepository, useValue: {} },
        { provide: SupplierRepository, useValue: {} },
        { provide: InvoiceSeriesRepository, useValue: {} },
      ],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
