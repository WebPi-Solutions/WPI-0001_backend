import { ApiProperty } from '@nestjs/swagger';

/**
 * Conteos de clientes por tipo (persona física / empresa) para el listado.
 */
export class ClientCountsByTypeDto {
  @ApiProperty({ description: 'Total con el filtro actual', example: 120 })
  total: number;

  @ApiProperty({ description: 'Clientes tipo persona física', example: 80 })
  individuals: number;

  @ApiProperty({ description: 'Clientes tipo empresa', example: 40 })
  companies: number;
}
