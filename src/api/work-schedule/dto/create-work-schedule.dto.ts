import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsUUID } from 'class-validator';

/**
 * Cuerpo para crear una franja de trabajo (`schedules`).
 * La pertenencia a la empresa se valida en servicio comprobando `user_enterprise`.
 */
export class CreateWorkScheduleDto {
  @ApiProperty({
    description: 'Identificador del usuario propietario de la franja',
  })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: 'Inicio del periodo (ISO 8601)',
    example: '2026-04-13T08:00:00.000Z',
  })
  @IsDateString()
  @IsNotEmpty()
  startsAt: string;

  @ApiProperty({
    description: 'Fin del periodo (ISO 8601)',
    example: '2026-04-13T16:00:00.000Z',
  })
  @IsDateString()
  @IsNotEmpty()
  endsAt: string;
}
