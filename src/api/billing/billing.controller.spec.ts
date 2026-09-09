import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

describe('BillingController', () => {
  let controller: BillingController;
  let billingService: {
    getActiveSubscriptionsPresentationForAuthenticatedUser: jest.Mock;
    getActiveProductsByMetadataForAuthenticatedUser: jest.Mock;
    createSubscriptionCheckoutSessionForAuthenticatedUser: jest.Mock;
  };

  /**
   * Construye una petición HTTP autenticada o anónima.
   * @param userId - Identificador del usuario; si se omite, la petición no está autenticada
   * @returns Petición simulada
   */
  const buildRequest = (userId?: string): Request =>
    ({ user: userId ? { id: userId } : undefined } as Request);

  beforeEach(async () => {
    billingService = {
      getActiveSubscriptionsPresentationForAuthenticatedUser: jest.fn().mockResolvedValue([]),
      getActiveProductsByMetadataForAuthenticatedUser: jest.fn().mockResolvedValue([]),
      createSubscriptionCheckoutSessionForAuthenticatedUser: jest
        .fn()
        .mockResolvedValue({ url: 'https://checkout.stripe.test/session' }),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [{ provide: BillingService, useValue: billingService }],
    }).compile();

    controller = testingModule.get(BillingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('autenticación', () => {
    it('rechaza consultar suscripciones sin usuario autenticado', async () => {
      await expect(controller.getActiveSubscriptions(buildRequest())).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(
        billingService.getActiveSubscriptionsPresentationForAuthenticatedUser,
      ).not.toHaveBeenCalled();
    });

    it('rechaza crear Checkout sin usuario autenticado', async () => {
      await expect(
        controller.createSubscriptionCheckoutSession(buildRequest(), {
          enterpriseId: 'enterprise-uuid',
          priceId: 'price_1',
          successUrl: 'https://app.test/ok',
          cancelUrl: 'https://app.test/ko',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(
        billingService.createSubscriptionCheckoutSessionForAuthenticatedUser,
      ).not.toHaveBeenCalled();
    });
  });

  describe('getActiveSubscriptions', () => {
    it('delega al servicio con el usuario autenticado y el filtro de empresa', async () => {
      await controller.getActiveSubscriptions(buildRequest('user-uuid'), 'enterprise-uuid');

      expect(
        billingService.getActiveSubscriptionsPresentationForAuthenticatedUser,
      ).toHaveBeenCalledWith('user-uuid', 'enterprise-uuid');
    });
  });

  describe('createSubscriptionCheckoutSession', () => {
    it('delega al servicio con el usuario autenticado y el cuerpo recibido', async () => {
      const checkoutBody = {
        enterpriseId: 'enterprise-uuid',
        priceId: 'price_1',
        successUrl: 'https://app.test/ok',
        cancelUrl: 'https://app.test/ko',
        quantity: 3,
      };

      await expect(
        controller.createSubscriptionCheckoutSession(buildRequest('user-uuid'), checkoutBody),
      ).resolves.toEqual({ url: 'https://checkout.stripe.test/session' });
      expect(
        billingService.createSubscriptionCheckoutSessionForAuthenticatedUser,
      ).toHaveBeenCalledWith({
        authenticatedUserId: 'user-uuid',
        ...checkoutBody,
      });
    });
  });
});
