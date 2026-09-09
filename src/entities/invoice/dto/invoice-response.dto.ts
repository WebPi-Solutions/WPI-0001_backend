import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { ConceptResponseDto } from 'src/common/dto/concept-response.dto';
import { ClientResponseDto } from 'src/entities/client/dto/client-response.dto';
import { InvoiceSeriesResponseDto } from 'src/entities/invoice-series/dto/invoice-series-response.dto';
import { InvoiceStatus } from '../invoice.entity';

/**
 * Vista pública de factura para respuestas HTTP.
 * Omite `quoteId`/`quote` (el frontend no los usa) y la relación `recurrentEarning`
 * (solo se envía el FK `recurrentEarningId` que el frontend escribe al generar desde plantilla).
 */
export class InvoiceResponseDto {
  /**
   * Identificador único de la factura
   */
  @ApiProperty({ description: 'UUID de la factura' })
  @Expose()
  id: string;

  /**
   * Cliente asociado
   */
  @ApiProperty({ description: 'UUID del cliente' })
  @Expose()
  clientId: string;

  /**
   * Serie asociada (siempre presente)
   */
  @ApiProperty({ description: 'UUID de la serie de factura' })
  @Expose()
  seriesId: string;

  /**
   * Plantilla de ingreso recurrente de origen (opcional)
   */
  @ApiProperty({
    description: 'UUID del ingreso recurrente de origen',
    required: false,
    nullable: true,
  })
  @Expose()
  recurrentEarningId: string | null;

  /**
   * Número secuencial dentro de la serie
   */
  @ApiProperty({
    description: 'Número de serie',
    required: false,
    nullable: true,
  })
  @Expose()
  seriesNumber: number | null;

  /**
   * Nombre de la factura
   */
  @ApiProperty({ description: 'Nombre de la factura' })
  @Expose()
  name: string;

  /**
   * Fecha de emisión
   */
  @ApiProperty({ description: 'Fecha de emisión' })
  @Expose()
  issuedDate: Date;

  /**
   * Fecha de cobro
   */
  @ApiProperty({ description: 'Fecha de cobro' })
  @Expose()
  collectionDate: Date;

  /**
   * Líneas de concepto
   */
  @ApiProperty({
    description: 'Conceptos de la factura',
    type: [ConceptResponseDto],
  })
  @Expose()
  @Type(() => ConceptResponseDto)
  concepts: ConceptResponseDto[];

  /**
   * Estado de la factura
   */
  @ApiProperty({ description: 'Estado de la factura', enum: InvoiceStatus })
  @Expose()
  status: InvoiceStatus;

  /**
   * Instantánea del nombre del cliente en el momento de emisión
   */
  @ApiProperty({
    description: 'Nombre del cliente congelado en la factura',
    required: false,
    nullable: true,
  })
  @Expose()
  clientName: string | null;

  /**
   * Instantánea del NIF del cliente
   */
  @ApiProperty({
    description: 'NIF del cliente congelado en la factura',
    required: false,
    nullable: true,
  })
  @Expose()
  clientNif: string | null;

  /**
   * Instantánea de la dirección del cliente
   */
  @ApiProperty({
    description: 'Dirección del cliente congelada en la factura',
    required: false,
    nullable: true,
  })
  @Expose()
  clientAddress: string | null;

  /**
   * Instantánea del nombre del emisor
   */
  @ApiProperty({
    description: 'Nombre del emisor congelado en la factura',
    required: false,
    nullable: true,
  })
  @Expose()
  issuerName: string | null;

  /**
   * Instantánea del NIF del emisor
   */
  @ApiProperty({
    description: 'NIF del emisor congelado en la factura',
    required: false,
    nullable: true,
  })
  @Expose()
  issuerNif: string | null;

  /**
   * Instantánea de la dirección del emisor
   */
  @ApiProperty({
    description: 'Dirección del emisor congelada en la factura',
    required: false,
    nullable: true,
  })
  @Expose()
  issuerAddress: string | null;

  /**
   * Instantánea de la cuenta bancaria del emisor
   */
  @ApiProperty({
    description: 'Cuenta bancaria del emisor congelada en la factura',
    required: false,
    nullable: true,
  })
  @Expose()
  issuerBankAccount: string | null;

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
   * Serie cargada cuando se solicita la relación `series`
   */
  @ApiProperty({
    description: 'Serie asociada (vista pública)',
    type: () => InvoiceSeriesResponseDto,
    required: false,
  })
  @Expose()
  @Type(() => InvoiceSeriesResponseDto)
  series?: InvoiceSeriesResponseDto;
}
