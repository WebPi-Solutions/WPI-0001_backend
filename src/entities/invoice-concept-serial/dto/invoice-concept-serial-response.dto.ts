import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/**
 * Vista pública de un número de serie de línea de factura.
 */
export class InvoiceConceptSerialResponseDto {
  /**
   * Identificador único
   */
  @ApiProperty({ description: 'UUID del número de serie' })
  @Expose()
  id: string;

  /**
   * Línea de factura propietaria
   */
  @ApiProperty({ description: 'UUID de la línea de factura' })
  @Expose()
  invoiceConceptId: string;

  /**
   * Número de serie capturado
   */
  @ApiProperty({ description: 'Número de serie' })
  @Expose()
  serialNumber: string;

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
}
