import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { BillingProductMetadataEntryDto } from './active-billing-subscription-response.dto';

/**
 * DTO de producto Stripe apto para crear una suscripción desde el frontend.
 * Incluye el `defaultPriceId` para poder iniciar un Checkout de suscripción.
 */
export class BillingProductForSubscriptionResponseDto {
  /**
   * Identificador del producto en Stripe (`prod_...`).
   */
  @ApiProperty({
    description: 'Identificador del producto en Stripe (`prod_...`).',
    example: 'prod_ABC123',
  })
  @Expose()
  productId: string;

  /**
   * Nombre comercial del producto.
   */
  @ApiProperty({
    description: 'Nombre legible del producto en Stripe.',
    example: 'Suscripción fichajes',
  })
  @Expose()
  name: string;

  /**
   * Metadatos del producto como lista de pares clave–valor.
   */
  @ApiProperty({
    description: 'Metadatos del producto Stripe (clave y valor).',
    type: [BillingProductMetadataEntryDto],
  })
  @Expose()
  @Type(() => BillingProductMetadataEntryDto)
  metadata: BillingProductMetadataEntryDto[];

  /**
   * Identificador del precio por defecto del producto (`price_...`), necesario para Checkout.
   */
  @ApiProperty({
    description:
      'Identificador del precio por defecto del producto (`price_...`). Se usa para iniciar el Checkout de suscripción.',
    example: 'price_1234567890abcdef',
  })
  @Expose()
  defaultPriceId: string;
}

