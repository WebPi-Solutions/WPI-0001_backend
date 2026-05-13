import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/**
 * Vista pública de empresa para respuestas HTTP.
 * No incluye `stripeId` ni otros campos internos: solo propiedades con `@Expose()`.
 */
export class EnterpriseResponseDto {
  /**
   * Identificador único de la empresa
   */
  @ApiProperty({
    description: 'Identificador único de la empresa',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @Expose()
  id: string;

  /**
   * Nombre comercial o razón social resumida
   */
  @ApiProperty({ description: 'Nombre de la empresa', example: 'Webpi Solutions SL' })
  @Expose()
  name: string;

  /**
   * Correo de contacto
   */
  @ApiProperty({ description: 'Correo electrónico de la empresa' })
  @Expose()
  email: string;

  /**
   * NIF de la empresa
   */
  @ApiProperty({ description: 'NIF de la empresa', example: 'B12345678' })
  @Expose()
  nif: string;

  /**
   * Teléfono de contacto (opcional)
   */
  @ApiProperty({
    description: 'Teléfono de la empresa',
    required: false,
    nullable: true,
  })
  @Expose()
  phone: string | null;

  /**
   * Dirección postal (opcional)
   */
  @ApiProperty({
    description: 'Dirección física de la empresa',
    required: false,
    nullable: true,
  })
  @Expose()
  address: string | null;

  /**
   * IBAN o cuenta bancaria (opcional)
   */
  @ApiProperty({
    description: 'Cuenta bancaria (IBAN u otro formato interno)',
    required: false,
    nullable: true,
  })
  @Expose()
  bankAccount: string | null;

  /**
   * Nombre de archivo del logo almacenado (opcional)
   */
  @ApiProperty({
    description: 'Identificador o nombre de archivo del logo',
    required: false,
    nullable: true,
  })
  @Expose()
  logo: string | null;

  /**
   * Fecha de creación del registro
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

  // Nota: `stripeId` y relaciones TypeORM no se exponen de forma intencionada.
}
