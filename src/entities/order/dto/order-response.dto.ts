import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { OrderStatus } from 'src/common/enums';
import { ClientResponseDto } from 'src/entities/client/dto/client-response.dto';
import { OrderConceptResponseDto } from 'src/entities/order-concept/dto/order-concept-response.dto';
import { QuoteResponseDto } from 'src/entities/quote/dto/quote-response.dto';

/**
 * Vista pública de pedido para respuestas HTTP.
 */
export class OrderResponseDto {
  /**
   * Identificador único del pedido
   */
  @ApiProperty({ description: 'UUID del pedido' })
  @Expose()
  id: string;

  /**
   * Cliente asociado
   */
  @ApiProperty({ description: 'UUID del cliente' })
  @Expose()
  clientId: string;

  /**
   * Presupuesto de origen
   */
  @ApiProperty({ description: 'UUID del presupuesto' })
  @Expose()
  quoteId: string;

  /**
   * Nombre o referencia del pedido
   */
  @ApiProperty({ description: 'Nombre del pedido' })
  @Expose()
  name: string;

  /**
   * Fecha del pedido
   */
  @ApiProperty({ description: 'Fecha del pedido' })
  @Expose()
  date: Date;

  /**
   * Líneas de concepto persistidas en `order_concepts`
   */
  @ApiProperty({
    description: 'Conceptos del pedido',
    type: [OrderConceptResponseDto],
    required: false,
  })
  @Expose()
  @Type(() => OrderConceptResponseDto)
  orderConcepts?: OrderConceptResponseDto[];

  /**
   * Estado del pedido
   */
  @ApiProperty({ description: 'Estado del pedido', enum: OrderStatus })
  @Expose()
  status: OrderStatus;

  /**
   * Instantánea del nombre del cliente
   */
  @ApiProperty({
    description: 'Nombre del cliente congelado en el pedido',
    required: false,
    nullable: true,
  })
  @Expose()
  clientName: string | null;

  /**
   * Instantánea del NIF del cliente
   */
  @ApiProperty({
    description: 'NIF del cliente congelado en el pedido',
    required: false,
    nullable: true,
  })
  @Expose()
  clientNif: string | null;

  /**
   * Instantánea de la dirección del cliente
   */
  @ApiProperty({
    description: 'Dirección del cliente congelada en el pedido',
    required: false,
    nullable: true,
  })
  @Expose()
  clientAddress: string | null;

  /**
   * Instantánea del nombre del emisor
   */
  @ApiProperty({
    description: 'Nombre del emisor congelado en el pedido',
    required: false,
    nullable: true,
  })
  @Expose()
  issuerName: string | null;

  /**
   * Instantánea del NIF del emisor
   */
  @ApiProperty({
    description: 'NIF del emisor congelado en el pedido',
    required: false,
    nullable: true,
  })
  @Expose()
  issuerNif: string | null;

  /**
   * Instantánea de la dirección del emisor
   */
  @ApiProperty({
    description: 'Dirección del emisor congelada en el pedido',
    required: false,
    nullable: true,
  })
  @Expose()
  issuerAddress: string | null;

  /**
   * Fecha de creación
   */
  @ApiProperty({ description: 'Fecha de creación del registro' })
  @Expose()
  createdAt: Date;

  /**
   * Fecha de última actualización
   */
  @ApiProperty({ description: 'Fecha de última actualización' })
  @Expose()
  updatedAt: Date;

  /**
   * Cliente cargado cuando se solicita la relación `client`
   */
  @ApiProperty({
    description: 'Cliente asociado (vista pública)',
    type: () => ClientResponseDto,
    required: false,
  })
  @Expose()
  @Type(() => ClientResponseDto)
  client?: ClientResponseDto;

  /**
   * Presupuesto cargado cuando se solicita la relación `quote`
   */
  @ApiProperty({
    description: 'Presupuesto de origen (vista pública)',
    type: () => QuoteResponseDto,
    required: false,
  })
  @Expose()
  @Type(() => QuoteResponseDto)
  quote?: QuoteResponseDto;
}
