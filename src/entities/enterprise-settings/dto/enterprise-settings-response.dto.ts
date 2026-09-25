import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { EnterpriseResponseDto } from 'src/entities/enterprise/dto/enterprise-response.dto';

/** Vista pública de una configuración de empresa. */
export class EnterpriseSettingsResponseDto {
  @ApiProperty({ description: 'UUID de la configuración' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'UUID de la empresa propietaria' })
  @Expose()
  enterpriseId: string;

  @ApiProperty({ description: 'Indica si el valor puede editarse' })
  @Expose()
  editable: boolean;

  @ApiProperty({ description: 'Clave de configuración' })
  @Expose()
  key: string;

  @ApiProperty({ description: 'Valor de configuración' })
  @Expose()
  value: string;

  @ApiProperty({ description: 'Fecha de creación' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: 'Fecha de última actualización' })
  @Expose()
  updatedAt: Date;

  @ApiProperty({
    description: 'Empresa propietaria',
    type: () => EnterpriseResponseDto,
    required: false,
  })
  @Expose()
  @Type(() => EnterpriseResponseDto)
  enterprise?: EnterpriseResponseDto;
}
