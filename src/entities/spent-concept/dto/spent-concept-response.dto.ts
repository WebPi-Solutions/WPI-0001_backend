import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { ItemResponseDto } from 'src/entities/item/dto/item-response.dto';
import { SpentConceptSerialResponseDto } from 'src/entities/spent-concept-serial/dto/spent-concept-serial-response.dto';

/**
 * Vista pública de una línea de gasto.
 */
export class SpentConceptResponseDto {
  /**
   * Identificador único de la línea
   */
  @ApiProperty({ description: 'UUID de la línea de gasto' })
  @Expose()
  id: string;

  /**
   * Gasto al que pertenece
   */
  @ApiProperty({ description: 'UUID del gasto' })
  @Expose()
  spentId: string;

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
   * Orden de la línea en el gasto
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

  /**
   * Números de serie cuando se solicita la relación `serials`
   */
  @ApiProperty({
    description: 'Números de serie de la línea',
    type: () => SpentConceptSerialResponseDto,
    isArray: true,
    required: false,
  })
  @Expose()
  @Type(() => SpentConceptSerialResponseDto)
  serials?: SpentConceptSerialResponseDto[];
}
