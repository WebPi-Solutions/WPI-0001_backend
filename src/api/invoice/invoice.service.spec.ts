import { Test, TestingModule } from '@nestjs/testing';
import { ClientRepository } from 'src/entities/client/client-repository.service';
import { InvoiceSeriesRepository } from 'src/entities/invoice-series/invoice-series-repository.service';
import { InvoiceRepository } from 'src/entities/invoice/invoice-repository.service';
import { RecurrentEarningRepository } from 'src/entities/recurrent-earning/recurrent-earning-repository.service';
import { InvoiceService } from './invoice.service';

describe('InvoiceService', () => {
  let service: InvoiceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        { provide: InvoiceRepository, useValue: { create: jest.fn(), findAll: jest.fn(), findById: jest.fn(), updateById: jest.fn(), deleteById: jest.fn() } },
        { provide: ClientRepository, useValue: { findById: jest.fn() } },
        { provide: InvoiceSeriesRepository, useValue: { findById: jest.fn() } },
        { provide: RecurrentEarningRepository, useValue: { findById: jest.fn() } },
      ],
    }).compile();

    service = module.get<InvoiceService>(InvoiceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
