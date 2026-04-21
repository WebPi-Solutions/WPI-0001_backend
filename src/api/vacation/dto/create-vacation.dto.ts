import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

/**
 * Cuerpo para crear un día de vacaciones o permiso (`vacations`).
 */
export class CreateVacationDto {
  @ApiProperty({ description: 'Vínculo usuario–empresa del permiso (user_enterprise.id)' })
  @IsUUID()
  @IsNotEmpty()
  userEnterpriseId: string;

  @ApiProperty({
    description: 'Descripción corta',
    required: false,
    default: 'Vacaciones',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'Fecha del permiso (YYYY-MM-DD)',
    example: '2026-08-15',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'calendarDate debe tener formato YYYY-MM-DD',
  })
  calendarDate: string;
}
