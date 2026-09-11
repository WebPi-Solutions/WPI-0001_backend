import { ApiProperty } from '@nestjs/swagger';

/**
 * Conteos de solicitudes de IA por tipo (emisor / conceptos) para el listado.
 */
export class AiRequestCountsByTypeDto {
  @ApiProperty({ description: 'Total con el filtro actual', example: 24 })
  total: number;

  @ApiProperty({ description: 'Llamadas de tipo emisor del gasto', example: 12 })
  issuer: number;

  @ApiProperty({ description: 'Llamadas de tipo conceptos del gasto', example: 12 })
  concepts: number;
}
