import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import Stripe from 'stripe';
import { UserRepository } from 'src/entities/user/user-repository.service';
import { StripeService } from 'src/services/stripe/stripe.service';
import { BillingService } from './billing.service';

describe('BillingService', () => {
  let service: BillingService;
  let userRepository: {
    findById: jest.Mock;
    countActiveNonSigningsUsersForEnterprise: jest.Mock;
  };
  let stripeService: {
    isStripeConfigured: jest.Mock;
    getAllProducts: jest.Mock;
    getProductWithDefaultPriceExpanded: jest.Mock;
    createSubscriptionCheckoutSessionUrl: jest.Mock;
    getSubscriptionsByAccountId: jest.Mock;
    getProductNamesByIds: jest.Mock;
    getProductNamesAndMetadataByIds: jest.Mock;
    listActivePricesForProduct: jest.Mock;
    updateSubscriptionPrimaryItemPrice: jest.Mock;
    cancelSubscriptionAtPeriodEnd: jest.Mock;
    revokeCancelSubscriptionAtPeriodEnd: jest.Mock;
    retrieveSubscriptionSchedule: jest.Mock;
  };

  const authenticatedUserId = 'user-uuid';
  const enterpriseId = 'enterprise-uuid';

  /**
   * Construye un usuario con vínculo a la empresa indicada.
   * @param overrides - Campos del vínculo o de la empresa
   * @returns Usuario simulado con `userEnterprises`
   */
  const buildUserWithEnterpriseLink = (
    overrides: {
      enterpriseId?: string;
      stripeId?: string | null;
      includeEnterprise?: boolean;
      extraLinks?: Array<{
        enterpriseId: string;
        enterprise?: { id: string; stripeId?: string | null } | null;
      }>;
      userEnterprises?: unknown;
    } = {},
  ) => {
    const linkedEnterpriseId = overrides.enterpriseId ?? enterpriseId;
    const includeEnterprise = overrides.includeEnterprise !== false;

    if (overrides.userEnterprises !== undefined) {
      return { id: authenticatedUserId, userEnterprises: overrides.userEnterprises };
    }

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
        ...(overrides.extraLinks ?? []),
      ],
    };
  };

  /**
   * Precio recurrente de prueba para catálogos de fichajes/gestión.
   * @param overrides - Campos Stripe a combinar
   * @returns Precio simulado
   */
  const buildRecurringPrice = (overrides: Partial<Stripe.Price> = {}): Stripe.Price =>
    ({
      id: 'price_month',
      type: 'recurring',
      currency: 'EUR',
      billing_scheme: 'tiered',
      unit_amount: 1000,
      tiers_mode: 'graduated',
      recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
      tiers: [
        { up_to: 10, unit_amount: 500, flat_amount: 100 },
        { up_to: 'inf', unit_amount: null, flat_amount: undefined },
      ],
      ...overrides,
    }) as Stripe.Price;

  /**
   * Suscripción Stripe configurable para las presentaciones.
   * @param overrides - Forma del ítem, producto, calendario y periodos
   * @returns Suscripción simulada
   */
  const buildSubscription = (
    overrides: {
      id?: string;
      status?: string;
      cancelAtPeriodEnd?: boolean;
      quantity?: number;
      currentPeriodStart?: number;
      currentPeriodEnd?: number;
      schedule?: Stripe.Subscription['schedule'];
      items?: Stripe.Subscription['items'];
      price?: Stripe.SubscriptionItem['price'] | null;
      omitItems?: boolean;
    } = {},
  ): Stripe.Subscription => {
    if (overrides.omitItems) {
      return {
        id: overrides.id ?? 'sub_1',
        status: overrides.status ?? 'active',
        cancel_at_period_end: overrides.cancelAtPeriodEnd ?? false,
        current_period_start: overrides.currentPeriodStart,
        current_period_end: overrides.currentPeriodEnd,
        schedule: overrides.schedule,
      } as Stripe.Subscription;
    }

    return {
      id: overrides.id ?? 'sub_1',
      status: overrides.status ?? 'active',
      cancel_at_period_end: overrides.cancelAtPeriodEnd ?? false,
      current_period_start: overrides.currentPeriodStart ?? 1_700_000_000,
      current_period_end: overrides.currentPeriodEnd ?? 1_702_000_000,
      schedule: overrides.schedule,
      items:
        overrides.items ??
        ({
          data: [
            {
              id: 'si_1',
              quantity: overrides.quantity,
              price: overrides.price === undefined ? null : overrides.price,
            },
          ],
        } as Stripe.Subscription['items']),
    } as Stripe.Subscription;
  };

  beforeEach(async () => {
    userRepository = {
      findById: jest.fn().mockResolvedValue(buildUserWithEnterpriseLink()),
      countActiveNonSigningsUsersForEnterprise: jest.fn().mockResolvedValue(3),
    };
    stripeService = {
      isStripeConfigured: jest.fn().mockReturnValue(false),
      getAllProducts: jest.fn().mockResolvedValue([]),
      getProductWithDefaultPriceExpanded: jest.fn(),
      createSubscriptionCheckoutSessionUrl: jest.fn(),
      getSubscriptionsByAccountId: jest.fn().mockResolvedValue([]),
      getProductNamesByIds: jest.fn(),
      getProductNamesAndMetadataByIds: jest.fn().mockResolvedValue(new Map()),
      listActivePricesForProduct: jest.fn().mockResolvedValue([]),
      updateSubscriptionPrimaryItemPrice: jest.fn().mockResolvedValue(undefined),
      cancelSubscriptionAtPeriodEnd: jest.fn().mockResolvedValue({}),
      revokeCancelSubscriptionAtPeriodEnd: jest.fn().mockResolvedValue({}),
      retrieveSubscriptionSchedule: jest.fn(),
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
      await expect(
        service.getActiveProductsByMetadataForAuthenticatedUser({
          authenticatedUserId,
          metadataKey: undefined as unknown as string,
        }),
      ).resolves.toEqual([]);
      expect(stripeService.getAllProducts).not.toHaveBeenCalled();
    });

    it('resuelve el metadato por clave normalizada cuando la clave exacta no existe', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      stripeService.getAllProducts.mockResolvedValue([
        { id: 'prod_norm', metadata: { type: 'signings' } },
      ]);
      stripeService.getProductWithDefaultPriceExpanded.mockResolvedValue({
        id: 'prod_norm',
        name: 'Normalizado',
        metadata: { type: 'signings' },
        default_price: 'price_norm',
      });

      const products = await service.getActiveProductsByMetadataForAuthenticatedUser({
        authenticatedUserId,
        metadataKey: 'Type',
        metadataValue: 'signings',
      });
      expect(products).toEqual([expect.objectContaining({ productId: 'prod_norm' })]);
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
          return Promise.resolve({
            id: productId,
            name: 'Sin precio',
            metadata: {},
            default_price: null,
          });
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

    it('incluye cualquier valor si no se filtra por valor y cubre claves insensibles y huecos', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      stripeService.getAllProducts.mockResolvedValue([
        { id: 'prod_nomatch', metadata: { foo: 'bar' } },
        { id: 'prod_nometa' },
        { id: 'prod_case_mismatch', metadata: { TYPE: 'other' } },
        { id: 'prod_case_ok', metadata: { TYPE: 'signings' } },
        { id: 'prod_null_type', metadata: { type: null } },
        { id: 'prod_empty_name', metadata: { type: 'signings' } },
        { id: 'prod_empty_id', metadata: { type: 'signings' } },
        { id: 'prod_throw_error', metadata: { type: 'signings' } },
        { id: 'prod_throw_raw', metadata: { type: 'signings' } },
      ]);
      stripeService.getProductWithDefaultPriceExpanded.mockImplementation((productId: string) => {
        if (productId === 'prod_throw_error') {
          return Promise.reject(new Error('enriquecimiento fallido'));
        }
        if (productId === 'prod_throw_raw') {
          return Promise.reject('enriquecimiento-crudo');
        }
        if (productId === 'prod_empty_id') {
          return Promise.resolve({
            id: '',
            name: 'Huérfano',
            default_price: 'price_orphan',
          });
        }
        if (productId === 'prod_empty_name') {
          return Promise.resolve({
            id: productId,
            name: '   ',
            metadata: { type: 'signings' },
            default_price: 'price_empty_name',
          });
        }
        return Promise.resolve({
          id: productId,
          name: productId,
          metadata: { type: 'x' },
          default_price: `price_${productId}`,
        });
      });

      const withoutValueFilter = await service.getActiveProductsByMetadataForAuthenticatedUser({
        authenticatedUserId,
        metadataKey: 'type',
      });
      expect(withoutValueFilter.map((product) => product.productId).sort()).toEqual([
        'prod_case_mismatch',
        'prod_case_ok',
        'prod_empty_name',
        'prod_null_type',
      ]);
      expect(withoutValueFilter.find((product) => product.productId === 'prod_empty_name')?.name).toBe(
        'Producto sin nombre',
      );

      const withValueFilter = await service.getActiveProductsByMetadataForAuthenticatedUser({
        authenticatedUserId,
        metadataKey: 'type',
        metadataValue: '  signings  ',
      });
      expect(withValueFilter.map((product) => product.productId).sort()).toEqual([
        'prod_case_ok',
        'prod_empty_name',
      ]);
    });
  });

  describe('resolveActiveProductsForBillingModuleType', () => {
    it('devuelve vacío si el tipo de módulo está en blanco', async () => {
      const products = await (
        service as unknown as {
          resolveActiveProductsForBillingModuleType: (params: {
            authenticatedUserId: string;
            billingModuleType: string;
          }) => Promise<unknown[]>;
        }
      ).resolveActiveProductsForBillingModuleType({
        authenticatedUserId,
        billingModuleType: '   ',
      });
      expect(products).toEqual([]);
    });
  });

  describe('getActiveSigningsProductsWithTieredRecurringPricesForAuthenticatedUser', () => {
    /**
     * Prepara un producto de fichajes enriquecido para el catálogo.
     */
    const mockSigningsCatalogProduct = (): void => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      stripeService.getAllProducts.mockResolvedValue([
        { id: 'prod_signings', metadata: { type: 'signings' } },
      ]);
      stripeService.getProductWithDefaultPriceExpanded.mockResolvedValue({
        id: 'prod_signings',
        name: 'Fichajes',
        metadata: { type: 'signings' },
        default_price: 'price_default',
      });
    };

    it('proyecta precios por tramos, filtra no recurrentes y ordena mes antes que año', async () => {
      mockSigningsCatalogProduct();
      stripeService.listActivePricesForProduct.mockResolvedValue([
        { id: 'price_once', type: 'one_time' },
        { id: 'price_no_recurring', type: 'recurring', recurring: null },
        { id: 'price_week', type: 'recurring', recurring: { interval: 'week' } },
        buildRecurringPrice({
          id: 'price_year',
          currency: 'usd',
          unit_amount: undefined,
          billing_scheme: undefined,
          tiers_mode: null,
          tiers: undefined,
          recurring: {
            interval: 'year',
            interval_count: 0,
            usage_type: undefined,
          } as Stripe.Price.Recurring,
        }),
        buildRecurringPrice({
          id: 'price_month_2',
          recurring: {
            interval: 'month',
            interval_count: 3,
            usage_type: 'licensed',
          } as Stripe.Price.Recurring,
        }),
        buildRecurringPrice({ id: 'price_month_1' }),
      ]);

      const catalog =
        await service.getActiveSigningsProductsWithTieredRecurringPricesForAuthenticatedUser(
          authenticatedUserId,
        );

      expect(catalog).toHaveLength(1);
      expect(catalog[0].prices.map((price) => price.priceId)).toEqual([
        'price_month_1',
        'price_month_2',
        'price_year',
      ]);
      expect(catalog[0].prices[2]).toEqual(
        expect.objectContaining({
          interval: 'year',
          intervalCount: 1,
          usageType: null,
          unitAmount: null,
          billingScheme: '',
          tiersMode: null,
          tiers: [],
        }),
      );
      expect(catalog[0].prices[0].tiers).toEqual([
        { upTo: 10, unitAmount: 500, flatAmount: 100 },
        { upTo: null, unitAmount: null, flatAmount: null },
      ]);
    });

    it('cae a product_type si type no tiene coincidencias y tolera errores al listar precios', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      stripeService.getAllProducts.mockImplementation(async () => [
        { id: 'prod_fallback', metadata: { product_type: 'signings' } },
      ]);
      stripeService.getProductWithDefaultPriceExpanded.mockResolvedValue({
        id: 'prod_fallback',
        name: 'Fallback',
        metadata: { product_type: 'signings' },
        default_price: 'price_fb',
      });
      stripeService.listActivePricesForProduct
        .mockRejectedValueOnce(new Error('prices down'))
        .mockRejectedValueOnce('prices-raw');

      const first =
        await service.getActiveSigningsProductsWithTieredRecurringPricesForAuthenticatedUser(
          authenticatedUserId,
        );
      expect(first).toEqual([
        expect.objectContaining({ productId: 'prod_fallback', prices: [] }),
      ]);

      const second =
        await service.getActiveSigningsProductsWithTieredRecurringPricesForAuthenticatedUser(
          authenticatedUserId,
        );
      expect(second[0].prices).toEqual([]);
    });

    it('devuelve lista vacía si no hay productos de fichajes', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      stripeService.getAllProducts.mockResolvedValue([]);
      await expect(
        service.getActiveSigningsProductsWithTieredRecurringPricesForAuthenticatedUser(
          authenticatedUserId,
        ),
      ).resolves.toEqual([]);
    });
  });

  describe('getActiveManagementProductsWithPerUnitRecurringPricesForAuthenticatedUser', () => {
    it('proyecta precios por unidad y ordena por intervalo', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      stripeService.getAllProducts.mockResolvedValue([
        { id: 'prod_mgmt', metadata: { type: 'management' } },
      ]);
      stripeService.getProductWithDefaultPriceExpanded.mockResolvedValue({
        id: 'prod_mgmt',
        name: 'Gestión',
        metadata: { type: 'management' },
        default_price: 'price_mgmt',
      });
      stripeService.listActivePricesForProduct.mockResolvedValue([
        buildRecurringPrice({
          id: 'price_year',
          recurring: {
            interval: 'year',
            interval_count: 1,
            usage_type: 'licensed',
          } as Stripe.Price.Recurring,
        }),
        buildRecurringPrice({
          id: 'price_month',
          unit_amount: 2500,
          recurring: {
            interval: 'month',
            interval_count: Number.NaN,
            usage_type: undefined,
          } as Stripe.Price.Recurring,
        }),
      ]);

      const catalog =
        await service.getActiveManagementProductsWithPerUnitRecurringPricesForAuthenticatedUser(
          authenticatedUserId,
        );

      expect(catalog[0].prices.map((price) => price.priceId)).toEqual([
        'price_month',
        'price_year',
      ]);
      expect(catalog[0].prices[0]).toEqual(
        expect.objectContaining({
          intervalCount: 1,
          usageType: null,
          unitAmount: 2500,
        }),
      );
      expect(catalog[0].prices[0]).not.toHaveProperty('tiers');
    });

    it('devuelve precios vacíos si el listado falla (Error y no Error)', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      stripeService.getAllProducts.mockResolvedValue([
        { id: 'prod_mgmt', metadata: { type: 'management' } },
      ]);
      stripeService.getProductWithDefaultPriceExpanded.mockResolvedValue({
        id: 'prod_mgmt',
        name: 'Gestión',
        metadata: { type: 'management' },
        default_price: 'price_mgmt',
      });
      stripeService.listActivePricesForProduct
        .mockRejectedValueOnce(new Error('mgmt prices'))
        .mockRejectedValueOnce('mgmt-raw');

      const first =
        await service.getActiveManagementProductsWithPerUnitRecurringPricesForAuthenticatedUser(
          authenticatedUserId,
        );
      const second =
        await service.getActiveManagementProductsWithPerUnitRecurringPricesForAuthenticatedUser(
          authenticatedUserId,
        );
      expect(first[0].prices).toEqual([]);
      expect(second[0].prices).toEqual([]);
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

    it('lanza 404 si faltan parámetros recortables', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      await expect(
        service.createSubscriptionCheckoutSessionForAuthenticatedUser({
          ...checkoutParams,
          enterpriseId: '  ',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.createSubscriptionCheckoutSessionForAuthenticatedUser({
          ...checkoutParams,
          priceId: '',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.createSubscriptionCheckoutSessionForAuthenticatedUser({
          ...checkoutParams,
          successUrl: ' ',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.createSubscriptionCheckoutSessionForAuthenticatedUser({
          ...checkoutParams,
          cancelUrl: undefined as unknown as string,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('prohíbe el acceso si el usuario no tiene empresas vinculadas', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      userRepository.findById.mockResolvedValue({ id: authenticatedUserId });
      await expect(
        service.createSubscriptionCheckoutSessionForAuthenticatedUser(checkoutParams),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lanza 404 si el usuario autenticado no existe', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      userRepository.findById.mockResolvedValue(null);
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

    it('prohíbe el acceso si el vínculo no trae empresa cargada', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      userRepository.findById.mockResolvedValue(buildUserWithEnterpriseLink({ includeEnterprise: false }));
      await expect(
        service.createSubscriptionCheckoutSessionForAuthenticatedUser(checkoutParams),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('acepta el vínculo por enterprise.id cuando enterpriseId del enlace difiere', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      userRepository.findById.mockResolvedValue({
        id: authenticatedUserId,
        userEnterprises: [
          {
            enterpriseId: 'otro-enlace',
            enterprise: { id: enterpriseId, stripeId: 'cus_via_id' },
          },
        ],
      });
      stripeService.createSubscriptionCheckoutSessionUrl.mockResolvedValue(
        'https://checkout.stripe.test/via-id',
      );

      await expect(
        service.createSubscriptionCheckoutSessionForAuthenticatedUser(checkoutParams),
      ).resolves.toEqual({ url: 'https://checkout.stripe.test/via-id' });
    });

    it('lanza 404 si la empresa no tiene cliente Stripe', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      userRepository.findById.mockResolvedValue(buildUserWithEnterpriseLink({ stripeId: '   ' }));

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
      newPriceId: 'price_new',
      quantity: 4,
    };

    it('no hace nada si Stripe no está configurado', async () => {
      await expect(service.updateSubscriptionPriceForAuthenticatedUser(updateParams)).resolves.toBeUndefined();
      expect(userRepository.findById).not.toHaveBeenCalled();
    });

    it('lanza 404 si los parámetros son inválidos', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      await expect(
        service.updateSubscriptionPriceForAuthenticatedUser({
          ...updateParams,
          subscriptionId: '  ',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.updateSubscriptionPriceForAuthenticatedUser({
          ...updateParams,
          enterpriseId: '',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.updateSubscriptionPriceForAuthenticatedUser({
          ...updateParams,
          newPriceId: ' ',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lanza 404 si el usuario no existe', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      userRepository.findById.mockResolvedValue(null);
      await expect(
        service.updateSubscriptionPriceForAuthenticatedUser(updateParams),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('prohíbe modificar si el usuario no tiene empresas vinculadas', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      userRepository.findById.mockResolvedValue({ id: authenticatedUserId });
      await expect(
        service.updateSubscriptionPriceForAuthenticatedUser(updateParams),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('prohíbe modificar suscripciones de una empresa no vinculada', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      await expect(
        service.updateSubscriptionPriceForAuthenticatedUser({
          ...updateParams,
          enterpriseId: 'otra',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lanza 404 si la empresa no tiene cliente Stripe', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      userRepository.findById.mockResolvedValue(buildUserWithEnterpriseLink({ stripeId: null }));
      await expect(
        service.updateSubscriptionPriceForAuthenticatedUser(updateParams),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lanza 404 si la suscripción no pertenece al cliente', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      stripeService.getSubscriptionsByAccountId.mockResolvedValue([{ id: 'sub_other' }]);
      await expect(
        service.updateSubscriptionPriceForAuthenticatedUser(updateParams),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('actualiza el precio cuando la suscripción pertenece a la empresa', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      stripeService.getSubscriptionsByAccountId.mockResolvedValue([{ id: 'sub_1' }]);

      await service.updateSubscriptionPriceForAuthenticatedUser(updateParams);
      expect(stripeService.updateSubscriptionPrimaryItemPrice).toHaveBeenCalledWith({
        subscriptionId: 'sub_1',
        newPriceId: 'price_new',
        quantity: 4,
      });
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

    it('acepta el filtro de empresa por enterprise.id del vínculo', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      userRepository.findById.mockResolvedValue({
        id: authenticatedUserId,
        userEnterprises: [
          {
            enterpriseId: 'enlace-distinto',
            enterprise: { id: enterpriseId, stripeId: 'cus_test' },
          },
        ],
      });
      stripeService.getSubscriptionsByAccountId.mockResolvedValue([]);

      await expect(
        service.getActiveSubscriptionsPresentationForAuthenticatedUser(
          authenticatedUserId,
          enterpriseId,
        ),
      ).resolves.toEqual([]);
    });

    it('devuelve vacío si no hay stripeId ni empresas cargadas', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      userRepository.findById.mockResolvedValue({
        id: authenticatedUserId,
        userEnterprises: [
          { enterpriseId, enterprise: null },
          { enterpriseId, enterprise: { id: enterpriseId, stripeId: '  ' } },
          { enterpriseId: 'otra', enterprise: { id: 'otra', stripeId: 'cus_other' } },
        ],
      });

      await expect(
        service.getActiveSubscriptionsPresentationForAuthenticatedUser(
          authenticatedUserId,
          enterpriseId,
        ),
      ).resolves.toEqual([]);
    });

    it('devuelve vacío si userEnterprises es indefinido', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      userRepository.findById.mockResolvedValue({ id: authenticatedUserId });
      await expect(
        service.getActiveSubscriptionsPresentationForAuthenticatedUser(authenticatedUserId),
      ).resolves.toEqual([]);
    });

    it('relanza el error al listar suscripciones (Error y no Error)', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      stripeService.getSubscriptionsByAccountId.mockRejectedValueOnce(new Error('stripe list'));
      await expect(
        service.getActiveSubscriptionsPresentationForAuthenticatedUser(authenticatedUserId),
      ).rejects.toThrow('stripe list');

      stripeService.getSubscriptionsByAccountId.mockRejectedValueOnce('stripe-raw');
      await expect(
        service.getActiveSubscriptionsPresentationForAuthenticatedUser(authenticatedUserId),
      ).rejects.toBe('stripe-raw');
    });

    it('construye presentaciones cubriendo productos, calendarios, unidades y huecos', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      userRepository.findById.mockResolvedValue(
        buildUserWithEnterpriseLink({
          extraLinks: [
            { enterpriseId: 'dup', enterprise: { id: 'dup', stripeId: 'cus_test' } },
            { enterpriseId: 'second', enterprise: { id: 'second', stripeId: 'cus_second' } },
            { enterpriseId: 'errored', enterprise: { id: 'errored', stripeId: 'cus_error' } },
            { enterpriseId: 'whitespace', enterprise: { id: '   ', stripeId: 'cus_ws' } },
          ],
        }),
      );

      const expandedNamedProduct = {
        id: 'prod_inline',
        name: '  Nombre en línea  ',
        metadata: { type: 'signings' },
      };
      const expandedDeletedProduct = { id: 'prod_deleted', deleted: true };
      const expandedNamelessProduct = { id: 'prod_nameless', name: '   ', metadata: {} };

      const subscriptionsCustomerOne: Stripe.Subscription[] = [
        buildSubscription({
          id: 'sub_inline',
          quantity: 10,
          price: {
            id: 'price_1',
            product: expandedNamedProduct,
            recurring: { interval: 'month', interval_count: 1 },
          } as unknown as Stripe.Price,
          schedule: 'sub_sched_reduce',
        }),
        buildSubscription({
          id: 'sub_inline',
          quantity: 10,
          price: { id: 'price_dup', product: 'prod_dup' } as Stripe.Price,
        }),
        buildSubscription({
          id: 'sub_string_price',
          price: 'price_as_string' as unknown as Stripe.Price,
          quantity: Number.NaN,
          currentPeriodStart: Number.NaN,
          currentPeriodEnd: Number.NaN,
          schedule: { id: '   ' } as Stripe.SubscriptionSchedule,
        }),
        buildSubscription({
          id: 'sub_deleted_product',
          quantity: 0,
          price: { id: 'price_del', product: expandedDeletedProduct } as Stripe.Price,
          schedule: { id: 'sub_sched_fail' } as Stripe.SubscriptionSchedule,
        }),
        buildSubscription({
          id: 'sub_catalog',
          quantity: 5,
          price: {
            id: 'price_cat',
            product: '  prod_catalog  ',
            recurring: { interval: 'year', interval_count: Number.NaN },
          } as unknown as Stripe.Price,
          schedule: {
            id: 'sub_sched_no_reduce',
            phases: [{ start_date: 1 }, { start_date: 2, items: [{ quantity: 9 }] }],
          } as Stripe.SubscriptionSchedule,
        }),
        buildSubscription({
          id: 'sub_empty_product_string',
          quantity: 2,
          price: { id: 'price_empty', product: '   ' } as Stripe.Price,
        }),
        buildSubscription({
          id: 'sub_null_product',
          quantity: 2,
          price: { id: 'price_null', product: null } as unknown as Stripe.Price,
        }),
        buildSubscription({
          id: 'sub_nameless',
          quantity: 4,
          price: {
            id: 'price_nl',
            product: expandedNamelessProduct,
            recurring: { interval: '  ', interval_count: 2 },
          } as unknown as Stripe.Price,
        }),
        buildSubscription({
          id: 'sub_missing_catalog',
          quantity: 7,
          price: { id: 'price_miss', product: 'prod_missing' } as Stripe.Price,
          schedule: 'sub_sched_invalid_end',
        }),
        buildSubscription({
          id: 'sub_no_qty_reduce',
          quantity: 0,
          price: { id: 'price_q0', product: 'prod_catalog' } as Stripe.Price,
          schedule: 'sub_sched_qty_zero',
        }),
        buildSubscription({ omitItems: true, id: 'sub_no_items' }),
        buildSubscription({ id: 'sub_null_price' }),
        buildSubscription({
          id: 'sub_product_without_id',
          quantity: 2,
          price: {
            id: 'price_no_prod_id',
            product: { name: 'Sin id' },
          } as Stripe.Price,
        }),
        buildSubscription({
          id: 'sub_multi_items',
          items: {
            data: [
              { id: 'si_a', price: 'price_str' as unknown as Stripe.Price },
              {
                id: 'si_b',
                price: { id: 'price_obj', product: { id: 'prod_catalog' } } as Stripe.Price,
              },
            ],
          } as Stripe.Subscription['items'],
        }),
      ];

      const subscriptionsCustomerTwo: Stripe.Subscription[] = [
        buildSubscription({
          id: 'sub_second',
          quantity: 8,
          price: {
            id: 'price_s',
            product: 'prod_second',
            recurring: { interval: 'month', interval_count: 2 },
          } as unknown as Stripe.Price,
          schedule: {
            phases: [
              { start_date: 50, items: [{ quantity: 8 }] },
              { start_date: Number.NaN, items: [{ quantity: 1 }] },
            ],
          } as Stripe.SubscriptionSchedule,
        }),
      ];

      stripeService.getSubscriptionsByAccountId.mockImplementation(async (customerId: string) => {
        if (customerId === 'cus_test') {
          return subscriptionsCustomerOne;
        }
        if (customerId === 'cus_second') {
          return subscriptionsCustomerTwo;
        }
        if (customerId === 'cus_error') {
          return [
            buildSubscription({
              id: 'sub_error_enterprise',
              quantity: 2,
              price: { id: 'price_err', product: 'prod_catalog' } as Stripe.Price,
            }),
          ];
        }
        if (customerId === 'cus_ws') {
          return [
            buildSubscription({
              id: 'sub_ws_enterprise',
              quantity: 1,
              price: { id: 'price_ws', product: 'prod_catalog' } as Stripe.Price,
            }),
          ];
        }
        return [];
      });
      stripeService.getAllProducts.mockResolvedValue([
        { id: 'prod_catalog', name: '  Catálogo  ', metadata: { module: 'hr' } },
        { id: 'prod_inline', name: 'Ignorado', metadata: { type: 'old' } },
      ]);
      stripeService.getProductNamesAndMetadataByIds.mockResolvedValue(
        new Map([
          [
            'prod_missing',
            { name: 'Recuperado', metadataEntries: [{ key: 'origin', value: 'retrieve' }] },
          ],
          [
            'prod_second',
            { name: 'Segundo', metadataEntries: [{ key: 'type', value: 'management' }] },
          ],
        ]),
      );
      stripeService.retrieveSubscriptionSchedule.mockImplementation(async (scheduleId: string) => {
        if (scheduleId === 'sub_sched_reduce') {
          return {
            id: scheduleId,
            phases: [
              { start_date: 100, items: [{ quantity: 10 }] },
              { start_date: 300, items: [{ quantity: 4 }] },
            ],
          };
        }
        if (scheduleId === 'sub_sched_no_reduce') {
          return {
            id: scheduleId,
            phases: [{ start_date: 1, items: [{ quantity: 5 }] }, { start_date: 2, items: [{ quantity: 9 }] }],
          };
        }
        if (scheduleId === 'sub_sched_invalid_end') {
          return {
            id: scheduleId,
            phases: [
              { start_date: 1, items: [{ quantity: 7 }] },
              { start_date: Number.POSITIVE_INFINITY, items: [{ quantity: 1 }] },
            ],
          };
        }
        if (scheduleId === 'sub_sched_fail') {
          throw new Error('schedule down');
        }
        if (scheduleId === 'sub_sched_qty_zero') {
          return {
            id: scheduleId,
            phases: [
              { start_date: 1, items: [{ quantity: 0 }] },
              { start_date: 2, items: [{ quantity: 1 }] },
            ],
          };
        }
        throw 'schedule-raw';
      });
      userRepository.countActiveNonSigningsUsersForEnterprise.mockImplementation(
        async (resolvedEnterpriseId: string) => {
          if (resolvedEnterpriseId === 'second') {
            throw 'count-raw';
          }
          if (resolvedEnterpriseId === 'errored') {
            throw new Error('count fail');
          }
          return 3;
        },
      );

      const presentations = await service.getActiveSubscriptionsPresentationForAuthenticatedUser(
        authenticatedUserId,
      );

      const byId = Object.fromEntries(
        presentations.map((presentation) => [presentation.subscriptionId, presentation]),
      );

      expect(presentations.filter((presentation) => presentation.subscriptionId === 'sub_inline')).toHaveLength(
        1,
      );
      expect(byId.sub_inline.product.name).toBe('Nombre en línea');
      expect(byId.sub_inline.product.metadata).toEqual([{ key: 'type', value: 'signings' }]);
      expect(byId.sub_inline.usage).toEqual({ used: 3, max: 10 });
      expect(byId.sub_inline.billingInterval).toEqual({ type: 'month', count: 1 });
      expect(byId.sub_inline.scheduledLicensedQuotaReduction).toEqual({
        nextMaxUsers: 4,
        effectiveAtIso: new Date(300 * 1000).toISOString(),
      });

      expect(byId.sub_string_price.product.name).toBe('Producto sin nombre');
      expect(byId.sub_string_price.billingInterval).toBeNull();
      expect(byId.sub_string_price.currentPeriod.start).toBe(new Date(0).toISOString());
      expect(byId.sub_string_price.usage.max).toBe(0);

      expect(byId.sub_deleted_product.product.name).toBe('Producto sin nombre');
      expect(byId.sub_deleted_product.scheduledLicensedQuotaReduction).toBeNull();

      expect(byId.sub_catalog.product.name).toBe('Catálogo');
      expect(byId.sub_catalog.product.metadata).toEqual([{ key: 'module', value: 'hr' }]);
      expect(byId.sub_catalog.billingInterval).toEqual({ type: 'year', count: 1 });
      expect(byId.sub_catalog.scheduledLicensedQuotaReduction).toBeNull();

      expect(byId.sub_nameless.product.name).toBe('Producto sin nombre');
      expect(byId.sub_nameless.billingInterval).toBeNull();

      expect(byId.sub_missing_catalog.product.name).toBe('Recuperado');
      expect(byId.sub_missing_catalog.scheduledLicensedQuotaReduction).toBeNull();

      expect(byId.sub_no_items.product.name).toBe('Producto sin nombre');
      expect(byId.sub_no_items.usage.max).toBe(0);

      expect(byId.sub_second.usage.used).toBe(0);
      expect(byId.sub_second.scheduledLicensedQuotaReduction).toBeNull();
      expect(byId.sub_error_enterprise.usage.used).toBe(0);
      expect(byId.sub_ws_enterprise.usage.used).toBe(0);
      expect(stripeService.getProductNamesAndMetadataByIds).toHaveBeenCalled();
    });

    it('usa 1 como siguiente cupo si la fase futura no trae cantidad y omite si no hay reducción', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      stripeService.getSubscriptionsByAccountId.mockResolvedValue([
        buildSubscription({
          id: 'sub_default_next',
          quantity: 5,
          price: { id: 'price_1', product: 'prod_catalog' } as Stripe.Price,
          schedule: 'sub_sched_default_next',
        }),
      ]);
      stripeService.getAllProducts.mockResolvedValue([
        { id: 'prod_catalog', name: 'Cat', metadata: {} },
      ]);
      stripeService.retrieveSubscriptionSchedule.mockResolvedValue({
        id: 'sub_sched_default_next',
        phases: [{ start_date: 1 }, { start_date: 2, items: [{ quantity: 0 }] }],
      });

      const presentations = await service.getActiveSubscriptionsPresentationForAuthenticatedUser(
        authenticatedUserId,
      );
      expect(presentations[0].scheduledLicensedQuotaReduction).toEqual({
        nextMaxUsers: 1,
        effectiveAtIso: new Date(2 * 1000).toISOString(),
      });
    });

    it('usa el catálogo cuando el producto es una cadena y el intervalo no trae count', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      stripeService.getSubscriptionsByAccountId.mockResolvedValue([
        buildSubscription({
          id: 'sub_string_product',
          quantity: 2,
          price: {
            id: 'price_num',
            product: 'prod_catalog',
            recurring: { interval: 'month' },
          } as unknown as Stripe.Price,
        }),
      ]);
      stripeService.getAllProducts.mockResolvedValue([
        { id: 'prod_catalog', name: '', metadata: {} },
      ]);

      const presentations = await service.getActiveSubscriptionsPresentationForAuthenticatedUser(
        authenticatedUserId,
      );
      expect(presentations[0].product.name).toBe('Producto sin nombre');
      expect(presentations[0].billingInterval).toEqual({ type: 'month', count: 1 });
    });

    it('tolera un error no Error al recuperar el calendario', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      stripeService.getSubscriptionsByAccountId.mockResolvedValue([
        buildSubscription({
          id: 'sub_raw_sched',
          quantity: 2,
          price: { id: 'price_1', product: 'prod_catalog' } as Stripe.Price,
          schedule: 'sched_raw',
        }),
      ]);
      stripeService.getAllProducts.mockResolvedValue([
        { id: 'prod_catalog', name: 'Cat', metadata: {} },
      ]);
      stripeService.retrieveSubscriptionSchedule.mockRejectedValue('calendario-crudo');

      const presentations = await service.getActiveSubscriptionsPresentationForAuthenticatedUser(
        authenticatedUserId,
      );
      expect(presentations[0].scheduledLicensedQuotaReduction).toBeNull();
    });

    it('omite el calendario de una sola fase y el de cantidad futura mayor o igual', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      stripeService.getSubscriptionsByAccountId.mockResolvedValue([
        buildSubscription({
          id: 'sub_one_phase',
          quantity: 5,
          price: { id: 'price_1', product: 'prod_catalog' } as Stripe.Price,
          schedule: 'sched_one',
        }),
        buildSubscription({
          id: 'sub_equal',
          quantity: 5,
          price: { id: 'price_1', product: 'prod_catalog' } as Stripe.Price,
          schedule: 'sched_equal',
        }),
      ]);
      stripeService.getAllProducts.mockResolvedValue([
        { id: 'prod_catalog', name: 'Cat', metadata: {} },
      ]);
      stripeService.retrieveSubscriptionSchedule.mockImplementation(async (scheduleId: string) => {
        if (scheduleId === 'sched_one') {
          return { id: scheduleId, phases: [{ start_date: 1 }] };
        }
        return {
          id: scheduleId,
          phases: [{ start_date: 1 }, { start_date: 2, items: [{ quantity: 5 }] }],
        };
      });

      const presentations = await service.getActiveSubscriptionsPresentationForAuthenticatedUser(
        authenticatedUserId,
      );
      expect(presentations.every((presentation) => presentation.scheduledLicensedQuotaReduction === null)).toBe(
        true,
      );
    });
  });

  describe('cancelActiveSubscriptionAtPeriodEndForAuthenticatedUser', () => {
    it('no hace nada si Stripe no está configurado', async () => {
      await expect(
        service.cancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
          authenticatedUserId,
          'sub_1',
        ),
      ).resolves.toBeUndefined();
      expect(userRepository.findById).not.toHaveBeenCalled();
    });

    it('lanza 404 si el usuario no existe', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      userRepository.findById.mockResolvedValue(null);
      await expect(
        service.cancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
          authenticatedUserId,
          'sub_1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('prohíbe cancelar si no hay vínculo con la empresa filtrada', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      await expect(
        service.cancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
          authenticatedUserId,
          'sub_1',
          'otra-empresa',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('acepta el filtro por enterprise.id al cancelar', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      userRepository.findById.mockResolvedValue({
        id: authenticatedUserId,
        userEnterprises: [
          { enterpriseId: 'enlace', enterprise: { id: enterpriseId, stripeId: 'cus_test' } },
        ],
      });
      stripeService.getSubscriptionsByAccountId.mockResolvedValue([{ id: 'sub_1' }]);

      await service.cancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
        authenticatedUserId,
        'sub_1',
        enterpriseId,
      );
      expect(stripeService.cancelSubscriptionAtPeriodEnd).toHaveBeenCalledWith('sub_1');
    });

    it('lanza 404 si no hay cliente Stripe', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      userRepository.findById.mockResolvedValue(buildUserWithEnterpriseLink({ stripeId: '' }));
      await expect(
        service.cancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
          authenticatedUserId,
          'sub_1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('trata userEnterprises indefinido como lista vacía al cancelar', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      userRepository.findById.mockResolvedValue({ id: authenticatedUserId });
      await expect(
        service.cancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
          authenticatedUserId,
          'sub_1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lanza 404 si el identificador de suscripción es inválido', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      await expect(
        service.cancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(authenticatedUserId, '  '),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.cancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
          authenticatedUserId,
          undefined as unknown as string,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lanza 404 si la suscripción no está en los clientes autorizados', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      stripeService.getSubscriptionsByAccountId.mockResolvedValue([{ id: 'sub_other' }]);
      await expect(
        service.cancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
          authenticatedUserId,
          'sub_1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('cancela al encontrar la suscripción en el segundo cliente', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      userRepository.findById.mockResolvedValue(
        buildUserWithEnterpriseLink({
          extraLinks: [
            { enterpriseId: 'second', enterprise: { id: 'second', stripeId: 'cus_second' } },
          ],
        }),
      );
      stripeService.getSubscriptionsByAccountId.mockImplementation(async (customerId: string) => {
        if (customerId === 'cus_second') {
          return [{ id: 'sub_target' }];
        }
        return [{ id: 'sub_other' }];
      });

      await service.cancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
        authenticatedUserId,
        '  sub_target  ',
      );
      expect(stripeService.cancelSubscriptionAtPeriodEnd).toHaveBeenCalledWith('sub_target');
    });
  });

  describe('revokeCancelActiveSubscriptionAtPeriodEndForAuthenticatedUser', () => {
    it('no hace nada si Stripe no está configurado', async () => {
      await expect(
        service.revokeCancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
          authenticatedUserId,
          'sub_1',
        ),
      ).resolves.toBeUndefined();
    });

    it('lanza 404 si el usuario no existe', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      userRepository.findById.mockResolvedValue(null);
      await expect(
        service.revokeCancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
          authenticatedUserId,
          'sub_1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('prohíbe revocar si no hay vínculo con la empresa filtrada', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      await expect(
        service.revokeCancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
          authenticatedUserId,
          'sub_1',
          'otra-empresa',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('acepta el filtro por enterprise.id al revocar', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      userRepository.findById.mockResolvedValue({
        id: authenticatedUserId,
        userEnterprises: [
          { enterpriseId: 'enlace', enterprise: { id: enterpriseId, stripeId: 'cus_test' } },
        ],
      });
      stripeService.getSubscriptionsByAccountId.mockResolvedValue([{ id: 'sub_1' }]);

      await service.revokeCancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
        authenticatedUserId,
        'sub_1',
        enterpriseId,
      );
      expect(stripeService.revokeCancelSubscriptionAtPeriodEnd).toHaveBeenCalledWith('sub_1');
    });

    it('lanza 404 si no hay cliente Stripe', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      userRepository.findById.mockResolvedValue({ id: authenticatedUserId, userEnterprises: [] });
      await expect(
        service.revokeCancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
          authenticatedUserId,
          'sub_1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('trata userEnterprises indefinido como lista vacía al revocar', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      userRepository.findById.mockResolvedValue({ id: authenticatedUserId });
      await expect(
        service.revokeCancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
          authenticatedUserId,
          'sub_1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lanza 404 si el identificador de suscripción es inválido', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      await expect(
        service.revokeCancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
          authenticatedUserId,
          '   ',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.revokeCancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
          authenticatedUserId,
          undefined as unknown as string,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lanza 404 si la suscripción no está autorizada', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      stripeService.getSubscriptionsByAccountId.mockResolvedValue([]);
      await expect(
        service.revokeCancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
          authenticatedUserId,
          'sub_1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('revoca al localizar la suscripción en un cliente posterior', async () => {
      stripeService.isStripeConfigured.mockReturnValue(true);
      userRepository.findById.mockResolvedValue(
        buildUserWithEnterpriseLink({
          extraLinks: [
            { enterpriseId: 'second', enterprise: { id: 'second', stripeId: 'cus_second' } },
          ],
        }),
      );
      stripeService.getSubscriptionsByAccountId.mockImplementation(async (customerId: string) => {
        return customerId === 'cus_second' ? [{ id: 'sub_rev' }] : [];
      });

      await service.revokeCancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
        authenticatedUserId,
        'sub_rev',
      );
      expect(stripeService.revokeCancelSubscriptionAtPeriodEnd).toHaveBeenCalledWith('sub_rev');
    });
  });

  describe('ayudantes privados', () => {
    /**
     * Expone los ayudantes privados del servicio para cubrir ramas residuales.
     */
    const getPrivateHelpers = () =>
      service as unknown as {
        sortRecurringPriceRowsByInterval: <T extends { interval: string; intervalCount: number }>(
          rows: T[],
        ) => T[];
        buildTieredRecurringPriceRowFromStripePrice: (price: Stripe.Price) => {
          currency: string;
          interval: string;
          intervalCount: number;
          usageType: string | null;
          unitAmount: number | null;
          billingScheme: string;
          tiersMode: string | null;
          tiers: unknown[];
        };
        buildPerUnitRecurringPriceRowFromStripePrice: (price: Stripe.Price) => {
          currency: string;
          interval: string;
          intervalCount: number;
          usageType: string | null;
          unitAmount: number | null;
        };
        listSortedRecurringPricesForProduct: (params: {
          productId: string;
          priceProjection: 'tiered' | 'per_unit';
        }) => Promise<Array<{ interval: string }>>;
      };

    it('ordena anual después de mensual y por intervalCount cuando el intervalo coincide', () => {
      const helpers = getPrivateHelpers();
      expect(
        helpers.sortRecurringPriceRowsByInterval([
          { interval: 'year', intervalCount: 1, id: 'y' },
          { interval: 'month', intervalCount: 2, id: 'm2' },
          { interval: 'month', intervalCount: 1, id: 'm1' },
        ]),
      ).toEqual([
        { interval: 'month', intervalCount: 1, id: 'm1' },
        { interval: 'month', intervalCount: 2, id: 'm2' },
        { interval: 'year', intervalCount: 1, id: 'y' },
      ]);
      expect(
        helpers.sortRecurringPriceRowsByInterval([
          { interval: 'year', intervalCount: 1, id: 'y1' },
          { interval: 'week', intervalCount: 1, id: 'w1' },
        ]).map((row) => row.id),
      ).toEqual(expect.arrayContaining(['y1', 'w1']));
    });

    it('construye filas de precio cubriendo huecos de moneda, intervalo, uso y tramos', () => {
      const helpers = getPrivateHelpers();
      const sparsePrice = {
        id: 'price_sparse',
      } as Stripe.Price;
      const tiered = helpers.buildTieredRecurringPriceRowFromStripePrice(sparsePrice);
      expect(tiered).toEqual(
        expect.objectContaining({
          currency: '',
          interval: '',
          intervalCount: 1,
          usageType: null,
          unitAmount: null,
          billingScheme: '',
          tiersMode: null,
          tiers: [],
        }),
      );

      expect(
        helpers.buildTieredRecurringPriceRowFromStripePrice({
          id: 'price_zero_count',
          recurring: { interval: 'month', interval_count: 0 },
        } as Stripe.Price).intervalCount,
      ).toBe(1);
      expect(
        helpers.buildPerUnitRecurringPriceRowFromStripePrice({
          id: 'price_nan_count',
          recurring: { interval: 'month', interval_count: Number.NaN },
        } as Stripe.Price).intervalCount,
      ).toBe(1);

      const sparsePerUnit = helpers.buildPerUnitRecurringPriceRowFromStripePrice({
        id: 'price_sparse_unit',
      } as Stripe.Price);
      expect(sparsePerUnit).toEqual(
        expect.objectContaining({
          currency: '',
          interval: '',
          intervalCount: 1,
          usageType: null,
          unitAmount: null,
        }),
      );

      const perUnit = helpers.buildPerUnitRecurringPriceRowFromStripePrice({
        id: 'price_unit',
        currency: 'USD',
        unit_amount: 1500,
        billing_scheme: 'per_unit',
        recurring: { interval: 'year', interval_count: 2, usage_type: 'licensed' },
      } as Stripe.Price);
      expect(perUnit).toEqual(
        expect.objectContaining({
          currency: 'usd',
          interval: 'year',
          intervalCount: 2,
          usageType: 'licensed',
          unitAmount: 1500,
        }),
      );
    });

    it('filtra intervalos que no son mes ni año y deja pasar el anual', async () => {
      const helpers = getPrivateHelpers();
      stripeService.listActivePricesForProduct.mockResolvedValue([
        { id: 'price_week', type: 'recurring', recurring: { interval: 'week' } },
        { id: 'price_empty_interval', type: 'recurring', recurring: {} },
        { id: 'price_year', type: 'recurring', recurring: { interval: 'year' } },
      ]);
      const rows = await helpers.listSortedRecurringPricesForProduct({
        productId: 'prod_1',
        priceProjection: 'per_unit',
      });
      expect(rows.map((row) => row.interval)).toEqual(['year']);
    });

    it('extrae producto nulo cuando el id no es cadena ni objeto y arma presentación residual', () => {
      const extractProductId = (
        BillingService as unknown as {
          extractProductIdFromSubscriptionItem: (item: Stripe.SubscriptionItem) => string | null;
        }
      ).extractProductIdFromSubscriptionItem;
      expect(
        extractProductId({
          price: { id: 'price_1', product: 99 } as unknown as Stripe.Price,
        } as Stripe.SubscriptionItem),
      ).toBeNull();

      const buildPresentation = (
        BillingService as unknown as {
          buildPresentationForSubscription: (
            subscription: Stripe.Subscription,
            names: Map<string, string>,
            metadata: Map<string, Array<{ key: string; value: string }>>,
            enterpriseId: string | null,
            used: Map<string, number>,
            schedule: Stripe.SubscriptionSchedule | null,
          ) => { usage: { used: number }; scheduledLicensedQuotaReduction: unknown };
        }
      ).buildPresentationForSubscription;

      const presentation = buildPresentation(
        {
          id: 'sub_private',
          status: 'active',
          cancel_at_period_end: false,
          items: { data: [{ quantity: Number.NaN, price: { id: 'p' } }] },
        } as unknown as Stripe.Subscription,
        new Map(),
        new Map(),
        'enterprise-missing-usage',
        new Map(),
        {
          phases: [
            { start_date: undefined, items: [{ quantity: 3 }] },
            { start_date: 50, items: [{ quantity: 1 }] },
          ],
        } as Stripe.SubscriptionSchedule,
      );
      expect(presentation.usage.used).toBe(0);
      expect(presentation.scheduledLicensedQuotaReduction).toBeNull();
    });

    it('detecta reducción programada cuando hay cupo actual y fases desordenadas sin fecha', () => {
      const resolveReduction = (
        BillingService as unknown as {
          resolveScheduledLicensedQuotaReductionSummary: (params: {
            subscription: Stripe.Subscription;
            schedule: Stripe.SubscriptionSchedule | null;
          }) => { nextMaxUsers: number } | null;
        }
      ).resolveScheduledLicensedQuotaReductionSummary;

      expect(
        resolveReduction({
          subscription: {
            items: { data: [{ quantity: 8 }] },
          } as Stripe.Subscription,
          schedule: {
            phases: [
              { items: [{ quantity: 8 }] },
              { items: [{ quantity: 3 }] },
            ],
          } as Stripe.SubscriptionSchedule,
        }),
      ).toBeNull();
    });
  });
});
