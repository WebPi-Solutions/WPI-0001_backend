import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { ClientType, PaymentMethod } from 'src/common/enums';
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
   * Tipo de cliente (`company` o `particular`)
   */
  @ApiProperty({
    description: 'Tipo de cliente (`company` o `particular`)',
    required: false,
    nullable: true,
    enum: ClientType,
    example: ClientType.COMPANY,
  })
  @Expose()
  type: ClientType | null;

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
   * Método de pago preferido (`card`, `cash`, `bank_transfer`, `direct_debit`)
   */
  @ApiProperty({
    description: 'Método de pago del cliente',
    enum: PaymentMethod,
    example: PaymentMethod.BANK_TRANSFER,
  })
  @Expose()
  paymentMethod: PaymentMethod;

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
