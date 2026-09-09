import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { SpentConceptResponseDto } from 'src/common/dto/concept-response.dto';
import { SupplierResponseDto } from 'src/entities/supplier/dto/supplier-response.dto';

/**
 * Vista pública de gasto para respuestas HTTP.
 * Incluye `supplierId` porque el flujo de IA y los filtros del frontend lo necesitan.
 */
export class SpentResponseDto {
  /**
   * Identificador único del gasto
   */
  @ApiProperty({ description: 'UUID del gasto' })
  @Expose()
  id: string;

  /**
   * Proveedor asociado
   */
  @ApiProperty({ description: 'UUID del proveedor' })
  @Expose()
  supplierId: string;

  /**
   * Nombre del gasto
   */
  @ApiProperty({ description: 'Nombre del gasto' })
  @Expose()
  name: string;

  /**
   * Fecha de emisión
   */
  @ApiProperty({ description: 'Fecha de emisión' })
  @Expose()
  issuedDate: Date;

  /**
   * Fecha de cobro
   */
  @ApiProperty({ description: 'Fecha de cobro' })
  @Expose()
  collectionDate: Date;

  /**
   * Fecha de declaración
   */
  @ApiProperty({ description: 'Fecha de declaración' })
  @Expose()
  declarationDate: Date;

  /**
   * Líneas de concepto con porcentaje imputable
   */
  @ApiProperty({
    description: 'Conceptos del gasto',
    type: [SpentConceptResponseDto],
  })
  @Expose()
  @Type(() => SpentConceptResponseDto)
  concepts: SpentConceptResponseDto[];

  /**
   * Estado del gasto
   */
  @ApiProperty({ description: 'Estado del gasto', example: 'paid' })
  @Expose()
  status: string;

  /**
   * Indica si existe un PDF adjunto
   */
  @ApiProperty({ description: 'Si el gasto tiene archivo adjunto' })
  @Expose()
  file: boolean;

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
   * Proveedor cargado cuando se solicita la relación `supplier`
   */
  @ApiProperty({
    description: 'Proveedor asociado (vista pública)',
    type: () => SupplierResponseDto,
    required: false,
  })
  @Expose()
  @Type(() => SupplierResponseDto)
  supplier?: SupplierResponseDto;
}
