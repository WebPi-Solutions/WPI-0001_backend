import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRepository } from 'src/entities/user/user-repository.service';
import { StripeService } from 'src/services/stripe/stripe.service';
import { BillingService } from './billing.service';

describe('BillingService', () => {
  let service: BillingService;
  let userRepository: {
    findById: jest.Mock;
  };
  let stripeService: {
    isStripeConfigured: jest.Mock;
    getAllProducts: jest.Mock;
    getProductWithDefaultPriceExpanded: jest.Mock;
    createSubscriptionCheckoutSessionUrl: jest.Mock;
    getSubscriptionsByAccountId: jest.Mock;
    getProductNamesByIds: jest.Mock;
    getProductNamesAndMetadataByIds: jest.Mock;
    updateSubscriptionPrimaryItemPrice: jest.Mock;
    cancelSubscriptionAtPeriodEnd: jest.Mock;
  };

  const authenticatedUserId = 'user-uuid';
  const enterpriseId = 'enterprise-uuid';

  /**
   * Construye un usuario con vínculo a la empresa indicada.
   * @param overrides - Campos del vínculo o de la empresa
   * @returns Usuario simulado con `userEnterprises`
   */
  const buildUserWithEnterpriseLink = (
    overrides: { enterpriseId?: string; stripeId?: string | null; includeEnterprise?: boolean } = {},
  ) => {
    const linkedEnterpriseId = overrides.enterpriseId ?? enterpriseId;
    const includeEnterprise = overrides.includeEnterprise !== false;

    return {
      id: authenticatedUserId,
      userEnterprises: [
        {
          enterpriseId: linkedEnterpriseId,
          enterprise: includeEnterprise
            ? {
                id: linkedEnterpriseId,
                stripeId: overrides.stripeId === undefined ? 'cus_test' : overrides.stripeId,
              }
            : undefined,
        },
      ],
    };
  };

  beforeEach(async () => {
    userRepository = {
      findById: jest.fn().mockResolvedValue(buildUserWithEnterpriseLink()),
    };
    stripeService = {
      isStripeConfigured: jest.fn().mockReturnValue(false),
      getAllProducts: jest.fn().mockResolvedValue([]),
      getProductWithDefaultPriceExpanded: jest.fn(),
      createSubscriptionCheckoutSessionUrl: jest.fn(),
      getSubscriptionsByAccountId: jest.fn(),
      getProductNamesByIds: jest.fn(),
      getProductNamesAndMetadataByIds: jest.fn(),
      updateSubscriptionPrimaryItemPrice: jest.fn(),
      cancelSubscriptionAtPeriodEnd: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: UserRepository, useValue: userRepository },
        { provide: StripeService, useValue: stripeService },
      ],
    }).compile();

    service = testingModule.get(BillingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getActiveProductsByMetadataForAuthenticatedUser', () => {
    it('devuelve lista vacía si no hay clave de metadato', async () => {
      await expect(
        service.getActiveProductsByMetadataForAuthenticatedUser({
          authenticatedUserId,
          metadataKey: '   ',
        }),
      ).resolves.toEqual([]);
      expect(stripeService.getAllProducts).not.toHaveBeenCalled();
    });

    it('devuelve lista vacía si Stripe no está configurado', async () => {
      await expect(
        service.getActiveProductsByMetadataForAuthenticatedUser({
          authenticatedUserId,
          metadataKey: 'type',
          metadataValue: 'signings',
        }),
      ).resolves.toEqual([]);
      expect(stripeService.getAllProducts).not.toHaveBeenCalled();
    });

    it('filtra por metadato sin distinguir mayúsculas, omite productos sin precio y ordena por nombre', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      stripeService.getAllProducts.mockResolvedValue([
        { id: 'prod_without_price', metadata: { type: 'signings' } },
        { id: 'prod_zeta', metadata: { TYPE: 'SIGNINGS' } },
        { id: 'prod_alpha', metadata: { type: 'signings' } },
        { id: 'prod_other', metadata: { type: 'management' } },
      ]);
      stripeService.getProductWithDefaultPriceExpanded.mockImplementation((productId: string) => {
        if (productId === 'prod_without_price') {
          return Promise.resolve({ id: productId, name: 'Sin precio', metadata: {}, default_price: null });
        }
        if (productId === 'prod_zeta') {
          return Promise.resolve({
            id: productId,
            name: 'Zeta Signings',
            metadata: { type: 'signings' },
            default_price: 'price_zeta',
          });
        }
        return Promise.resolve({
          id: productId,
          name: 'Alpha Signings',
          metadata: { type: 'signings' },
          default_price: { id: 'price_alpha' },
        });
      });

      const products = await service.getActiveProductsByMetadataForAuthenticatedUser({
        authenticatedUserId,
        metadataKey: 'type',
        metadataValue: 'Signings',
      });

      expect(products.map((product) => product.productId)).toEqual(['prod_alpha', 'prod_zeta']);
      expect(products[0]).toEqual(
        expect.objectContaining({
          productId: 'prod_alpha',
          name: 'Alpha Signings',
          defaultPriceId: 'price_alpha',
        }),
      );
    });
  });

  describe('getActiveSubscriptionsPresentationForAuthenticatedUser', () => {
    it('devuelve lista vacía si Stripe no está configurado', async () => {
      await expect(
        service.getActiveSubscriptionsPresentationForAuthenticatedUser(authenticatedUserId),
      ).resolves.toEqual([]);
      expect(userRepository.findById).not.toHaveBeenCalled();
    });

    it('lanza 404 si el usuario autenticado no existe', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      userRepository.findById.mockResolvedValue(null);

      await expect(
        service.getActiveSubscriptionsPresentationForAuthenticatedUser(authenticatedUserId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('prohíbe filtrar por una empresa a la que el usuario no está vinculado', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);

      await expect(
        service.getActiveSubscriptionsPresentationForAuthenticatedUser(
          authenticatedUserId,
          'otra-empresa',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('createSubscriptionCheckoutSessionForAuthenticatedUser', () => {
    const checkoutParams = {
      authenticatedUserId,
      enterpriseId,
      priceId: 'price_1',
      successUrl: 'https://app.test/ok',
      cancelUrl: 'https://app.test/ko',
    };

    it('lanza 404 si Stripe no está configurado', async () => {
      await expect(
        service.createSubscriptionCheckoutSessionForAuthenticatedUser(checkoutParams),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('prohíbe crear Checkout para una empresa sin vínculo', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);

      await expect(
        service.createSubscriptionCheckoutSessionForAuthenticatedUser({
          ...checkoutParams,
          enterpriseId: 'otra-empresa',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(stripeService.createSubscriptionCheckoutSessionUrl).not.toHaveBeenCalled();
    });

    it('lanza 404 si la empresa no tiene cliente Stripe', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      userRepository.findById.mockResolvedValue(
        buildUserWithEnterpriseLink({ stripeId: '   ' }),
      );

      await expect(
        service.createSubscriptionCheckoutSessionForAuthenticatedUser(checkoutParams),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('crea la sesión de Checkout cuando el usuario tiene acceso y hay cliente Stripe', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      stripeService.createSubscriptionCheckoutSessionUrl.mockResolvedValue(
        'https://checkout.stripe.test/session',
      );

      await expect(
        service.createSubscriptionCheckoutSessionForAuthenticatedUser({
          ...checkoutParams,
          quantity: 2,
        }),
      ).resolves.toEqual({ url: 'https://checkout.stripe.test/session' });
      expect(stripeService.createSubscriptionCheckoutSessionUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          stripeCustomerId: 'cus_test',
          priceId: 'price_1',
          quantity: 2,
          metadata: expect.objectContaining({
            enterpriseId,
            authenticatedUserId,
            priceId: 'price_1',
          }),
        }),
      );
    });
  });

  describe('updateSubscriptionPriceForAuthenticatedUser', () => {
    const updateParams = {
      authenticatedUserId,
      enterpriseId,
      subscriptionId: 'sub_1',
      newPriceId: 'price_2',
    };

    it('prohíbe modificar si el usuario no está vinculado a la empresa', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);

      await expect(
        service.updateSubscriptionPriceForAuthenticatedUser({
          ...updateParams,
          enterpriseId: 'otra-empresa',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(stripeService.updateSubscriptionPrimaryItemPrice).not.toHaveBeenCalled();
    });

    it('lanza 404 si la suscripción no pertenece al cliente Stripe de la empresa', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      stripeService.getSubscriptionsByAccountId.mockResolvedValue([{ id: 'sub_otra' }]);

      await expect(
        service.updateSubscriptionPriceForAuthenticatedUser(updateParams),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(stripeService.updateSubscriptionPrimaryItemPrice).not.toHaveBeenCalled();
    });

    it('actualiza el precio cuando la suscripción pertenece al cliente de la empresa', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      stripeService.getSubscriptionsByAccountId.mockResolvedValue([{ id: 'sub_1' }]);

      await expect(
        service.updateSubscriptionPriceForAuthenticatedUser({
          ...updateParams,
          quantity: 3,
        }),
      ).resolves.toBeUndefined();
      expect(stripeService.updateSubscriptionPrimaryItemPrice).toHaveBeenCalledWith({
        subscriptionId: 'sub_1',
        newPriceId: 'price_2',
        quantity: 3,
      });
    });
  });

  describe('cancelActiveSubscriptionAtPeriodEndForAuthenticatedUser', () => {
    it('prohíbe cancelar si el usuario no está vinculado a la empresa', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);

      await expect(
        service.cancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
          authenticatedUserId,
          'sub_1',
          'otra-empresa',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(stripeService.cancelSubscriptionAtPeriodEnd).not.toHaveBeenCalled();
    });

    it('lanza 404 si la suscripción no está en clientes Stripe autorizados', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      stripeService.getSubscriptionsByAccountId.mockResolvedValue([{ id: 'sub_otra' }]);

      await expect(
        service.cancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
          authenticatedUserId,
          'sub_1',
          enterpriseId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(stripeService.cancelSubscriptionAtPeriodEnd).not.toHaveBeenCalled();
    });
  });
});
