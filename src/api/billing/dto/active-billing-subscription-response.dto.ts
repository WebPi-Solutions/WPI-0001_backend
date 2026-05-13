import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

/**
 * Par clave–valor de metadatos del producto Stripe (orden estable en backend).
 */
export class BillingProductMetadataEntryDto {
  /**
   * Clave del metadato en Stripe.
   */
  @ApiProperty({
    description: 'Clave del metadato del producto en Stripe',
    example: 'plan_code',
  })
  @Expose()
  key: string;

  /**
   * Valor asociado a la clave.
   */
  @ApiProperty({
    description: 'Valor del metadato',
    example: 'enterprise',
  })
  @Expose()
  value: string;
}

/**
 * Bloque de producto asociado a la suscripción (nombre y metadatos expuestos al cliente).
 */
export class BillingSubscriptionProductDto {
  /**
   * Nombre comercial del producto.
   */
  @ApiProperty({
    description: 'Nombre legible del producto de Stripe',
    example: 'Suscripción fichajes',
  })
  @Expose()
  name: string;

  /**
   * Metadatos del producto como lista ordenada por clave.
   */
  @ApiProperty({
    description: 'Metadatos del producto Stripe (clave y valor)',
    type: [BillingProductMetadataEntryDto],
  })
  @Expose()
  @Type(() => BillingProductMetadataEntryDto)
  metadata: BillingProductMetadataEntryDto[];
}

/**
 * Reducción de cupo de usuarios contratada en Stripe para aplicarse tras una renovación.
 */
export class BillingScheduledLicensedQuotaReductionDto {
  /**
   * Máximo de usuarios (cantidad licenciada) tras la fecha efectiva.
   */
  @ApiProperty({
    description: 'Nuevo tope de usuarios licenciados tras la renovación programada',
    example: 5,
  })
  @Expose()
  nextMaxUsers: number;

  /**
   * Momento en que aplicará el nuevo cupo (ISO 8601, UTC).
   */
  @ApiProperty({
    description: 'Fecha/hora en que Stripe aplicará la nueva cantidad licenciada (ISO 8601)',
    example: '2026-06-01T12:00:00.000Z',
  })
  @Expose()
  effectiveAtIso: string;
}

/**
 * Periodo de facturación actual de la suscripción.
 */
export class BillingSubscriptionCurrentPeriodDto {
  /**
   * Inicio del periodo actual (ISO 8601).
   */
  @ApiProperty({
    description: 'Inicio del periodo de facturación actual (ISO 8601)',
    example: '2026-05-01T12:00:00.000Z',
  })
  @Expose()
  start: string;

  /**
   * Fin del periodo actual (ISO 8601).
   */
  @ApiProperty({
    description: 'Fin del periodo de facturación actual (ISO 8601)',
    example: '2026-06-01T12:00:00.000Z',
  })
  @Expose()
  end: string;
}

/**
 * Respuesta pública de una suscripción Stripe activa o en prueba.
 */
export class ActiveBillingSubscriptionResponseDto {
  /**
   * Identificador de la suscripción en Stripe (`sub_...`).
   */
  @ApiProperty({
    description: 'Identificador de suscripción en Stripe (`sub_...`).',
    example: 'sub_1234567890abcdef',
  })
  @Expose()
  subscriptionId: string;

  /**
   * Estado de la suscripción en Stripe (p. ej. `active`, `trialing`).
   */
  @ApiProperty({
    description: 'Estado de la suscripción en Stripe',
    example: 'active',
  })
  @Expose()
  status: string;

  /**
   * Producto principal (nombre y metadatos).
   */
  @ApiProperty({
    description: 'Producto principal asociado a la línea de suscripción',
    type: BillingSubscriptionProductDto,
  })
  @Expose()
  @Type(() => BillingSubscriptionProductDto)
  product: BillingSubscriptionProductDto;

  /**
   * Intervalo de facturación del precio principal (tipo + multiplicador).
   */
  @ApiProperty({
    description:
      'Intervalo de facturación del precio principal con su multiplicador (p. ej. mensual, anual, etc.).',
    example: { type: 'month', count: 1 },
    nullable: true,
  })
  @Expose()
  billingInterval: { type: string; count: number } | null;

  /**
   * Uso de unidades (consumidas vs máximo) para la empresa.
   */
  @ApiProperty({
    description:
      'Uso de unidades (consumidas vs máximo) asociado a la suscripción para la empresa.',
    example: { used: 3, max: 10 },
  })
  @Expose()
  usage: { used: number; max: number };

  /**
   * Periodo de facturación actual.
   */
  @ApiProperty({
    description: 'Inicio y fin del periodo de facturación actual',
    type: BillingSubscriptionCurrentPeriodDto,
  })
  @Expose()
  @Type(() => BillingSubscriptionCurrentPeriodDto)
  currentPeriod: BillingSubscriptionCurrentPeriodDto;

  /**
   * Próxima renovación o facturación esperada (ISO 8601).
   */
  @ApiProperty({
    description:
      'Fecha/hora esperada de la próxima renovación o facturación (ISO 8601); suele coincidir con el fin del periodo actual',
    example: '2026-06-01T12:00:00.000Z',
  })
  @Expose()
  renewsAt: string;

  /**
   * Indica si la suscripción está marcada para cancelarse al final del periodo actual.
   */
  @ApiProperty({
    description: 'Si la suscripción se cancelará al final del periodo actual',
    example: false,
  })
  @Expose()
  cancelAtPeriodEnd: boolean;

  /**
   * Si existe, indica que el cupo de usuarios bajará en la próxima renovación (sin reembolso en el periodo actual).
   */
  @ApiProperty({
    description:
      'Reducción de cupo licenciado programada en Stripe; al renovar, el máximo de usuarios será `nextMaxUsers`.',
    type: BillingScheduledLicensedQuotaReductionDto,
    nullable: true,
  })
  @Expose()
  @Type(() => BillingScheduledLicensedQuotaReductionDto)
  scheduledLicensedQuotaReduction: BillingScheduledLicensedQuotaReductionDto | null;
}
