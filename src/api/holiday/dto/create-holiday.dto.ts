import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Cuerpo para crear un festivo (`holidays`).
 * `enterpriseId` lo aporta el controlador vía query.
 */
export class CreateHolidayDto {
  @ApiProperty({
    description: 'Etiqueta del festivo',
    example: 'Navidad',
    required: false,
    default: 'Festivo',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'Fecha del festivo en formato ISO (solo fecha)',
    example: '2026-12-25',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'calendarDate debe tener formato YYYY-MM-DD',
  })
  calendarDate: string;

  @ApiProperty({
    description: 'Color del festivo en el calendario (#RRGGBB)',
    example: '#FF5630',
    required: false,
    default: '#00A76F',
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
