import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { ConceptResponseDto } from 'src/common/dto/concept-response.dto';
import { ClientResponseDto } from 'src/entities/client/dto/client-response.dto';
import { EnterpriseResponseDto } from 'src/entities/enterprise/dto/enterprise-response.dto';
import { InvoiceResponseDto } from 'src/entities/invoice/dto/invoice-response.dto';
import { InvoiceSeriesResponseDto } from 'src/entities/invoice-series/dto/invoice-series-response.dto';
import { RecurrentEarningType } from '../recurrent-earning.entity';

/**
 * Vista pública de ingreso recurrente para respuestas HTTP.
 * Incluye las relaciones que el frontend solicita (`client`, `invoiceSeries`, `enterprise`, `invoices`).
 * No anida `recurrentEarning` dentro de cada factura para evitar ciclos de serialización.
 */
export class RecurrentEarningResponseDto {
  /**
   * Identificador único del ingreso recurrente
   */
  @ApiProperty({ description: 'UUID del ingreso recurrente' })
  @Expose()
  id: string;

  /**
   * Empresa propietaria
   */
  @ApiProperty({ description: 'UUID de la empresa propietaria' })
  @Expose()
  enterpriseId: string;

  /**
   * Serie usada al generar cada factura
   */
  @ApiProperty({ description: 'UUID de la serie de factura' })
  @Expose()
  invoiceSerieId: string;

  /**
   * Cliente facturado
   */
  @ApiProperty({ description: 'UUID del cliente' })
  @Expose()
  clientId: string;

  /**
   * Periodicidad
   */
  @ApiProperty({
    description: 'Periodicidad del ingreso recurrente',
    enum: RecurrentEarningType,
  })
  @Expose()
  type: RecurrentEarningType;

  /**
   * Nombre descriptivo
   */
  @ApiProperty({ description: 'Nombre del ingreso recurrente' })
  @Expose()
  name: string;

  /**
   * Conceptos plantilla que se copian a cada factura
   */
  @ApiProperty({
    description: 'Conceptos de la plantilla',
    type: [ConceptResponseDto],
  })
  @Expose()
  @Type(() => ConceptResponseDto)
  concepts: ConceptResponseDto[];

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
   * Empresa cargada cuando se solicita la relación `enterprise`
   */
  @ApiProperty({
    description: 'Empresa asociada (vista pública)',
    type: () => EnterpriseResponseDto,
    required: false,
  })
  @Expose()
  @Type(() => EnterpriseResponseDto)
  enterprise?: EnterpriseResponseDto;

  /**
   * Serie cargada cuando se solicita la relación `invoiceSeries`
   */
  @ApiProperty({
    description: 'Serie asociada (vista pública)',
    type: () => InvoiceSeriesResponseDto,
    required: false,
  })
  @Expose()
  @Type(() => InvoiceSeriesResponseDto)
  invoiceSeries?: InvoiceSeriesResponseDto;

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
   * Facturas generadas cuando se solicita la relación `invoices`
   */
  @ApiProperty({
    description: 'Facturas generadas a partir de esta plantilla',
    type: () => [InvoiceResponseDto],
    required: false,
  })
  @Expose()
  @Type(() => InvoiceResponseDto)
  invoices?: InvoiceResponseDto[];
}
