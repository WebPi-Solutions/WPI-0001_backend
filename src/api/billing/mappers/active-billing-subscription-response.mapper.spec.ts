import { ActiveBillingSubscriptionResponseMapper } from './active-billing-subscription-response.mapper';
import { BillingSubscriptionPresentation } from '../types/billing-subscription-presentation';

describe('ActiveBillingSubscriptionResponseMapper', () => {
  /**
   * Construye una presentación de suscripción de prueba.
   * @param overrides - Campos a sobrescribir
   * @returns Vista intermedia lista para mapear
   */
  const buildPresentation = (
    overrides: Partial<BillingSubscriptionPresentation> = {},
  ): BillingSubscriptionPresentation => ({
    subscriptionId: 'sub_123',
    status: 'active',
    product: {
      name: 'Fichajes',
      metadata: [{ key: 'module', value: 'signings' }],
    },
    usage: { used: 3, max: 10 },
    billingInterval: { type: 'month', count: 1 },
    currentPeriod: {
      start: '2026-05-01T12:00:00.000Z',
      end: '2026-06-01T12:00:00.000Z',
    },
    renewsAtIso: '2026-06-01T12:00:00.000Z',
    cancelAtPeriodEnd: false,
    scheduledLicensedQuotaReduction: null,
    ...overrides,
  });

  it('mapea renewsAtIso al campo público renewsAt', () => {
    const dto = ActiveBillingSubscriptionResponseMapper.toResponseDto(buildPresentation());

    expect(dto.subscriptionId).toBe('sub_123');
    expect(dto.renewsAt).toBe('2026-06-01T12:00:00.000Z');
    expect(dto.scheduledLicensedQuotaReduction).toBeNull();
    expect(dto.usage).toEqual({ used: 3, max: 10 });
  });

  it('expone la reducción de cupo programada cuando existe', () => {
    const dto = ActiveBillingSubscriptionResponseMapper.toResponseDto(
      buildPresentation({
        scheduledLicensedQuotaReduction: {
          nextMaxUsers: 5,
          effectiveAtIso: '2026-07-01T12:00:00.000Z',
        },
      }),
    );

    expect(dto.scheduledLicensedQuotaReduction).toEqual({
      nextMaxUsers: 5,
      effectiveAtIso: '2026-07-01T12:00:00.000Z',
    });
  });

  it('convierte una lista de presentaciones conservando el orden', () => {
    const dtos = ActiveBillingSubscriptionResponseMapper.toResponseDtos([
      buildPresentation({ subscriptionId: 'sub_a' }),
      buildPresentation({ subscriptionId: 'sub_b' }),
    ]);

    expect(dtos.map((dto) => dto.subscriptionId)).toEqual(['sub_a', 'sub_b']);
  });
});
