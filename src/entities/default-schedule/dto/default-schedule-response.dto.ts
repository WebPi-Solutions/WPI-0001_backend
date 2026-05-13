import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { EnterpriseResponseDto } from 'src/entities/enterprise/dto/enterprise-response.dto';

/**
 * DTO de salida para plantillas de horario por defecto (`default_schedules`).
 */
export class DefaultScheduleResponseDto {
  @ApiProperty({ description: 'UUID de la plantilla' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'UUID de la empresa propietaria' })
  @Expose()
  enterpriseId: string;

  @ApiProperty({ description: 'Nombre de la plantilla' })
  @Expose()
  name: string;

  @ApiProperty({
    description: 'Descripción opcional',
    required: false,
    nullable: true,
  })
  @Expose()
  description: string | null;

  @ApiProperty({
    description: 'Definición JSON del horario recurrente',
    type: 'object',
    additionalProperties: true,
  })
  @Expose()
  schedule: Record<string, unknown>;

  @ApiProperty({ description: 'Fecha de creación' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: 'Fecha de última actualización' })
  @Expose()
  updatedAt: Date;

  @ApiProperty({
    description: 'Empresa cargada (vista pública)',
    type: () => EnterpriseResponseDto,
    required: false,
  })
  @Expose()
  @Type(() => EnterpriseResponseDto)
  enterprise?: EnterpriseResponseDto;
}
