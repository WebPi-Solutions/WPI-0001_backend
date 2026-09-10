import { coverDtoClass } from 'src/test-utils/cover-data-classes';
import {
  ActiveBillingSubscriptionResponseDto,
  BillingProductMetadataEntryDto,
  BillingScheduledLicensedQuotaReductionDto,
  BillingSubscriptionCurrentPeriodDto,
  BillingSubscriptionProductDto,
} from './active-billing-subscription-response.dto';
import {
  BillingPerUnitProductWithPricesResponseDto,
  BillingPerUnitRecurringPriceDto,
} from './billing-per-unit-product-with-prices-response.dto';
import { BillingProductForSubscriptionResponseDto } from './billing-product-for-subscription-response.dto';
import {
  BillingPriceTierDto,
  BillingTieredProductWithPricesResponseDto,
  BillingTieredRecurringPriceDto,
} from './billing-tiered-product-with-prices-response.dto';

/**
 * Cubre constructores y factorías `@Type` de los DTO de facturación Stripe.
 */
describe('DTO de respuesta de billing', () => {
  it('debe instanciar metadatos, producto y suscripción activa', () => {
    const metadata = coverDtoClass(BillingProductMetadataEntryDto, {
      key: 'plan_code',
      value: 'enterprise',
    });
    const product = coverDtoClass(BillingSubscriptionProductDto, {
      name: 'Suscripción fichajes',
      metadata: [metadata],
    });
    const period = coverDtoClass(BillingSubscriptionCurrentPeriodDto, {
      start: '2026-05-01T12:00:00.000Z',
      end: '2026-06-01T12:00:00.000Z',
    });
    const quotaReduction = coverDtoClass(BillingScheduledLicensedQuotaReductionDto, {
      nextMaxUsers: 5,
      effectiveAtIso: '2026-06-01T12:00:00.000Z',
    });
    const subscription = coverDtoClass(ActiveBillingSubscriptionResponseDto, {
      subscriptionId: 'sub_123',
      status: 'active',
      product,
      billingInterval: { type: 'month', count: 1 },
      usage: { used: 3, max: 10 },
      currentPeriod: period,
      renewsAt: '2026-06-01T12:00:00.000Z',
      cancelAtPeriodEnd: false,
      scheduledLicensedQuotaReduction: quotaReduction,
    });

    expect(subscription.subscriptionId).toBe('sub_123');
    expect(subscription.product.name).toBe('Suscripción fichajes');
    expect(subscription.scheduledLicensedQuotaReduction?.nextMaxUsers).toBe(5);
  });

  it('debe instanciar el producto apto para suscripción', () => {
    const dto = coverDtoClass(BillingProductForSubscriptionResponseDto, {
      productId: 'prod_ABC123',
      name: 'Suscripción fichajes',
      metadata: [{ key: 'module', value: 'signings' }],
      defaultPriceId: 'price_123',
    });

    expect(dto.defaultPriceId).toBe('price_123');
    expect(dto.metadata[0].key).toBe('module');
  });

  it('debe instanciar el catálogo per-unit con precios', () => {
    const price = coverDtoClass(BillingPerUnitRecurringPriceDto, {
      priceId: 'price_unit',
      currency: 'eur',
      interval: 'month',
      intervalCount: 1,
      usageType: 'licensed',
      unitAmount: 1500,
      billingScheme: 'per_unit',
    });
    const product = coverDtoClass(BillingPerUnitProductWithPricesResponseDto, {
      productId: 'prod_management',
      name: 'Suscripción facturación',
      metadata: [{ key: 'catalog', value: 'management' }],
      prices: [price],
    });

    expect(product.prices[0].billingScheme).toBe('per_unit');
    expect(product.prices[0].unitAmount).toBe(1500);
  });

  it('debe instanciar el catálogo por tramos con escalones', () => {
    const tier = coverDtoClass(BillingPriceTierDto, {
      upTo: 10,
      unitAmount: 500,
      flatAmount: 0,
    });
    const openTier = coverDtoClass(BillingPriceTierDto, {
      upTo: null,
      unitAmount: 300,
      flatAmount: null,
    });
    const price = coverDtoClass(BillingTieredRecurringPriceDto, {
      priceId: 'price_tiered',
      currency: 'eur',
      interval: 'year',
      intervalCount: 1,
      usageType: 'licensed',
      unitAmount: null,
      billingScheme: 'tiered',
      tiersMode: 'graduated',
      tiers: [tier, openTier],
    });
    const product = coverDtoClass(BillingTieredProductWithPricesResponseDto, {
      productId: 'prod_signings',
      name: 'Suscripción fichajes',
      metadata: [{ key: 'catalog', value: 'signings' }],
      prices: [price],
    });

    expect(product.prices[0].tiersMode).toBe('graduated');
    expect(product.prices[0].tiers[0].upTo).toBe(10);
    expect(product.prices[0].tiers[1].upTo).toBeNull();
  });
});
