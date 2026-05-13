import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { BillingProductMetadataEntryDto } from './active-billing-subscription-response.dto';

/**
 * DTO de precio recurrente **sin tramos**: suscripción estándar por unidad (Stripe `per_unit`).
 * No incluye `tiers` ni `tiersMode` en el contrato HTTP.
 */
export class BillingPerUnitRecurringPriceDto {
  @ApiProperty({ description: 'Identificador de precio en Stripe (`price_...`).' })
  @Expose()
  priceId: string;

  @ApiProperty({ description: 'Divisa del precio (p. ej. `eur`).', example: 'eur' })
  @Expose()
  currency: string;

  @ApiProperty({
    description: 'Intervalo de facturación (`month` o `year`) si es recurrente.',
    example: 'month',
  })
  @Expose()
  interval: string;

  @ApiProperty({
    description: 'Multiplicador del intervalo (p. ej. 1 mes, 12 meses).',
    example: 1,
  })
  @Expose()
  intervalCount: number;

  @ApiProperty({
    description:
      'Tipo de uso del precio recurrente (`licensed` o `metered`). Determina si en Checkout se puede enviar `quantity`.',
    example: 'licensed',
    nullable: true,
  })
  @Expose()
  usageType: string | null;

  @ApiProperty({
    description: 'Importe unitario en unidad menor (p. ej. céntimos) por licencia o unidad facturada.',
    example: 1500,
    nullable: true,
  })
  @Expose()
  unitAmount: number | null;

  @ApiProperty({
    description: 'Esquema de facturación de Stripe; en este catálogo suele ser `per_unit`.',
    example: 'per_unit',
  })
  @Expose()
  billingScheme: string;
}

/**
 * DTO de producto Stripe con precios recurrentes **sin tramos** (catálogo gestión / management).
 */
export class BillingPerUnitProductWithPricesResponseDto {
  @ApiProperty({
    description: 'Identificador del producto en Stripe (`prod_...`).',
    example: 'prod_ABC123',
  })
  @Expose()
  productId: string;

  @ApiProperty({
    description: 'Nombre del producto.',
    example: 'Suscripción facturación',
  })
  @Expose()
  name: string;

  @ApiProperty({
    description: 'Metadatos del producto Stripe (clave y valor).',
    type: [BillingProductMetadataEntryDto],
  })
  @Expose()
  @Type(() => BillingProductMetadataEntryDto)
  metadata: BillingProductMetadataEntryDto[];

  @ApiProperty({
    description:
      'Precios recurrentes activos del producto (mensual/anual), sin estructura de escalones.',
    type: [BillingPerUnitRecurringPriceDto],
  })
  @Expose()
  @Type(() => BillingPerUnitRecurringPriceDto)
  prices: BillingPerUnitRecurringPriceDto[];
}
