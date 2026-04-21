import { ApiProperty } from '@nestjs/swagger';

/**
 * Conteos de series de factura: total filtrado, creadas en el mes indicado y en la semana indicada.
 */
export class InvoiceSeriesListCountsDto {
  @ApiProperty({ description: 'Total con el filtro actual', example: 12 })
  total: number;

  @ApiProperty({ description: 'Series creadas en el rango del mes (created_at)', example: 3 })
  thisMonth: number;

  @ApiProperty({ description: 'Series creadas en el rango de la semana (created_at)', example: 1 })
  lastWeek: number;
}
