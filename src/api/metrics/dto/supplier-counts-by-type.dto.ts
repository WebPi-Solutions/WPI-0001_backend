import { ApiProperty } from '@nestjs/swagger';

/**
 * Conteos de proveedores por tipo (persona física / empresa) para el listado.
 */
export class SupplierCountsByTypeDto {
  @ApiProperty({ description: 'Total con el filtro actual', example: 45 })
  total: number;

  @ApiProperty({ description: 'Proveedores tipo persona física', example: 20 })
  individuals: number;

  @ApiProperty({ description: 'Proveedores tipo empresa', example: 25 })
  companies: number;
}
