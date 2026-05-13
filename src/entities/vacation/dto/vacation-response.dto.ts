import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { UserEnterpriseResponseDto } from 'src/entities/user/dto/user-response.dto';

/**
 * DTO de salida para vacaciones y permisos (`vacations`).
 */
export class VacationResponseDto {
  @ApiProperty({ description: 'UUID del registro' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'UUID del vínculo usuario–empresa' })
  @Expose()
  userEnterpriseId: string;

  @ApiProperty({ description: 'Nombre del permiso' })
  @Expose()
  name: string;

  @ApiProperty({ description: 'Fecha del calendario (YYYY-MM-DD)' })
  @Expose()
  calendarDate: string;

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
