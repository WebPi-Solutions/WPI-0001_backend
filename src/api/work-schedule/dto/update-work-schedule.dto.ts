import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

/**
 * Actualización parcial de una franja de trabajo.
 */
export class UpdateWorkScheduleDto {
  @ApiProperty({
    description: 'Inicio del periodo (ISO 8601)',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  startsAt?: string;

  @ApiProperty({ description: 'Fin del periodo (ISO 8601)', required: false })
  @IsDateString()
  @IsOptional()
  endsAt?: string;
}
