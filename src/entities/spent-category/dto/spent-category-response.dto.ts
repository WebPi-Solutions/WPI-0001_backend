import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { EnterpriseResponseDto } from 'src/entities/enterprise/dto/enterprise-response.dto';

/** Vista pública de una categoría de gastos. */
export class SpentCategoryResponseDto {
  @ApiProperty({ description: 'UUID de la categoría de gastos' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'UUID de la empresa propietaria' })
  @Expose()
  enterpriseId: string;

  @ApiProperty({ description: 'Nombre de la categoría' })
  @Expose()
  name: string;

  @ApiProperty({ description: 'Descripción de la categoría', required: false, nullable: true })
  @Expose()
  description: string | null;

  @ApiProperty({ description: 'Fecha de creación' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: 'Fecha de última actualización' })
  @Expose()
  updatedAt: Date;

  @ApiProperty({ description: 'Empresa asociada', type: () => EnterpriseResponseDto, required: false })
  @Expose()
  @Type(() => EnterpriseResponseDto)
  enterprise?: EnterpriseResponseDto;
}
