import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingSubscriptionPresentation } from './types/billing-subscription-presentation';

describe('BillingController', () => {
  let controller: BillingController;
  let billingService: {
    getActiveSubscriptionsPresentationForAuthenticatedUser: jest.Mock;
    getActiveProductsByMetadataForAuthenticatedUser: jest.Mock;
    getActiveSigningsProductsWithTieredRecurringPricesForAuthenticatedUser: jest.Mock;
    getActiveManagementProductsWithPerUnitRecurringPricesForAuthenticatedUser: jest.Mock;
    createSubscriptionCheckoutSessionForAuthenticatedUser: jest.Mock;
    updateSubscriptionPriceForAuthenticatedUser: jest.Mock;
    cancelActiveSubscriptionAtPeriodEndForAuthenticatedUser: jest.Mock;
    revokeCancelActiveSubscriptionAtPeriodEndForAuthenticatedUser: jest.Mock;
  };

  /**
   * Construye una petición HTTP autenticada o anónima.
   * @param userId - Identificador del usuario; si se omite, la petición no está autenticada
   * @returns Petición simulada
   */
  const buildRequest = (userId?: string): Request =>
    ({ user: userId ? { id: userId } : undefined } as Request);

  /**
   * Presentación mínima para ejercitar el mapper del listado de suscripciones.
   */
  const samplePresentation: BillingSubscriptionPresentation = {
    subscriptionId: 'sub_1',
    status: 'active',
    product: { name: 'Plan', metadata: [{ key: 'type', value: 'signings' }] },
    usage: { used: 2, max: 10 },
    billingInterval: { type: 'month', count: 1 },
    currentPeriod: { start: '2026-01-01T00:00:00.000Z', end: '2026-02-01T00:00:00.000Z' },
    renewsAtIso: '2026-02-01T00:00:00.000Z',
    cancelAtPeriodEnd: false,
    scheduledLicensedQuotaReduction: {
      nextMaxUsers: 5,
      effectiveAtIso: '2026-03-01T00:00:00.000Z',
    },
  };

  beforeEach(async () => {
    billingService = {
      getActiveSubscriptionsPresentationForAuthenticatedUser: jest.fn().mockResolvedValue([]),
      getActiveProductsByMetadataForAuthenticatedUser: jest.fn().mockResolvedValue([]),
      getActiveSigningsProductsWithTieredRecurringPricesForAuthenticatedUser: jest
        .fn()
        .mockResolvedValue([]),
      getActiveManagementProductsWithPerUnitRecurringPricesForAuthenticatedUser: jest
        .fn()
        .mockResolvedValue([]),
      createSubscriptionCheckoutSessionForAuthenticatedUser: jest
        .fn()
        .mockResolvedValue({ url: 'https://checkout.stripe.test/session' }),
      updateSubscriptionPriceForAuthenticatedUser: jest.fn().mockResolvedValue(undefined),
      cancelActiveSubscriptionAtPeriodEndForAuthenticatedUser: jest.fn().mockResolvedValue(undefined),
      revokeCancelActiveSubscriptionAtPeriodEndForAuthenticatedUser: jest
        .fn()
        .mockResolvedValue(undefined),
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

    it('rechaza listar productos por metadato sin usuario autenticado', async () => {
      await expect(
        controller.getProductsByMetadata(buildRequest(), 'type', 'signings'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(billingService.getActiveProductsByMetadataForAuthenticatedUser).not.toHaveBeenCalled();
    });

    it('rechaza el catálogo de fichajes sin usuario autenticado', async () => {
      await expect(controller.getProductsSigningsWithPrices(buildRequest())).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rechaza el catálogo de gestión sin usuario autenticado', async () => {
      await expect(
        controller.getProductsManagementWithPrices(buildRequest()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
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

    it('rechaza modificar el precio sin usuario autenticado', async () => {
      await expect(
        controller.updateSubscriptionPrice(buildRequest(), {
          enterpriseId: 'enterprise-uuid',
          subscriptionId: 'sub_1',
          newPriceId: 'price_2',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rechaza cancelar al fin de periodo sin usuario autenticado', async () => {
      await expect(
        controller.cancelSubscriptionAtPeriodEnd(buildRequest(), { subscriptionId: 'sub_1' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rechaza revocar la cancelación sin usuario autenticado', async () => {
      await expect(
        controller.revokeCancelSubscriptionAtPeriodEnd(buildRequest(), {
          subscriptionId: 'sub_1',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('getActiveSubscriptions', () => {
    it('delega al servicio con el usuario autenticado y el filtro de empresa', async () => {
      await controller.getActiveSubscriptions(buildRequest('user-uuid'), 'enterprise-uuid');

      expect(
        billingService.getActiveSubscriptionsPresentationForAuthenticatedUser,
      ).toHaveBeenCalledWith('user-uuid', 'enterprise-uuid');
    });

    it('mapea presentaciones a DTO incluyendo la reducción de cupo programada', async () => {
      billingService.getActiveSubscriptionsPresentationForAuthenticatedUser.mockResolvedValue([
        samplePresentation,
      ]);

      const responses = await controller.getActiveSubscriptions(buildRequest('user-uuid'));

      expect(responses).toHaveLength(1);
      expect(responses[0]).toEqual(
        expect.objectContaining({
          subscriptionId: 'sub_1',
          renewsAt: samplePresentation.renewsAtIso,
          scheduledLicensedQuotaReduction: {
            nextMaxUsers: 5,
            effectiveAtIso: '2026-03-01T00:00:00.000Z',
          },
        }),
      );
    });

    it('mapea presentaciones sin reducción de cupo a null', async () => {
      billingService.getActiveSubscriptionsPresentationForAuthenticatedUser.mockResolvedValue([
        { ...samplePresentation, scheduledLicensedQuotaReduction: null },
      ]);

      const responses = await controller.getActiveSubscriptions(buildRequest('user-uuid'));
      expect(responses[0].scheduledLicensedQuotaReduction).toBeNull();
    });

    it('propaga HttpException del servicio sin envolverla', async () => {
      billingService.getActiveSubscriptionsPresentationForAuthenticatedUser.mockRejectedValue(
        new HttpException('sin acceso', HttpStatus.FORBIDDEN),
      );

      await expect(controller.getActiveSubscriptions(buildRequest('user-uuid'))).rejects.toBeInstanceOf(
        HttpException,
      );
    });

    it('propaga errores genéricos del servicio (el filtro global decide el 500)', async () => {
      billingService.getActiveSubscriptionsPresentationForAuthenticatedUser.mockRejectedValue(
        new Error('fallo interno'),
      );

      await expect(controller.getActiveSubscriptions(buildRequest('user-uuid'))).rejects.toThrow(
        'fallo interno',
      );
    });
  });

  describe('getProductsByMetadata', () => {
    it('delega al servicio con clave y valor de metadato', async () => {
      billingService.getActiveProductsByMetadataForAuthenticatedUser.mockResolvedValue([
        { productId: 'prod_1', name: 'Plan', metadata: [], defaultPriceId: 'price_1' },
      ]);

      await expect(
        controller.getProductsByMetadata(buildRequest('user-uuid'), 'type', 'signings'),
      ).resolves.toEqual([
        expect.objectContaining({ productId: 'prod_1', defaultPriceId: 'price_1' }),
      ]);
      expect(billingService.getActiveProductsByMetadataForAuthenticatedUser).toHaveBeenCalledWith({
        authenticatedUserId: 'user-uuid',
        metadataKey: 'type',
        metadataValue: 'signings',
      });
    });

    it('propaga HttpException al listar productos', async () => {
      billingService.getActiveProductsByMetadataForAuthenticatedUser.mockRejectedValue(
        new HttpException('no encontrado', HttpStatus.NOT_FOUND),
      );
      await expect(
        controller.getProductsByMetadata(buildRequest('user-uuid'), 'type'),
      ).rejects.toBeInstanceOf(HttpException);
    });
  });

  describe('getProductsSigningsWithPrices', () => {
    it('delega el catálogo de fichajes al servicio', async () => {
      billingService.getActiveSigningsProductsWithTieredRecurringPricesForAuthenticatedUser.mockResolvedValue(
        [{ productId: 'prod_s', name: 'Fichajes', metadata: [], prices: [] }],
      );

      await expect(
        controller.getProductsSigningsWithPrices(buildRequest('user-uuid')),
      ).resolves.toEqual([expect.objectContaining({ productId: 'prod_s' })]);
      expect(
        billingService.getActiveSigningsProductsWithTieredRecurringPricesForAuthenticatedUser,
      ).toHaveBeenCalledWith('user-uuid');
    });

    it('propaga errores genéricos del catálogo de fichajes', async () => {
      billingService.getActiveSigningsProductsWithTieredRecurringPricesForAuthenticatedUser.mockRejectedValue(
        new Error('stripe caído'),
      );
      await expect(controller.getProductsSigningsWithPrices(buildRequest('user-uuid'))).rejects.toThrow(
        'stripe caído',
      );
    });
  });

  describe('getProductsManagementWithPrices', () => {
    it('delega el catálogo de gestión al servicio', async () => {
      billingService.getActiveManagementProductsWithPerUnitRecurringPricesForAuthenticatedUser.mockResolvedValue(
        [{ productId: 'prod_m', name: 'Gestión', metadata: [], prices: [] }],
      );

      await expect(
        controller.getProductsManagementWithPrices(buildRequest('user-uuid')),
      ).resolves.toEqual([expect.objectContaining({ productId: 'prod_m' })]);
    });

    it('propaga HttpException del catálogo de gestión', async () => {
      billingService.getActiveManagementProductsWithPerUnitRecurringPricesForAuthenticatedUser.mockRejectedValue(
        new HttpException('forbidden', HttpStatus.FORBIDDEN),
      );
      await expect(
        controller.getProductsManagementWithPrices(buildRequest('user-uuid')),
      ).rejects.toBeInstanceOf(HttpException);
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

    it('propaga HttpException al crear Checkout', async () => {
      billingService.createSubscriptionCheckoutSessionForAuthenticatedUser.mockRejectedValue(
        new HttpException('sin stripe', HttpStatus.NOT_FOUND),
      );
      await expect(
        controller.createSubscriptionCheckoutSession(buildRequest('user-uuid'), {
          enterpriseId: 'enterprise-uuid',
          priceId: 'price_1',
          successUrl: 'https://app.test/ok',
          cancelUrl: 'https://app.test/ko',
        }),
      ).rejects.toBeInstanceOf(HttpException);
    });
  });

  describe('updateSubscriptionPrice', () => {
    it('delega la modificación de precio y cantidad', async () => {
      await controller.updateSubscriptionPrice(buildRequest('user-uuid'), {
        enterpriseId: 'enterprise-uuid',
        subscriptionId: 'sub_1',
        newPriceId: 'price_2',
        quantity: 12,
      });

      expect(billingService.updateSubscriptionPriceForAuthenticatedUser).toHaveBeenCalledWith({
        authenticatedUserId: 'user-uuid',
        enterpriseId: 'enterprise-uuid',
        subscriptionId: 'sub_1',
        newPriceId: 'price_2',
        quantity: 12,
      });
    });

    it('propaga errores genéricos al modificar el precio', async () => {
      billingService.updateSubscriptionPriceForAuthenticatedUser.mockRejectedValue(
        new Error('update fail'),
      );
      await expect(
        controller.updateSubscriptionPrice(buildRequest('user-uuid'), {
          enterpriseId: 'enterprise-uuid',
          subscriptionId: 'sub_1',
          newPriceId: 'price_2',
        }),
      ).rejects.toThrow('update fail');
    });
  });

  describe('cancelSubscriptionAtPeriodEnd', () => {
    it('delega la cancelación al fin de periodo', async () => {
      await controller.cancelSubscriptionAtPeriodEnd(buildRequest('user-uuid'), {
        subscriptionId: 'sub_1',
        enterpriseId: 'enterprise-uuid',
      });

      expect(
        billingService.cancelActiveSubscriptionAtPeriodEndForAuthenticatedUser,
      ).toHaveBeenCalledWith('user-uuid', 'sub_1', 'enterprise-uuid');
    });

    it('propaga HttpException al cancelar', async () => {
      billingService.cancelActiveSubscriptionAtPeriodEndForAuthenticatedUser.mockRejectedValue(
        new HttpException('no encontrada', HttpStatus.NOT_FOUND),
      );
      await expect(
        controller.cancelSubscriptionAtPeriodEnd(buildRequest('user-uuid'), {
          subscriptionId: 'sub_1',
        }),
      ).rejects.toBeInstanceOf(HttpException);
    });
  });

  describe('revokeCancelSubscriptionAtPeriodEnd', () => {
    it('delega la revocación de cancelación', async () => {
      await controller.revokeCancelSubscriptionAtPeriodEnd(buildRequest('user-uuid'), {
        subscriptionId: 'sub_1',
        enterpriseId: 'enterprise-uuid',
      });

      expect(
        billingService.revokeCancelActiveSubscriptionAtPeriodEndForAuthenticatedUser,
      ).toHaveBeenCalledWith('user-uuid', 'sub_1', 'enterprise-uuid');
    });

    it('propaga errores genéricos al revocar', async () => {
      billingService.revokeCancelActiveSubscriptionAtPeriodEndForAuthenticatedUser.mockRejectedValue(
        new Error('revoke fail'),
      );
      await expect(
        controller.revokeCancelSubscriptionAtPeriodEnd(buildRequest('user-uuid'), {
          subscriptionId: 'sub_1',
        }),
      ).rejects.toThrow('revoke fail');
    });
  });
});
