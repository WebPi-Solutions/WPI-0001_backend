import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { ItemSerialStatus } from 'src/common/enums';

/**
 * Vista pública de un número de serie canónico de artículo.
 */
export class ItemSerialResponseDto {
  /**
   * Identificador único
   */
  @ApiProperty({ description: 'UUID del número de serie' })
  @Expose()
  id: string;

  /**
   * Artículo propietario
   */
  @ApiProperty({ description: 'UUID del artículo' })
  @Expose()
  itemId: string;

  /**
   * Número de serie
   */
  @ApiProperty({ description: 'Número de serie' })
  @Expose()
  serialNumber: string;

  /**
   * Estado de inventario
   */
  @ApiProperty({
    description: 'Estado de la unidad (en stock, reservado, vendido o anulado)',
    enum: ItemSerialStatus,
  })
  @Expose()
  status: ItemSerialStatus;

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
