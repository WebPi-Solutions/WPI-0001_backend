import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/**
 * Vista pública de un concepto de ingreso recurrente.
 * Coincide con el JSONB de `recurrent_earnings.concepts` y con los campos que consume el frontend.
 */
export class ConceptResponseDto {
  /**
   * Descripción del concepto
   */
  @ApiProperty({ description: 'Nombre o descripción del concepto' })
  @Expose()
  name: string;

  /**
   * Precio unitario sin impuestos
   */
  @ApiProperty({ description: 'Precio base unitario' })
  @Expose()
  base_price: number;

  /**
   * Porcentaje de IVA aplicado
   */
  @ApiProperty({ description: 'Porcentaje de IVA' })
  @Expose()
  vat: number;

  /**
   * Porcentaje de IRPF aplicado
   */
  @ApiProperty({ description: 'Porcentaje de IRPF' })
  @Expose()
  irpf: number;

  /**
   * Unidades del concepto
   */
  @ApiProperty({ description: 'Cantidad de unidades' })
  @Expose()
  quantity: number;

  /**
   * Indica si el concepto está suplido (sin IVA repercutido)
   */
  @ApiProperty({ description: 'Si el concepto está marcado como suplido' })
  @Expose()
  supplied: boolean;
}
