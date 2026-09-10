import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import Stripe from 'stripe';
import { StripeService } from './stripe.service';

const mockProductsList = jest.fn();
const mockProductsRetrieve = jest.fn();
const mockPricesList = jest.fn();
const mockPricesRetrieve = jest.fn();
const mockCheckoutSessionsCreate = jest.fn();
const mockSubscriptionsList = jest.fn();
const mockSubscriptionsRetrieve = jest.fn();
const mockSubscriptionsUpdate = jest.fn();
const mockSubscriptionSchedulesRetrieve = jest.fn();
const mockSubscriptionSchedulesCreate = jest.fn();
const mockSubscriptionSchedulesUpdate = jest.fn();
const mockSubscriptionSchedulesRelease = jest.fn();
const mockSubscriptionItemsUpdate = jest.fn();
const mockCustomersRetrieve = jest.fn();

jest.mock('stripe', () => {
  const StripeMock = jest.fn().mockImplementation(() => ({
    products: { list: mockProductsList, retrieve: mockProductsRetrieve },
    prices: { list: mockPricesList, retrieve: mockPricesRetrieve },
    checkout: { sessions: { create: mockCheckoutSessionsCreate } },
    subscriptions: {
      list: mockSubscriptionsList,
      retrieve: mockSubscriptionsRetrieve,
      update: mockSubscriptionsUpdate,
    },
    subscriptionSchedules: {
      retrieve: mockSubscriptionSchedulesRetrieve,
      create: mockSubscriptionSchedulesCreate,
      update: mockSubscriptionSchedulesUpdate,
      release: mockSubscriptionSchedulesRelease,
    },
    subscriptionItems: { update: mockSubscriptionItemsUpdate },
    customers: { retrieve: mockCustomersRetrieve },
  }));
  return {
    __esModule: true,
    default: StripeMock,
  };
});

/**
 * Reinicia todos los mocks del SDK de Stripe entre pruebas.
 */
const resetStripeSdkMocks = (): void => {
  mockProductsList.mockReset();
  mockProductsRetrieve.mockReset();
  mockPricesList.mockReset();
  mockPricesRetrieve.mockReset();
  mockCheckoutSessionsCreate.mockReset();
  mockSubscriptionsList.mockReset();
  mockSubscriptionsRetrieve.mockReset();
  mockSubscriptionsUpdate.mockReset();
  mockSubscriptionSchedulesRetrieve.mockReset();
  mockSubscriptionSchedulesCreate.mockReset();
  mockSubscriptionSchedulesUpdate.mockReset();
  mockSubscriptionSchedulesRelease.mockReset();
  mockSubscriptionItemsUpdate.mockReset();
  mockCustomersRetrieve.mockReset();
};

/**
 * Construye una suscripción licenciada mínima para las pruebas de cambio de cupo.
 * @param overrides - Campos a sobrescribir sobre la suscripción base
 * @returns Suscripción Stripe simulada
 */
const buildLicensedSubscription = (
  overrides: Partial<Stripe.Subscription> & {
    itemId?: string;
    priceId?: string;
    quantity?: number;
    usageType?: 'licensed' | 'metered' | 'other';
    priceAsString?: boolean;
    priceIdValue?: string | number | null;
    schedule?: Stripe.Subscription['schedule'];
    currentPeriodEnd?: number;
  } = {},
): Stripe.Subscription => {
  const itemId = overrides.itemId ?? 'si_primary';
  const priceId = overrides.priceId ?? 'price_current';
  const quantity = overrides.quantity;
  const usageType = overrides.usageType ?? 'licensed';
  const price: Stripe.SubscriptionItem['price'] = overrides.priceAsString
    ? (priceId as unknown as Stripe.Price)
    : ({
        id: overrides.priceIdValue === undefined ? priceId : overrides.priceIdValue,
        recurring: {
          usage_type:
            usageType === 'other' ? ('graduated' as Stripe.Price.Recurring.UsageType) : usageType,
        },
      } as Stripe.Price);

  return {
    id: 'sub_1',
    current_period_end: overrides.currentPeriodEnd ?? 2_000,
    schedule: overrides.schedule,
    items: {
      data: [
        {
          id: itemId,
          quantity,
          price,
        } as Stripe.SubscriptionItem,
      ],
    },
    ...overrides,
  } as Stripe.Subscription;
};

describe('StripeService', () => {
  let service: StripeService;

  beforeEach(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    resetStripeSdkMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [StripeService],
    }).compile();

    service = module.get<StripeService>(StripeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extractDefaultPriceIdFromProduct', () => {
    it('devuelve cadena vacía si no hay default_price', () => {
      expect(
        StripeService.extractDefaultPriceIdFromProduct({ id: 'prod_1' } as Stripe.Product),
      ).toBe('');
    });

    it('devuelve el identificador recortado cuando default_price es una cadena', () => {
      expect(
        StripeService.extractDefaultPriceIdFromProduct({
          id: 'prod_1',
          default_price: '  price_abc  ',
        } as Stripe.Product),
      ).toBe('price_abc');
    });

    it('extrae el id cuando default_price está expandido', () => {
      expect(
        StripeService.extractDefaultPriceIdFromProduct({
          id: 'prod_1',
          default_price: { id: 'price_expanded' },
        } as Stripe.Product),
      ).toBe('price_expanded');
    });

    it('resuelve cadena vacía si el precio del ítem es nulo', () => {
      const resolveSubscriptionItemPriceId = (
        StripeService as unknown as {
          resolveSubscriptionItemPriceId: (price: Stripe.SubscriptionItem['price'] | null) => string;
        }
      ).resolveSubscriptionItemPriceId;
      expect(resolveSubscriptionItemPriceId(null)).toBe('');
      expect(resolveSubscriptionItemPriceId(undefined as unknown as Stripe.SubscriptionItem['price'])).toBe(
        '',
      );
    });

    it('devuelve cadena vacía si el precio expandido no tiene id usable', () => {
      expect(
        StripeService.extractDefaultPriceIdFromProduct({
          id: 'prod_1',
          default_price: { id: '   ' },
        } as Stripe.Product),
      ).toBe('');
      expect(
        StripeService.extractDefaultPriceIdFromProduct({
          id: 'prod_1',
          default_price: {},
        } as Stripe.Product),
      ).toBe('');
    });
  });

  describe('normalizeStripeMetadataToSortedEntries', () => {
    it('devuelve lista vacía si los metadatos no son un objeto', () => {
      expect(StripeService.normalizeStripeMetadataToSortedEntries(null)).toEqual([]);
      expect(StripeService.normalizeStripeMetadataToSortedEntries(undefined)).toEqual([]);
      expect(
        StripeService.normalizeStripeMetadataToSortedEntries(
          'no-object' as unknown as Stripe.Metadata,
        ),
      ).toEqual([]);
    });

    it('ordena las claves de forma estable e ignora mayúsculas', () => {
      expect(
        StripeService.normalizeStripeMetadataToSortedEntries({
          type: 'signings',
          Module: 'hr',
          amount: '10',
        }),
      ).toEqual([
        { key: 'amount', value: '10' },
        { key: 'Module', value: 'hr' },
        { key: 'type', value: 'signings' },
      ]);
    });

    it('convierte valores nulos o indefinidos a cadena vacía', () => {
      expect(
        StripeService.normalizeStripeMetadataToSortedEntries({
          empty: null,
          missing: undefined,
        } as unknown as Stripe.Metadata),
      ).toEqual([
        { key: 'empty', value: '' },
        { key: 'missing', value: '' },
      ]);
    });
  });

  describe('sin STRIPE_SECRET_KEY', () => {
    it('marca Stripe como no configurado y lanza al afirmar la configuración', () => {
      expect(service.isStripeConfigured()).toBe(false);
      expect(() => service.assertStripeIsConfigured()).toThrow(ServiceUnavailableException);
    });

    it('trata una clave solo con espacios como no configurada', () => {
      process.env.STRIPE_SECRET_KEY = '   ';
      const unconfiguredService = new StripeService();
      expect(unconfiguredService.isStripeConfigured()).toBe(false);
    });

    it('rechaza operaciones públicas cuando Stripe no está disponible', async () => {
      await expect(service.getAllProducts()).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(service.getSubscriptionsByAccountId('cus_1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('con clave Stripe configurada', () => {
    let configuredService: StripeService;

    /**
     * Instancia el servicio con clave secreta para ejercitar el cliente mockeado.
     * @returns Servicio con Stripe habilitado
     */
    const createConfiguredService = (): StripeService => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_unit';
      return new StripeService();
    };

    beforeEach(() => {
      resetStripeSdkMocks();
      configuredService = createConfiguredService();
    });

    afterEach(() => {
      delete process.env.STRIPE_SECRET_KEY;
    });

    it('indica que Stripe está configurado', () => {
      expect(configuredService.isStripeConfigured()).toBe(true);
      expect(() => configuredService.assertStripeIsConfigured()).not.toThrow();
    });

    describe('createSubscriptionCheckoutSessionUrl', () => {
      const validCheckoutParams = {
        stripeCustomerId: 'cus_1',
        priceId: 'price_1',
        successUrl: 'https://app.test/ok',
        cancelUrl: 'https://app.test/ko',
        metadata: { enterpriseId: 'ent-1' },
      };

      it('rechaza parámetros vacíos o solo espacios', async () => {
        await expect(
          configuredService.createSubscriptionCheckoutSessionUrl({
            ...validCheckoutParams,
            stripeCustomerId: '  ',
          }),
        ).rejects.toThrow('Parámetros inválidos para crear sesión de Checkout de suscripción.');
        await expect(
          configuredService.createSubscriptionCheckoutSessionUrl({
            ...validCheckoutParams,
            priceId: '',
          }),
        ).rejects.toThrow('Parámetros inválidos para crear sesión de Checkout de suscripción.');
        await expect(
          configuredService.createSubscriptionCheckoutSessionUrl({
            ...validCheckoutParams,
            successUrl: ' ',
          }),
        ).rejects.toThrow('Parámetros inválidos para crear sesión de Checkout de suscripción.');
        await expect(
          configuredService.createSubscriptionCheckoutSessionUrl({
            ...validCheckoutParams,
            cancelUrl: undefined as unknown as string,
          }),
        ).rejects.toThrow('Parámetros inválidos para crear sesión de Checkout de suscripción.');
      });

      it('acepta cantidad indefinida y usa 1 en precios no medidos', async () => {
        mockPricesRetrieve.mockResolvedValue({ recurring: { usage_type: 'licensed' } });
        mockCheckoutSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.test/default' });

        await configuredService.createSubscriptionCheckoutSessionUrl(validCheckoutParams);
        expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            line_items: [{ price: 'price_1', quantity: 1 }],
          }),
        );
      });

      it('lanza si la sesión no incluye la propiedad url', async () => {
        mockPricesRetrieve.mockResolvedValue({ recurring: { usage_type: 'licensed' } });
        mockCheckoutSessionsCreate.mockResolvedValue({});

        await expect(
          configuredService.createSubscriptionCheckoutSessionUrl(validCheckoutParams),
        ).rejects.toThrow('No se pudo obtener la URL de Checkout.');
      });

      it('omite la cantidad en Checkout cuando el precio es medido', async () => {
        mockPricesRetrieve.mockResolvedValue({
          recurring: { usage_type: 'metered' },
        });
        mockCheckoutSessionsCreate.mockResolvedValue({
          url: ' https://checkout.stripe.test/metered ',
        });

        await expect(
          configuredService.createSubscriptionCheckoutSessionUrl({
            ...validCheckoutParams,
            quantity: 9,
          }),
        ).resolves.toBe('https://checkout.stripe.test/metered');
        expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            line_items: [{ price: 'price_1' }],
          }),
        );
      });

      it('usa cantidad 1 si la solicitada no es un entero positivo y cobra el prorrateo de Checkout', async () => {
        mockPricesRetrieve.mockResolvedValue({
          recurring: { usage_type: 'licensed' },
        });
        mockCheckoutSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.test/ok' });

        await configuredService.createSubscriptionCheckoutSessionUrl({
          ...validCheckoutParams,
          quantity: 0,
        });
        expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            line_items: [{ price: 'price_1', quantity: 1 }],
            allow_promotion_codes: true,
            subscription_data: { metadata: validCheckoutParams.metadata },
          }),
        );

        mockCheckoutSessionsCreate.mockClear();
        await configuredService.createSubscriptionCheckoutSessionUrl({
          ...validCheckoutParams,
          quantity: Number.NaN,
        });
        expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            line_items: [{ price: 'price_1', quantity: 1 }],
          }),
        );

        mockCheckoutSessionsCreate.mockClear();
        await configuredService.createSubscriptionCheckoutSessionUrl({
          ...validCheckoutParams,
          quantity: -3,
        });
        expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            line_items: [{ price: 'price_1', quantity: 1 }],
          }),
        );
      });

      it('trunca la cantidad licenciada hacia abajo', async () => {
        mockPricesRetrieve.mockResolvedValue({ recurring: { usage_type: 'licensed' } });
        mockCheckoutSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.test/qty' });

        await configuredService.createSubscriptionCheckoutSessionUrl({
          ...validCheckoutParams,
          quantity: 3.9,
        });
        expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            line_items: [{ price: 'price_1', quantity: 3 }],
          }),
        );
      });

      it('lanza si Stripe no devuelve URL de Checkout', async () => {
        mockPricesRetrieve.mockResolvedValue({ recurring: null });
        mockCheckoutSessionsCreate.mockResolvedValue({ url: '   ' });

        await expect(
          configuredService.createSubscriptionCheckoutSessionUrl(validCheckoutParams),
        ).rejects.toThrow('No se pudo obtener la URL de Checkout.');
      });

      it('relanza errores de Error al crear la sesión', async () => {
        mockPricesRetrieve.mockRejectedValue(new Error('precio inexistente'));

        await expect(
          configuredService.createSubscriptionCheckoutSessionUrl(validCheckoutParams),
        ).rejects.toThrow('precio inexistente');
      });

      it('relanza errores que no son Error al crear la sesión', async () => {
        mockPricesRetrieve.mockRejectedValue('fallo-sdk');

        await expect(
          configuredService.createSubscriptionCheckoutSessionUrl(validCheckoutParams),
        ).rejects.toBe('fallo-sdk');
      });
    });

    describe('getSubscriptionsByCustomerId y getSubscriptionsByAccountId', () => {
      it('página por estado y concatena resultados incluyendo has_more', async () => {
        mockSubscriptionsList
          .mockResolvedValueOnce({
            data: [{ id: 'sub_a1' }, { id: 'sub_a2' }],
            has_more: true,
          })
          .mockResolvedValueOnce({ data: [{ id: 'sub_a3' }], has_more: false })
          .mockResolvedValueOnce({ data: [{ id: 'sub_t1' }], has_more: false });

        const subscriptions = await configuredService.getSubscriptionsByAccountId('cus_1');

        expect(subscriptions.map((subscription) => subscription.id)).toEqual([
          'sub_a1',
          'sub_a2',
          'sub_a3',
          'sub_t1',
        ]);
        expect(mockSubscriptionsList).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            status: 'active',
            starting_after: 'sub_a2',
          }),
        );
      });

      it('detiene la paginación si has_more es verdadero pero no hay id final', async () => {
        mockSubscriptionsList.mockResolvedValue({ data: [], has_more: true });

        await expect(
          configuredService.getSubscriptionsByCustomerId('cus_1', ['active']),
        ).resolves.toEqual([]);
      });

      it('relanza errores de listado como Error y como valor no Error', async () => {
        mockSubscriptionsList.mockRejectedValueOnce(new Error('list-fail'));
        await expect(
          configuredService.getSubscriptionsByCustomerId('cus_1', ['active']),
        ).rejects.toThrow('list-fail');

        mockSubscriptionsList.mockRejectedValueOnce('list-fail-raw');
        await expect(
          configuredService.getSubscriptionsByCustomerId('cus_1', ['active']),
        ).rejects.toBe('list-fail-raw');
      });
    });

    describe('retrieveSubscriptionSchedule', () => {
      it('rechaza un identificador vacío', async () => {
        await expect(configuredService.retrieveSubscriptionSchedule('  ')).rejects.toThrow(
          'Identificador de programación de suscripción Stripe inválido.',
        );
      });

      it('devuelve la programación recuperada', async () => {
        mockSubscriptionSchedulesRetrieve.mockResolvedValue({ id: 'sub_sched_1' });
        await expect(configuredService.retrieveSubscriptionSchedule('sub_sched_1')).resolves.toEqual(
          { id: 'sub_sched_1' },
        );
      });

      it('relanza errores de recuperación (Error y no Error)', async () => {
        mockSubscriptionSchedulesRetrieve.mockRejectedValueOnce(new Error('sched-fail'));
        await expect(configuredService.retrieveSubscriptionSchedule('sub_sched_1')).rejects.toThrow(
          'sched-fail',
        );

        mockSubscriptionSchedulesRetrieve.mockRejectedValueOnce('sched-fail-raw');
        await expect(configuredService.retrieveSubscriptionSchedule('sub_sched_1')).rejects.toBe(
          'sched-fail-raw',
        );
      });
    });

    describe('cancelSubscriptionAtPeriodEnd', () => {
      it('rechaza un identificador vacío', async () => {
        await expect(configuredService.cancelSubscriptionAtPeriodEnd('')).rejects.toThrow(
          'Identificador de suscripción Stripe inválido.',
        );
      });

      it('marca cancel_at_period_end en verdadero', async () => {
        mockSubscriptionsUpdate.mockResolvedValue({ id: 'sub_1', cancel_at_period_end: true });
        await expect(configuredService.cancelSubscriptionAtPeriodEnd('sub_1')).resolves.toEqual(
          expect.objectContaining({ cancel_at_period_end: true }),
        );
        expect(mockSubscriptionsUpdate).toHaveBeenCalledWith('sub_1', {
          cancel_at_period_end: true,
        });
      });

      it('relanza errores de actualización (Error y no Error)', async () => {
        mockSubscriptionsUpdate.mockRejectedValueOnce(new Error('cancel-fail'));
        await expect(configuredService.cancelSubscriptionAtPeriodEnd('sub_1')).rejects.toThrow(
          'cancel-fail',
        );

        mockSubscriptionsUpdate.mockRejectedValueOnce('cancel-fail-raw');
        await expect(configuredService.cancelSubscriptionAtPeriodEnd('sub_1')).rejects.toBe(
          'cancel-fail-raw',
        );
      });
    });

    describe('revokeCancelSubscriptionAtPeriodEnd', () => {
      it('rechaza un identificador vacío', async () => {
        await expect(configuredService.revokeCancelSubscriptionAtPeriodEnd('')).rejects.toThrow(
          'Identificador de suscripción Stripe inválido.',
        );
      });

      it('marca cancel_at_period_end en falso', async () => {
        mockSubscriptionsUpdate.mockResolvedValue({ id: 'sub_1', cancel_at_period_end: false });
        await expect(
          configuredService.revokeCancelSubscriptionAtPeriodEnd('  sub_1  '),
        ).resolves.toEqual(expect.objectContaining({ cancel_at_period_end: false }));
        expect(mockSubscriptionsUpdate).toHaveBeenCalledWith('sub_1', {
          cancel_at_period_end: false,
        });
      });

      it('relanza errores de revocación (Error y no Error)', async () => {
        mockSubscriptionsUpdate.mockRejectedValueOnce(new Error('revoke-fail'));
        await expect(
          configuredService.revokeCancelSubscriptionAtPeriodEnd('sub_1'),
        ).rejects.toThrow('revoke-fail');

        mockSubscriptionsUpdate.mockRejectedValueOnce('revoke-fail-raw');
        await expect(configuredService.revokeCancelSubscriptionAtPeriodEnd('sub_1')).rejects.toBe(
          'revoke-fail-raw',
        );
      });
    });

    describe('getAllProducts', () => {
      it('lista solo productos activos por defecto y recorre páginas', async () => {
        mockProductsList
          .mockResolvedValueOnce({ data: [{ id: 'prod_1' }], has_more: true })
          .mockResolvedValueOnce({ data: [{ id: 'prod_2' }], has_more: false });

        await expect(configuredService.getAllProducts()).resolves.toEqual([
          { id: 'prod_1' },
          { id: 'prod_2' },
        ]);
        expect(mockProductsList).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ active: true, starting_after: undefined }),
        );
        expect(mockProductsList).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ starting_after: 'prod_1' }),
        );
      });

      it('no filtra por activo cuando onlyActive es falso', async () => {
        mockProductsList.mockResolvedValue({ data: [], has_more: false });
        await configuredService.getAllProducts(false);
        expect(mockProductsList).toHaveBeenCalledWith(
          expect.objectContaining({ active: undefined }),
        );
      });

      it('relanza errores de listado de productos (Error y no Error)', async () => {
        mockProductsList.mockRejectedValueOnce(new Error('products-fail'));
        await expect(configuredService.getAllProducts()).rejects.toThrow('products-fail');

        mockProductsList.mockRejectedValueOnce('products-fail-raw');
        await expect(configuredService.getAllProducts()).rejects.toBe('products-fail-raw');
      });
    });

    describe('getProductWithDefaultPriceExpanded', () => {
      it('rechaza un identificador vacío', async () => {
        await expect(configuredService.getProductWithDefaultPriceExpanded(' ')).rejects.toThrow(
          'Identificador de producto Stripe inválido.',
        );
      });

      it('recupera el producto expandiendo default_price', async () => {
        mockProductsRetrieve.mockResolvedValue({ id: 'prod_1', name: 'Plan' });
        await expect(configuredService.getProductWithDefaultPriceExpanded('prod_1')).resolves.toEqual(
          { id: 'prod_1', name: 'Plan' },
        );
        expect(mockProductsRetrieve).toHaveBeenCalledWith('prod_1', {
          expand: ['default_price'],
        });
      });

      it('relanza errores de recuperación (Error y no Error)', async () => {
        mockProductsRetrieve.mockRejectedValueOnce(new Error('prod-fail'));
        await expect(configuredService.getProductWithDefaultPriceExpanded('prod_1')).rejects.toThrow(
          'prod-fail',
        );

        mockProductsRetrieve.mockRejectedValueOnce('prod-fail-raw');
        await expect(configuredService.getProductWithDefaultPriceExpanded('prod_1')).rejects.toBe(
          'prod-fail-raw',
        );
      });
    });

    describe('listActivePricesForProduct', () => {
      it('rechaza un identificador vacío', async () => {
        await expect(configuredService.listActivePricesForProduct('')).rejects.toThrow(
          'Identificador de producto Stripe inválido.',
        );
      });

      it('página precios activos expandiendo tramos', async () => {
        mockPricesList
          .mockResolvedValueOnce({ data: [{ id: 'price_1' }], has_more: true })
          .mockResolvedValueOnce({ data: [{ id: 'price_2' }], has_more: false });

        await expect(configuredService.listActivePricesForProduct('prod_1')).resolves.toEqual([
          { id: 'price_1' },
          { id: 'price_2' },
        ]);
        expect(mockPricesList).toHaveBeenCalledWith(
          expect.objectContaining({
            product: 'prod_1',
            active: true,
            expand: ['data.tiers'],
          }),
        );
      });

      it('relanza errores de listado de precios (Error y no Error)', async () => {
        mockPricesList.mockRejectedValueOnce(new Error('prices-fail'));
        await expect(configuredService.listActivePricesForProduct('prod_1')).rejects.toThrow(
          'prices-fail',
        );

        mockPricesList.mockRejectedValueOnce('prices-fail-raw');
        await expect(configuredService.listActivePricesForProduct('prod_1')).rejects.toBe(
          'prices-fail-raw',
        );
      });
    });

    describe('getSubscriptionWithItemsExpanded', () => {
      it('rechaza un identificador vacío', async () => {
        await expect(configuredService.getSubscriptionWithItemsExpanded('')).rejects.toThrow(
          'Identificador de suscripción Stripe inválido.',
        );
      });

      it('recupera la suscripción expandiendo precio y calendario', async () => {
        mockSubscriptionsRetrieve.mockResolvedValue({ id: 'sub_1' });
        await expect(configuredService.getSubscriptionWithItemsExpanded('sub_1')).resolves.toEqual({
          id: 'sub_1',
        });
        expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith('sub_1', {
          expand: ['items.data.price', 'schedule'],
        });
      });

      it('relanza errores de recuperación (Error y no Error)', async () => {
        mockSubscriptionsRetrieve.mockRejectedValueOnce(new Error('sub-fail'));
        await expect(configuredService.getSubscriptionWithItemsExpanded('sub_1')).rejects.toThrow(
          'sub-fail',
        );

        mockSubscriptionsRetrieve.mockRejectedValueOnce('sub-fail-raw');
        await expect(configuredService.getSubscriptionWithItemsExpanded('sub_1')).rejects.toBe(
          'sub-fail-raw',
        );
      });
    });

    describe('updateSubscriptionPrimaryItemPrice', () => {
      it('rechaza parámetros vacíos', async () => {
        await expect(
          configuredService.updateSubscriptionPrimaryItemPrice({
            subscriptionId: ' ',
            newPriceId: 'price_new',
          }),
        ).rejects.toThrow('Parámetros inválidos para modificar la suscripción.');
        await expect(
          configuredService.updateSubscriptionPrimaryItemPrice({
            subscriptionId: 'sub_1',
            newPriceId: '',
          }),
        ).rejects.toThrow('Parámetros inválidos para modificar la suscripción.');
      });

      it('página precios con has_more pero sin id en el último elemento', async () => {
        mockPricesList.mockResolvedValue({ data: [{}], has_more: true });
        await expect(configuredService.listActivePricesForProduct('prod_1')).resolves.toEqual([{}]);
      });

      it('lanza si no hay ítem principal', async () => {
        mockSubscriptionsRetrieve.mockResolvedValue({ id: 'sub_1', items: { data: [] } });
        await expect(
          configuredService.updateSubscriptionPrimaryItemPrice({
            subscriptionId: 'sub_1',
            newPriceId: 'price_new',
          }),
        ).rejects.toThrow('No se pudo determinar el ítem principal de la suscripción.');
      });

      it('actualiza solo el precio cuando el uso es medido', async () => {
        mockSubscriptionsRetrieve.mockResolvedValue(
          buildLicensedSubscription({ usageType: 'metered', quantity: 4 }),
        );
        mockSubscriptionsUpdate.mockResolvedValue({ id: 'sub_1' });

        await configuredService.updateSubscriptionPrimaryItemPrice({
          subscriptionId: 'sub_1',
          newPriceId: 'price_new',
          quantity: 99,
        });
        expect(mockSubscriptionsUpdate).toHaveBeenCalledWith('sub_1', {
          items: [{ id: 'si_primary', price: 'price_new' }],
          proration_behavior: 'always_invoice',
        });
      });

      it('usa el fallback inmediato sin cantidad cuando el tipo de uso no es licenciado ni medido', async () => {
        mockSubscriptionsRetrieve.mockResolvedValue(
          buildLicensedSubscription({ usageType: 'other' }),
        );
        mockSubscriptionsUpdate.mockResolvedValue({ id: 'sub_1' });

        await configuredService.updateSubscriptionPrimaryItemPrice({
          subscriptionId: 'sub_1',
          newPriceId: 'price_new',
        });
        expect(mockSubscriptionsUpdate).toHaveBeenCalledWith('sub_1', {
          items: [{ id: 'si_primary', price: 'price_new' }],
          proration_behavior: 'always_invoice',
        });
      });

      it('incluye cantidad en el fallback si se informa un entero positivo', async () => {
        mockSubscriptionsRetrieve.mockResolvedValue(
          buildLicensedSubscription({ usageType: 'other' }),
        );
        mockSubscriptionsUpdate.mockResolvedValue({ id: 'sub_1' });

        await configuredService.updateSubscriptionPrimaryItemPrice({
          subscriptionId: 'sub_1',
          newPriceId: 'price_new',
          quantity: 4.8,
        });
        expect(mockSubscriptionsUpdate).toHaveBeenCalledWith('sub_1', {
          items: [{ id: 'si_primary', price: 'price_new', quantity: 4 }],
          proration_behavior: 'always_invoice',
        });
      });

      it('lanza si el precio licenciado actual no se puede resolver', async () => {
        mockSubscriptionsRetrieve.mockResolvedValue(
          buildLicensedSubscription({ priceIdValue: null, quantity: 2 }),
        );
        await expect(
          configuredService.updateSubscriptionPrimaryItemPrice({
            subscriptionId: 'sub_1',
            newPriceId: 'price_new',
          }),
        ).rejects.toThrow('No se pudo resolver el precio actual del ítem principal.');
      });

      it('lanza si el precio licenciado no expone id', async () => {
        mockSubscriptionsRetrieve.mockResolvedValue({
          id: 'sub_1',
          items: {
            data: [
              {
                id: 'si_primary',
                quantity: 2,
                price: { recurring: { usage_type: 'licensed' } },
              },
            ],
          },
        });
        await expect(
          configuredService.updateSubscriptionPrimaryItemPrice({
            subscriptionId: 'sub_1',
            newPriceId: 'price_new',
          }),
        ).rejects.toThrow('No se pudo resolver el precio actual del ítem principal.');
      });

      it('usa el fallback cuando el precio del ítem es una cadena', async () => {
        mockSubscriptionsRetrieve.mockResolvedValue(
          buildLicensedSubscription({ priceAsString: true, itemId: 'si_str' }),
        );
        mockSubscriptionsUpdate.mockResolvedValue({ id: 'sub_1' });

        await configuredService.updateSubscriptionPrimaryItemPrice({
          subscriptionId: 'sub_1',
          newPriceId: 'price_new',
        });
        expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(
          'sub_1',
          expect.objectContaining({
            items: [{ id: 'si_str', price: 'price_new' }],
          }),
        );
      });

      it('usa el fallback cuando el ítem no trae precio', async () => {
        mockSubscriptionsRetrieve.mockResolvedValue({
          id: 'sub_1',
          items: { data: [{ id: 'si_noprice' }] },
        });
        mockSubscriptionsUpdate.mockResolvedValue({ id: 'sub_1' });

        await configuredService.updateSubscriptionPrimaryItemPrice({
          subscriptionId: 'sub_1',
          newPriceId: 'price_new',
          quantity: 0,
        });
        expect(mockSubscriptionsUpdate).toHaveBeenCalledWith('sub_1', {
          items: [{ id: 'si_noprice', price: 'price_new' }],
          proration_behavior: 'always_invoice',
        });
      });

      it('no hace cambios si coinciden precio y cantidad licenciada', async () => {
        mockSubscriptionsRetrieve.mockResolvedValue(
          buildLicensedSubscription({ quantity: 5, priceId: 'price_current' }),
        );

        await configuredService.updateSubscriptionPrimaryItemPrice({
          subscriptionId: 'sub_1',
          newPriceId: 'price_current',
          quantity: 5,
        });
        expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
        expect(mockSubscriptionItemsUpdate).not.toHaveBeenCalled();
      });

      it('usa la cantidad actual si la solicitada no es válida y evita trabajo si el precio no cambia', async () => {
        mockSubscriptionsRetrieve.mockResolvedValue(
          buildLicensedSubscription({ quantity: 3, priceId: 'price_current' }),
        );

        await configuredService.updateSubscriptionPrimaryItemPrice({
          subscriptionId: 'sub_1',
          newPriceId: 'price_current',
          quantity: Number.NaN,
        });
        expect(mockSubscriptionItemsUpdate).not.toHaveBeenCalled();
      });

      it('asume cantidad 1 si Stripe no informa un cupo licenciado válido', async () => {
        mockSubscriptionsRetrieve.mockResolvedValue(
          buildLicensedSubscription({ quantity: 0, priceId: 'price_current' }),
        );

        await configuredService.updateSubscriptionPrimaryItemPrice({
          subscriptionId: 'sub_1',
          newPriceId: 'price_current',
          quantity: 1,
        });
        expect(mockSubscriptionItemsUpdate).not.toHaveBeenCalled();
      });

      it('programa una reducción de cupo reutilizando el calendario existente', async () => {
        const licensedSubscription = buildLicensedSubscription({
          quantity: 10,
          schedule: 'sub_sched_existing',
          currentPeriodEnd: 5_000,
        });
        mockSubscriptionsRetrieve.mockResolvedValue(licensedSubscription);
        mockSubscriptionSchedulesRetrieve.mockResolvedValue({
          id: 'sub_sched_existing',
          phases: [{ start_date: 1_000 }],
        });
        mockSubscriptionSchedulesUpdate.mockResolvedValue({});

        await configuredService.updateSubscriptionPrimaryItemPrice({
          subscriptionId: 'sub_1',
          newPriceId: 'price_new',
          quantity: 4,
        });

        expect(mockSubscriptionSchedulesUpdate).toHaveBeenCalledWith(
          'sub_sched_existing',
          expect.objectContaining({
            end_behavior: 'release',
            proration_behavior: 'none',
            phases: [
              expect.objectContaining({
                start_date: 1_000,
                end_date: 5_000,
                items: [{ price: 'price_current', quantity: 10 }],
              }),
              expect.objectContaining({
                start_date: 5_000,
                items: [{ price: 'price_new', quantity: 4 }],
              }),
            ],
          }),
        );
      });

      it('lanza si el calendario existente no tiene fecha de inicio de fase 0', async () => {
        mockSubscriptionsRetrieve.mockResolvedValue(
          buildLicensedSubscription({
            quantity: 8,
            schedule: { id: 'sub_sched_bad' } as Stripe.SubscriptionSchedule,
          }),
        );
        mockSubscriptionSchedulesRetrieve.mockResolvedValue({
          id: 'sub_sched_bad',
          phases: [{}],
        });

        await expect(
          configuredService.updateSubscriptionPrimaryItemPrice({
            subscriptionId: 'sub_1',
            newPriceId: 'price_new',
            quantity: 2,
          }),
        ).rejects.toThrow(
          'No se pudo leer la fecha de inicio de la fase 0 en la programación de suscripción existente.',
        );
      });

      it('crea un calendario cuando no existía y programa la bajada de cupo', async () => {
        const licensedSubscription = buildLicensedSubscription({
          quantity: 6,
          schedule: null,
          currentPeriodEnd: 9_000,
        });
        mockSubscriptionsRetrieve.mockResolvedValue(licensedSubscription);
        mockSubscriptionSchedulesCreate.mockResolvedValue({ id: 'sub_sched_created' });
        mockSubscriptionSchedulesRetrieve.mockResolvedValue({
          id: 'sub_sched_created',
          phases: [{ start_date: 3_000 }],
        });
        mockSubscriptionSchedulesUpdate.mockResolvedValue({});

        await configuredService.updateSubscriptionPrimaryItemPrice({
          subscriptionId: 'sub_1',
          newPriceId: 'price_future',
          quantity: 2,
        });

        expect(mockSubscriptionSchedulesCreate).toHaveBeenCalledWith({
          from_subscription: 'sub_1',
        });
        expect(mockSubscriptionSchedulesUpdate).toHaveBeenCalledWith(
          'sub_sched_created',
          expect.objectContaining({
            phases: expect.arrayContaining([
              expect.objectContaining({ items: [{ price: 'price_future', quantity: 2 }] }),
            ]),
          }),
        );
      });

      it('lanza si el calendario recién creado no tiene fase 0 usable', async () => {
        mockSubscriptionsRetrieve.mockResolvedValue(
          buildLicensedSubscription({ quantity: 6, schedule: undefined }),
        );
        mockSubscriptionSchedulesCreate.mockResolvedValue({ id: 'sub_sched_created' });
        mockSubscriptionSchedulesRetrieve.mockResolvedValue({
          id: 'sub_sched_created',
          phases: [],
        });

        await expect(
          configuredService.updateSubscriptionPrimaryItemPrice({
            subscriptionId: 'sub_1',
            newPriceId: 'price_new',
            quantity: 1,
          }),
        ).rejects.toThrow(
          'No se pudo leer la fecha de inicio de la fase 0 tras crear la programación de suscripción.',
        );
      });

      it('lanza si no se puede determinar el fin de periodo al programar la bajada', async () => {
        mockSubscriptionsRetrieve
          .mockResolvedValueOnce(buildLicensedSubscription({ quantity: 5, schedule: 'sub_sched_1' }))
          .mockResolvedValueOnce(buildLicensedSubscription({ quantity: 5, schedule: 'sub_sched_1' }))
          .mockResolvedValueOnce(
            buildLicensedSubscription({
              quantity: 5,
              schedule: 'sub_sched_1',
              currentPeriodEnd: Number.NaN,
            }),
          );
        mockSubscriptionSchedulesRetrieve.mockResolvedValue({
          id: 'sub_sched_1',
          phases: [{ start_date: 100 }],
        });

        await expect(
          configuredService.updateSubscriptionPrimaryItemPrice({
            subscriptionId: 'sub_1',
            newPriceId: 'price_new',
            quantity: 1,
          }),
        ).rejects.toThrow(
          'No se pudo determinar el fin del periodo de facturación actual de la suscripción.',
        );
      });

      it('libera un calendario en cadena y aplica ampliación inmediata', async () => {
        const licensedSubscription = buildLicensedSubscription({
          quantity: 3,
          schedule: '  sub_sched_live  ',
        });
        mockSubscriptionsRetrieve.mockResolvedValue(licensedSubscription);
        mockSubscriptionSchedulesRelease.mockResolvedValue({});
        mockSubscriptionItemsUpdate.mockResolvedValue({});

        await configuredService.updateSubscriptionPrimaryItemPrice({
          subscriptionId: 'sub_1',
          newPriceId: 'price_upgrade',
          quantity: 8,
        });

        expect(mockSubscriptionSchedulesRelease).toHaveBeenCalledWith('sub_sched_live');
        expect(mockSubscriptionItemsUpdate).toHaveBeenCalledWith('si_primary', {
          price: 'price_upgrade',
          quantity: 8,
          proration_behavior: 'always_invoice',
        });
      });

      it('aplica ampliación sin liberar calendario si no hay programación adjunta', async () => {
        mockSubscriptionsRetrieve.mockResolvedValue(
          buildLicensedSubscription({
            quantity: 2,
            schedule: {} as Stripe.SubscriptionSchedule,
          }),
        );
        mockSubscriptionItemsUpdate.mockResolvedValue({});

        await configuredService.updateSubscriptionPrimaryItemPrice({
          subscriptionId: 'sub_1',
          newPriceId: 'price_upgrade',
        });

        expect(mockSubscriptionSchedulesRelease).not.toHaveBeenCalled();
        expect(mockSubscriptionItemsUpdate).toHaveBeenCalledWith(
          'si_primary',
          expect.objectContaining({ quantity: 2, price: 'price_upgrade' }),
        );
      });

      it('usa el ítem refrescado tras liberar el calendario si cambia el id', async () => {
        mockSubscriptionsRetrieve
          .mockResolvedValueOnce(
            buildLicensedSubscription({
              itemId: 'si_old',
              quantity: 2,
              schedule: { id: 'sub_sched_obj' } as Stripe.SubscriptionSchedule,
            }),
          )
          .mockResolvedValueOnce(
            buildLicensedSubscription({
              itemId: 'si_new',
              quantity: 2,
              schedule: null,
            }),
          );
        mockSubscriptionSchedulesRelease.mockResolvedValue({});
        mockSubscriptionItemsUpdate.mockResolvedValue({});

        await configuredService.updateSubscriptionPrimaryItemPrice({
          subscriptionId: 'sub_1',
          newPriceId: 'price_upgrade',
          quantity: 4,
        });

        expect(mockSubscriptionItemsUpdate).toHaveBeenCalledWith(
          'si_new',
          expect.objectContaining({ quantity: 4 }),
        );
      });

      it('reutiliza el ítem original si el refrescado no trae identificador', async () => {
        mockSubscriptionsRetrieve
          .mockResolvedValueOnce(
            buildLicensedSubscription({
              itemId: 'si_keep',
              quantity: 2,
              schedule: null,
            }),
          )
          .mockResolvedValueOnce({
            id: 'sub_1',
            items: { data: [{ id: '   ', quantity: 2 }] },
          });
        mockSubscriptionItemsUpdate.mockResolvedValue({});

        await configuredService.updateSubscriptionPrimaryItemPrice({
          subscriptionId: 'sub_1',
          newPriceId: 'price_upgrade',
          quantity: 5,
        });

        expect(mockSubscriptionItemsUpdate).toHaveBeenCalledWith(
          'si_keep',
          expect.objectContaining({ quantity: 5 }),
        );
      });

      it('relanza errores internos como Error y como valor no Error', async () => {
        mockSubscriptionsRetrieve.mockRejectedValueOnce(new Error('update-fail'));
        await expect(
          configuredService.updateSubscriptionPrimaryItemPrice({
            subscriptionId: 'sub_1',
            newPriceId: 'price_new',
          }),
        ).rejects.toThrow('update-fail');

        mockSubscriptionsRetrieve.mockRejectedValueOnce('update-fail-raw');
        await expect(
          configuredService.updateSubscriptionPrimaryItemPrice({
            subscriptionId: 'sub_1',
            newPriceId: 'price_new',
          }),
        ).rejects.toBe('update-fail-raw');
      });
    });

    describe('getProductNamesByIds', () => {
      it('ignora ids vacíos, productos borrados y errores puntuales', async () => {
        mockProductsRetrieve.mockImplementation(async (productId: string) => {
          if (productId === 'prod_deleted') {
            return { id: productId, deleted: true };
          }
          if (productId === 'prod_ok') {
            return { id: productId, name: '  Activo  ' };
          }
          if (productId === 'prod_empty') {
            return { id: productId, name: '   ' };
          }
          if (productId === 'prod_error') {
            throw new Error('no existe');
          }
          if (productId === 'prod_undefined_name') {
            return { id: productId };
          }
          throw 'raw-fail';
        });

        const names = await configuredService.getProductNamesByIds([
          '',
          '  ',
          'prod_deleted',
          'prod_ok',
          'prod_ok',
          'prod_empty',
          'prod_error',
          'prod_raw',
          'prod_undefined_name',
        ]);

        expect(names.get('prod_ok')).toBe('Activo');
        expect(names.get('prod_empty')).toBe('Producto sin nombre');
        expect(names.has('prod_deleted')).toBe(false);
        expect(names.has('prod_error')).toBe(false);
        expect(names.has('prod_raw')).toBe(false);
      });

      it('devuelve mapa vacío si no hay ids válidos', async () => {
        await expect(configuredService.getProductNamesByIds([])).resolves.toEqual(new Map());
      });
    });

    describe('getProductNamesAndMetadataByIds', () => {
      it('omite borrados y errores y normaliza nombre y metadatos', async () => {
        mockProductsRetrieve.mockImplementation(async (productId: string) => {
          if (productId === 'prod_deleted') {
            return { id: productId, deleted: true };
          }
          if (productId === 'prod_ok') {
            return {
              id: productId,
              name: '  Pack  ',
              metadata: { type: 'signings', zone: 'eu' },
            };
          }
          if (productId === 'prod_empty') {
            return { id: productId, name: undefined, metadata: null };
          }
          if (productId === 'prod_error') {
            throw new Error('retrieve fail');
          }
          throw 'raw-meta-fail';
        });

        const details = await configuredService.getProductNamesAndMetadataByIds([
          '  prod_ok  ',
          'prod_ok',
          'prod_empty',
          'prod_deleted',
          'prod_error',
          'prod_raw',
          '',
        ]);

        expect(details.get('prod_ok')).toEqual({
          name: 'Pack',
          metadataEntries: [
            { key: 'type', value: 'signings' },
            { key: 'zone', value: 'eu' },
          ],
        });
        expect(details.get('prod_empty')).toEqual({
          name: 'Producto sin nombre',
          metadataEntries: [],
        });
        expect(details.has('prod_deleted')).toBe(false);
      });
    });
  });
});
