import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * Actualización parcial de vacaciones / permiso.
 */
export class UpdateVacationDto {
  @ApiProperty({ description: 'Descripción corta', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'Fecha del permiso (YYYY-MM-DD)',
    required: false,
  })
  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'calendarDate debe tener formato YYYY-MM-DD',
  })
  calendarDate?: string;
}
