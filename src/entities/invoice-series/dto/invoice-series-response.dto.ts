import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { EnterpriseResponseDto } from 'src/entities/enterprise/dto/enterprise-response.dto';

/**
 * Vista pública de serie de factura para respuestas HTTP.
 * Expone `enterpriseId` porque el PDF de factura lo usa para resolver el logo.
 * No incluye colecciones `invoices` ni `recurrentEarnings`.
 */
export class InvoiceSeriesResponseDto {
  /**
   * Identificador único de la serie
   */
  @ApiProperty({ description: 'UUID de la serie de factura' })
  @Expose()
  id: string;

  /**
   * Empresa propietaria de la serie
   */
  @ApiProperty({ description: 'UUID de la empresa propietaria' })
  @Expose()
  enterpriseId: string;

  /**
   * Código de serie (A, B, C, …)
   */
  @ApiProperty({ description: 'Identificador de la serie', example: 'A' })
  @Expose()
  series: string;

  /**
   * Descripción opcional
   */
  @ApiProperty({
    description: 'Descripción de la serie',
    required: false,
    nullable: true,
  })
  @Expose()
  description: string | null;

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
   * Empresa cargada cuando el cliente solicita la relación `enterprise`
   */
  @ApiProperty({
    description: 'Empresa asociada (vista pública)',
    type: () => EnterpriseResponseDto,
    required: false,
  })
  @Expose()
  @Type(() => EnterpriseResponseDto)
  enterprise?: EnterpriseResponseDto;
}
