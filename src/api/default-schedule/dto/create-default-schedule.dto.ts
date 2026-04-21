import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Cuerpo para crear una plantilla de horario por defecto (`default_schedules`).
 * No incluye `enterpriseId`: se toma del query param obligatorio del controlador.
 */
export class CreateDefaultScheduleDto {
  @ApiProperty({
    description: 'Nombre descriptivo de la plantilla de horario',
    example: 'Jornada oficina estándar',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description:
      'Descripción en texto libre para identificar o contextualizar la plantilla. Sin límite de longitud en base de datos (columna `varchar` sin tamaño en PostgreSQL).',
    example: 'Equipo administración · sede central',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Definición del horario en JSON (días, franjas, etc.)',
    example: { weekdays: { mon: [{ start: '09:00', end: '17:00' }] } },
  })
  @IsObject()
  @IsNotEmpty()
  schedule: Record<string, unknown>;
}
