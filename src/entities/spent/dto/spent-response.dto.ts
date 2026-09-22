import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { SpentConceptResponseDto } from 'src/entities/spent-concept/dto/spent-concept-response.dto';
import { SupplierResponseDto } from 'src/entities/supplier/dto/supplier-response.dto';
import { SpentStatus } from 'src/common/enums';

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
   * Código opcional del gasto
   */
  @ApiProperty({
    description: 'Código opcional del gasto (referencia interna o de la factura del proveedor)',
    required: false,
    nullable: true,
    example: 'FAC-2026-001',
  })
  @Expose()
  code: string | null;

  /**
   * Nombre del gasto
   */
  @ApiProperty({ description: 'Nombre del gasto', required: false, nullable: true })
  @Expose()
  name: string | null;

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
   * Líneas de concepto persistidas en `spent_concepts`
   */
  @ApiProperty({
    description: 'Conceptos del gasto',
    type: [SpentConceptResponseDto],
    required: false,
  })
  @Expose()
  @Type(() => SpentConceptResponseDto)
  spentConcepts?: SpentConceptResponseDto[];

  /**
   * Estado del gasto
   */
  @ApiProperty({ description: 'Estado del gasto', enum: SpentStatus })
  @Expose()
  status: SpentStatus;

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
