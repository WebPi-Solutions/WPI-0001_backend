import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { ItemCategoryResponseDto } from 'src/entities/item-category/dto/item-category-response.dto';

/**
 * Vista pública de artículo para respuestas HTTP.
 */
export class ItemResponseDto {
  /**
   * Identificador único del artículo
   */
  @ApiProperty({ description: 'UUID del artículo' })
  @Expose()
  id: string;

  /**
   * Categoría a la que pertenece el artículo
   */
  @ApiProperty({ description: 'UUID de la categoría de artículos' })
  @Expose()
  itemCategoryId: string;

  /**
   * Nombre del artículo
   */
  @ApiProperty({ description: 'Nombre del artículo' })
  @Expose()
  name: string;

  /**
   * Descripción opcional
   */
  @ApiProperty({
    description: 'Descripción del artículo',
    required: false,
    nullable: true,
  })
  @Expose()
  description: string | null;

  /**
   * Precio de venta al público
   */
  @ApiProperty({ description: 'Precio de venta al público', default: 0 })
  @Expose()
  pricePvp: number;

  /**
   * Último precio de compra
   */
  @ApiProperty({ description: 'Último precio de compra', default: 0 })
  @Expose()
  lastPurchasePrice: number;

  /**
   * Indica si el artículo se gestiona con número de serie
   */
  @ApiProperty({
    description: 'Si el artículo se gestiona con número de serie',
    default: false,
  })
  @Expose()
  serialNumber: boolean;

  /**
   * Código EAN opcional
   */
  @ApiProperty({
    description: 'Código EAN del artículo',
    required: false,
    nullable: true,
  })
  @Expose()
  ean: string | null;

  /**
   * Indica si el artículo gestiona stock
   */
  @ApiProperty({
    description: 'Si el artículo gestiona stock',
    default: false,
  })
  @Expose()
  stock: boolean;

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
   * Categoría cargada cuando el cliente solicita la relación `itemCategory`
   */
  @ApiProperty({
    description: 'Categoría asociada (vista pública)',
    type: () => ItemCategoryResponseDto,
    required: false,
  })
  @Expose()
  @Type(() => ItemCategoryResponseDto)
  itemCategory?: ItemCategoryResponseDto;
}
