import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { UserEnterpriseResponseDto } from 'src/entities/user/dto/user-response.dto';

/**
 * DTO de salida para franjas de trabajo (`schedules`).
 */
export class WorkScheduleResponseDto {
  @ApiProperty({ description: 'UUID de la franja' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'UUID del vínculo usuario–empresa' })
  @Expose()
  userEnterpriseId: string;

  @ApiProperty({ description: 'Inicio de la franja' })
  @Expose()
  startsAt: Date;

  @ApiProperty({ description: 'Fin de la franja' })
  @Expose()
  endsAt: Date;

  @ApiProperty({ description: 'Fecha de creación' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: 'Fecha de última actualización' })
  @Expose()
  updatedAt: Date;

  @ApiProperty({
    description: 'Vínculo usuario–empresa con empresa en vista pública',
    type: () => UserEnterpriseResponseDto,
    required: false,
  })
  @Expose()
  @Type(() => UserEnterpriseResponseDto)
  userEnterprise?: UserEnterpriseResponseDto;
}
