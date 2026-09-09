import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/**
 * Vista pública de un concepto de factura, cotización o ingreso recurrente.
 * Coincide con el JSONB persistido y con los campos que consume el frontend.
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

/**
 * Vista pública de un concepto de gasto.
 * Declara todos los campos (sin herencia de `@Expose`) para que el interceptor no los recorte.
 */
export class SpentConceptResponseDto {
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
   * Indica si el concepto está suplido
   */
  @ApiProperty({ description: 'Si el concepto está marcado como suplido' })
  @Expose()
  supplied: boolean;

  /**
   * Porcentaje del concepto imputable a la empresa
   */
  @ApiProperty({ description: 'Porcentaje imputable a la empresa (0-100)' })
  @Expose()
  percentage: number;
}
