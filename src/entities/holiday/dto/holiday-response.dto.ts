import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { EnterpriseResponseDto } from 'src/entities/enterprise/dto/enterprise-response.dto';

/**
 * DTO de salida para festivos (`holidays`).
 */
export class HolidayResponseDto {
  @ApiProperty({ description: 'UUID del festivo' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'UUID de la empresa' })
  @Expose()
  enterpriseId: string;

  @ApiProperty({ description: 'Etiqueta del festivo' })
  @Expose()
  name: string;

  @ApiProperty({ description: 'Fecha del calendario (YYYY-MM-DD)' })
  @Expose()
  calendarDate: string;

  @ApiProperty({ description: 'Color en calendario (#RRGGBB)' })
  @Expose()
  calendarColor: string;

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
