import { ApiProperty } from '@nestjs/swagger';

/**
 * Respuesta de conteos de usuarios de una empresa para el listado (tarjetas de métricas).
 * Los conteos aplican los mismos filtros que la tabla; activos e inactivos fuerzan ese estado.
 */
export class UserCountsByStatusDto {
  @ApiProperty({
    description: 'Total de usuarios que cumplen el filtro actual (sin forzar estado)',
    example: 42,
  })
  total: number;

  @ApiProperty({
    description: 'Usuarios en estado activo que cumplen el resto del filtro',
    example: 30,
  })
  active: number;

  @ApiProperty({
    description: 'Usuarios en estado inactivo que cumplen el resto del filtro',
    example: 10,
  })
  inactive: number;
}
