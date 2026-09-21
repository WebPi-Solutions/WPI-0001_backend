import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { StockDirection, StockType } from 'src/common/enums';
import { ItemSerialResponseDto } from 'src/entities/item-serial/dto/item-serial-response.dto';

/**
 * Vista pública de un movimiento de kardex.
 */
export class StockMovementResponseDto {
  /**
   * Identificador único
   */
  @ApiProperty({ description: 'UUID del movimiento' })
  @Expose()
  id: string;

  /**
   * Artículo afectado
   */
  @ApiProperty({ description: 'UUID del artículo' })
  @Expose()
  itemId: string;

  /**
   * Unidad serializada, si aplica
   */
  @ApiProperty({
    description: 'UUID del número de serie, nulo en movimientos por cantidad',
    required: false,
    nullable: true,
  })
  @Expose()
  itemSerialId: string | null;

  /**
   * Unidad serializada cargada cuando se solicita la relación `itemSerial`
   */
  @ApiProperty({
    description: 'Número de serie de la unidad, nulo en movimientos por cantidad',
    type: () => ItemSerialResponseDto,
    required: false,
    nullable: true,
  })
  @Expose()
  @Type(() => ItemSerialResponseDto)
  itemSerial?: ItemSerialResponseDto | null;

  /**
   * Línea de factura origen
   */
  @ApiProperty({
    description: 'UUID de la línea de factura, nulo si nace de un gasto',
    required: false,
    nullable: true,
  })
  @Expose()
  invoiceConceptId: string | null;

  /**
   * Línea de gasto origen
   */
  @ApiProperty({
    description: 'UUID de la línea de gasto, nulo si nace de una factura',
    required: false,
    nullable: true,
  })
  @Expose()
  spentConceptId: string | null;

  /**
   * Unidades movidas
   */
  @ApiProperty({ description: 'Cantidad movida (siempre positiva)' })
  @Expose()
  quantity: number;

  /**
   * Dirección del movimiento
   */
  @ApiProperty({ description: 'Dirección (entrada o salida)', enum: StockDirection })
  @Expose()
  direction: StockDirection;

  /**
   * Tipo del movimiento
   */
  @ApiProperty({ description: 'Tipo (compra, venta o reversión)', enum: StockType })
  @Expose()
  type: StockType;

  /**
   * Momento del movimiento
   */
  @ApiProperty({ description: 'Fecha del documento que origina el movimiento' })
  @Expose()
  occurredAt: Date;

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
