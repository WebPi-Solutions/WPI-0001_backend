import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { ItemResponseDto } from 'src/entities/item/dto/item-response.dto';

/**
 * Vista pública de una línea de pedido.
 */
export class OrderConceptResponseDto {
  /**
   * Identificador único de la línea
   */
  @ApiProperty({ description: 'UUID de la línea de pedido' })
  @Expose()
  id: string;

  /**
   * Pedido al que pertenece
   */
  @ApiProperty({ description: 'UUID del pedido' })
  @Expose()
  orderId: string;

  /**
   * Artículo de origen, si la línea no es texto libre
   */
  @ApiProperty({
    description: 'UUID del artículo de origen',
    required: false,
    nullable: true,
  })
  @Expose()
  itemId: string | null;

  /**
   * Orden de la línea en el pedido
   */
  @ApiProperty({ description: 'Posición 0-based de la línea' })
  @Expose()
  position: number;

  /**
   * Descripción congelada
   */
  @ApiProperty({ description: 'Nombre o descripción de la línea' })
  @Expose()
  name: string;

  /**
   * Precio base unitario congelado
   */
  @ApiProperty({ description: 'Precio base unitario' })
  @Expose()
  basePrice: number;

  /**
   * Porcentaje de IVA
   */
  @ApiProperty({ description: 'Porcentaje de IVA' })
  @Expose()
  vat: number;

  /**
   * Porcentaje de IRPF
   */
  @ApiProperty({ description: 'Porcentaje de IRPF' })
  @Expose()
  irpf: number;

  /**
   * Unidades
   */
  @ApiProperty({ description: 'Cantidad de unidades' })
  @Expose()
  quantity: number;

  /**
   * EAN congelado
   */
  @ApiProperty({
    description: 'Código EAN congelado en la línea',
    required: false,
    nullable: true,
  })
  @Expose()
  ean: string | null;

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
   * Artículo cargado cuando se solicita la relación `item`
   */
  @ApiProperty({
    description: 'Artículo de origen (vista pública)',
    type: () => ItemResponseDto,
    required: false,
    nullable: true,
  })
  @Expose()
  @Type(() => ItemResponseDto)
  item?: ItemResponseDto | null;
}
