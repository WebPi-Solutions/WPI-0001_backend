import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClientRepository } from 'src/entities/client/client-repository.service';
import { InvoiceSeriesRepository } from 'src/entities/invoice-series/invoice-series-repository.service';
import { RecurrentEarningRepository } from 'src/entities/recurrent-earning/recurrent-earning-repository.service';
import { RecurrentEarning, RecurrentEarningType } from 'src/entities/recurrent-earning/recurrent-earning.entity';
import { RecurrentEarningService } from './recurrent-earning.service';

describe('RecurrentEarningService', () => {
  let service: RecurrentEarningService;
  let recurrentEarningRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };
  let clientRepository: { findById: jest.Mock };
  let invoiceSeriesRepository: { findById: jest.Mock };

  beforeEach(async () => {
    recurrentEarningRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };
    clientRepository = { findById: jest.fn() };
    invoiceSeriesRepository = { findById: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecurrentEarningService,
        {
          provide: RecurrentEarningRepository,
          useValue: recurrentEarningRepository,
        },
        {
          provide: ClientRepository,
          useValue: clientRepository,
        },
        {
          provide: InvoiceSeriesRepository,
          useValue: invoiceSeriesRepository,
        },
      ],
    }).compile();

    service = module.get<RecurrentEarningService>(RecurrentEarningService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('asigna tipo mensual por defecto al crear si no se informa', async () => {
    clientRepository.findById.mockResolvedValue({ id: 'client-1', enterpriseId: 'enterprise-1' });
    invoiceSeriesRepository.findById.mockResolvedValue({ id: 'series-1', enterpriseId: 'enterprise-1' });
    recurrentEarningRepository.create.mockImplementation((payload: RecurrentEarning) =>
      Promise.resolve({ ...payload, id: 'recurrent-1' }),
    );

    await service.create({
      name: 'Cuota',
      enterpriseId: 'enterprise-1',
      clientId: 'client-1',
      invoiceSerieId: 'series-1',
    } as RecurrentEarning);

    expect(recurrentEarningRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: RecurrentEarningType.MONTHLY }),
    );
  });

  it('rechaza un tipo distinto de monthly o yearly', async () => {
    await expect(
      service.create({
        name: 'Cuota',
        enterpriseId: 'enterprise-1',
        clientId: 'client-1',
        invoiceSerieId: 'series-1',
        type: 'weekly' as RecurrentEarningType,
      } as RecurrentEarning),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
