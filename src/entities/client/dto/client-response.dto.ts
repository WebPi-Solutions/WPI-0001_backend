import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { EnterpriseResponseDto } from 'src/entities/enterprise/dto/enterprise-response.dto';

/**
 * Vista pública de cliente para respuestas HTTP.
 * No incluye colecciones (`invoices`, `quotes`, `recurrentEarnings`) porque el frontend no las consume.
 */
export class ClientResponseDto {
  /**
   * Identificador único del cliente
   */
  @ApiProperty({ description: 'UUID del cliente' })
  @Expose()
  id: string;

  /**
   * Empresa propietaria del cliente
   */
  @ApiProperty({ description: 'UUID de la empresa propietaria' })
  @Expose()
  enterpriseId: string;

  /**
   * Nombre o razón social
   */
  @ApiProperty({ description: 'Nombre del cliente' })
  @Expose()
  name: string;

  /**
   * NIF/CIF
   */
  @ApiProperty({ description: 'NIF/CIF del cliente' })
  @Expose()
  nif: string;

  /**
   * Correo electrónico (opcional)
   */
  @ApiProperty({
    description: 'Correo electrónico del cliente',
    required: false,
    nullable: true,
  })
  @Expose()
  email: string | null;

  /**
   * Teléfono (opcional)
   */
  @ApiProperty({
    description: 'Teléfono del cliente',
    required: false,
    nullable: true,
  })
  @Expose()
  phone: string | null;

  /**
   * Dirección postal (opcional)
   */
  @ApiProperty({
    description: 'Dirección del cliente',
    required: false,
    nullable: true,
  })
  @Expose()
  address: string | null;

  /**
   * Tipo de cliente (`company` o `individual`)
   */
  @ApiProperty({
    description: 'Tipo de cliente',
    required: false,
    nullable: true,
    example: 'company',
  })
  @Expose()
  type: string | null;

  /**
   * Cuenta bancaria del cliente (opcional)
   */
  @ApiProperty({
    description: 'Número de cuenta del cliente',
    required: false,
    nullable: true,
  })
  @Expose()
  accountNumber: string | null;

  /**
   * Recargo de equivalencia (`type_1`, `type_2`, `type_3`)
   */
  @ApiProperty({
    description: 'Recargo de equivalencia',
    required: false,
    nullable: true,
  })
  @Expose()
  equivalenceSurcharge: string | null;

  /**
   * Notas internas (opcional)
   */
  @ApiProperty({
    description: 'Descripción adicional del cliente',
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
