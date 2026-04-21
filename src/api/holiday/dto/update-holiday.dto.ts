import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Cuerpo para actualizar un festivo; campos opcionales.
 */
export class UpdateHolidayDto {
  @ApiProperty({ description: 'Etiqueta del festivo', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'Fecha del festivo (YYYY-MM-DD)',
    required: false,
    example: '2026-12-26',
  })
  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'calendarDate debe tener formato YYYY-MM-DD',
  })
  calendarDate?: string;

  @ApiProperty({
    description: 'Color del festivo en el calendario (#RRGGBB)',
    required: false,
    example: '#00B8D9',
  })
  @IsString()
  @IsOptional()
  @MinLength(7)
  @MaxLength(7)
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'calendarColor debe ser un color hexadecimal en formato #RRGGBB',
  })
  calendarColor?: string;
}
