import { Test, TestingModule } from '@nestjs/testing';
import { UserRepository } from 'src/entities/user/user-repository.service';
import { StripeService } from 'src/services/stripe/stripe.service';
import { BillingService } from './billing.service';

describe('BillingService', () => {
  let service: BillingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        {
          provide: UserRepository,
          useValue: {
            findById: jest.fn().mockResolvedValue({
              id: 'user-1',
              userEnterprises: [],
            }),
          },
        },
        {
          provide: StripeService,
          useValue: {
            isStripeConfigured: jest.fn().mockReturnValue(false),
            getSubscriptionsByAccountId: jest.fn(),
            getProductNamesByIds: jest.fn(),
            getProductNamesAndMetadataByIds: jest.fn(),
            getAllProducts: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
