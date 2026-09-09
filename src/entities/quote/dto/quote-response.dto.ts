import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { ConceptResponseDto } from 'src/common/dto/concept-response.dto';
import { ClientResponseDto } from 'src/entities/client/dto/client-response.dto';
import { QuoteStatus } from '../quote.entity';

/**
 * Vista pública de cotización para respuestas HTTP.
 * No incluye la colección `invoices` porque el frontend no la consume.
 */
export class QuoteResponseDto {
  /**
   * Identificador único de la cotización
   */
  @ApiProperty({ description: 'UUID de la cotización' })
  @Expose()
  id: string;

  /**
   * Cliente asociado
   */
  @ApiProperty({ description: 'UUID del cliente' })
  @Expose()
  clientId: string;

  /**
   * Nombre de la cotización
   */
  @ApiProperty({ description: 'Nombre de la cotización' })
  @Expose()
  name: string;

  /**
   * Fecha de emisión
   */
  @ApiProperty({ description: 'Fecha de emisión' })
  @Expose()
  issuedDate: Date;

  /**
   * Fecha de formalización
   */
  @ApiProperty({ description: 'Fecha de formalización' })
  @Expose()
  formalizationDate: Date;

  /**
   * Líneas de concepto
   */
  @ApiProperty({
    description: 'Conceptos de la cotización',
    type: [ConceptResponseDto],
  })
  @Expose()
  @Type(() => ConceptResponseDto)
  concepts: ConceptResponseDto[];

  /**
   * Estado de la cotización
   */
  @ApiProperty({ description: 'Estado de la cotización', enum: QuoteStatus })
  @Expose()
  status: QuoteStatus;

  /**
   * Instantánea del nombre del cliente
   */
  @ApiProperty({
    description: 'Nombre del cliente congelado en la cotización',
    required: false,
    nullable: true,
  })
  @Expose()
  clientName: string | null;

  /**
   * Instantánea del NIF del cliente
   */
  @ApiProperty({
    description: 'NIF del cliente congelado en la cotización',
    required: false,
    nullable: true,
  })
  @Expose()
  clientNif: string | null;

  /**
   * Instantánea de la dirección del cliente
   */
  @ApiProperty({
    description: 'Dirección del cliente congelada en la cotización',
    required: false,
    nullable: true,
  })
  @Expose()
  clientAddress: string | null;

  /**
   * Instantánea del nombre del emisor
   */
  @ApiProperty({
    description: 'Nombre del emisor congelado en la cotización',
    required: false,
    nullable: true,
  })
  @Expose()
  issuerName: string | null;

  /**
   * Instantánea del NIF del emisor
   */
  @ApiProperty({
    description: 'NIF del emisor congelado en la cotización',
    required: false,
    nullable: true,
  })
  @Expose()
  issuerNif: string | null;

  /**
   * Instantánea de la dirección del emisor
   */
  @ApiProperty({
    description: 'Dirección del emisor congelada en la cotización',
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
}
