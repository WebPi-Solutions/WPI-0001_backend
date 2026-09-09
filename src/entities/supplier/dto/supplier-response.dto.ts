import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { EnterpriseResponseDto } from 'src/entities/enterprise/dto/enterprise-response.dto';

/**
 * Vista pública de proveedor para respuestas HTTP.
 * No incluye la colección `spents` porque el frontend no la consume desde el proveedor.
 */
export class SupplierResponseDto {
  /**
   * Identificador único del proveedor
   */
  @ApiProperty({ description: 'UUID del proveedor' })
  @Expose()
  id: string;

  /**
   * Empresa propietaria del proveedor
   */
  @ApiProperty({ description: 'UUID de la empresa propietaria' })
  @Expose()
  enterpriseId: string;

  /**
   * Nombre o razón social
   */
  @ApiProperty({ description: 'Nombre del proveedor' })
  @Expose()
  name: string;

  /**
   * NIF/CIF
   */
  @ApiProperty({ description: 'NIF/CIF del proveedor' })
  @Expose()
  nif: string;

  /**
   * Correo electrónico (opcional)
   */
  @ApiProperty({
    description: 'Correo electrónico del proveedor',
    required: false,
    nullable: true,
  })
  @Expose()
  email: string | null;

  /**
   * Teléfono (opcional)
   */
  @ApiProperty({
    description: 'Teléfono del proveedor',
    required: false,
    nullable: true,
  })
  @Expose()
  phone: string | null;

  /**
   * Dirección postal (opcional)
   */
  @ApiProperty({
    description: 'Dirección del proveedor',
    required: false,
    nullable: true,
  })
  @Expose()
  address: string | null;

  /**
   * Tipo de proveedor (`company` o `individual`)
   */
  @ApiProperty({
    description: 'Tipo de proveedor',
    required: false,
    nullable: true,
    example: 'company',
  })
  @Expose()
  type: string | null;

  /**
   * Cuenta bancaria del proveedor (opcional)
   */
  @ApiProperty({
    description: 'Número de cuenta del proveedor',
    required: false,
    nullable: true,
  })
  @Expose()
  accountNumber: string | null;

  /**
   * Recargo de equivalencia (opcional)
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
    description: 'Descripción adicional del proveedor',
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
