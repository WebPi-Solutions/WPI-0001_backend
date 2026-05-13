import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { BillingProductMetadataEntryDto } from './active-billing-subscription-response.dto';

/**
 * DTO de escalón (tier) de un precio en Stripe.
 * Se usa en catálogos con facturación por tramos (p. ej. módulo de fichajes).
 */
export class BillingPriceTierDto {
  @ApiProperty({
    description:
      'Cantidad máxima cubierta por este escalón. `null` indica “sin límite” (último tramo).',
    example: 10,
    nullable: true,
  })
  @Expose()
  upTo: number | null;

  @ApiProperty({
    description: 'Importe unitario en la divisa del precio (en la unidad menor, p. ej. céntimos).',
    example: 500,
    nullable: true,
  })
  @Expose()
  unitAmount: number | null;

  @ApiProperty({
    description:
      'Importe fijo por escalón (en la unidad menor). Normalmente `null` cuando se usa `unit_amount`.',
    example: 0,
    nullable: true,
  })
  @Expose()
  flatAmount: number | null;
}

/**
 * DTO de precio recurrente con soporte de escalones (Stripe `tiered`).
 * Pensado para suscripciones cuyo catálogo se expresa por tramos.
 */
export class BillingTieredRecurringPriceDto {
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
    description:
      'Importe unitario del precio (si aplica) en unidad menor. Puede ser null si el precio es solo por escalones.',
    example: 1000,
    nullable: true,
  })
  @Expose()
  unitAmount: number | null;

  @ApiProperty({
    description: 'Esquema de facturación de Stripe (`per_unit` o `tiered`).',
    example: 'tiered',
  })
  @Expose()
  billingScheme: string;

  @ApiProperty({
    description:
      'Modo de escalones cuando `billingScheme` es `tiered` (`graduated` o `volume`).',
    example: 'graduated',
    nullable: true,
  })
  @Expose()
  tiersMode: string | null;

  @ApiProperty({
    description: 'Lista de escalones cuando el precio es `tiered`. Si no aplica, lista vacía.',
    type: [BillingPriceTierDto],
  })
  @Expose()
  @Type(() => BillingPriceTierDto)
  tiers: BillingPriceTierDto[];
}

/**
 * DTO de producto Stripe con precios recurrentes **por tramos** (catálogo fichajes / signings).
 */
export class BillingTieredProductWithPricesResponseDto {
  @ApiProperty({
    description: 'Identificador del producto en Stripe (`prod_...`).',
    example: 'prod_ABC123',
  })
  @Expose()
  productId: string;

  @ApiProperty({
    description: 'Nombre del producto.',
    example: 'Suscripción fichajes',
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
      'Precios recurrentes activos del producto (mensual/anual) incluyendo escalones cuando existan.',
    type: [BillingTieredRecurringPriceDto],
  })
  @Expose()
  @Type(() => BillingTieredRecurringPriceDto)
  prices: BillingTieredRecurringPriceDto[];
}
