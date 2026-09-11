import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsInt, IsUUID, IsOptional, ValidateIf } from 'class-validator';

export class CreateUserEnterpriseDto {
  @ApiProperty({ description: 'ID de la empresa' })
  @IsUUID()
  @IsNotEmpty()
  enterpriseId: string;

  @ApiProperty({ description: 'ID del usuario' })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  /**
   * Rol de empresa (`enterprise_roles.id`) del mismo `enterpriseId`.
   */
  @ApiProperty({ description: 'UUID del rol de empresa asignado al vínculo' })
  @IsUUID()
  @IsNotEmpty()
  enterpriseRoleId: string;

  @ApiProperty({
    description: 'Identificador de tarjeta/NFC en el ámbito de la empresa (asignado por el servidor al vincular)',
    example: 1,
  })
  @IsInt()
  @IsNotEmpty()
  cardId: number;

  /**
   * Plantilla de horario por defecto para este vínculo usuario–empresa (`user_enterprise.default_schedule_id`).
   */
  @ApiPropertyOptional({
    description:
      'UUID opcional de plantilla de horario de la empresa para este vínculo (tabla default_schedules).',
    format: 'uuid',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsUUID()
  defaultScheduleId?: string | null;
}