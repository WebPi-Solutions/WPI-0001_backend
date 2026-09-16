import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { EnterpriseResponseDto } from 'src/entities/enterprise/dto/enterprise-response.dto';

/**
 * Vista pública de categoría de artículos para respuestas HTTP.
 * No incluye la colección `items` porque el listado de artículos se consulta aparte.
 */
export class ItemCategoryResponseDto {
  /**
   * Identificador único de la categoría
   */
  @ApiProperty({ description: 'UUID de la categoría de artículos' })
  @Expose()
  id: string;

  /**
   * Empresa propietaria de la categoría
   */
  @ApiProperty({ description: 'UUID de la empresa propietaria' })
  @Expose()
  enterpriseId: string;

  /**
   * Nombre de la categoría
   */
  @ApiProperty({ description: 'Nombre de la categoría' })
  @Expose()
  name: string;

  /**
   * Descripción opcional
   */
  @ApiProperty({
    description: 'Descripción de la categoría',
    required: false,
    nullable: true,
  })
  @Expose()
  description: string | null;

  /**
   * Fecha de creación
   */
  @ApiProperty({ description: 'Fecha de creación del registro' })
  @Expose()
  createdAt: Date;

  /**
   * Fecha de última actualización
   */
  @ApiProperty({ description: 'Fecha de última actualización' })
  @Expose()
  updatedAt: Date;

  /**
   * Empresa cargada cuando el cliente solicita la relación `enterprise`
   */
  @ApiProperty({
    description: 'Empresa asociada (vista pública)',
    type: () => EnterpriseResponseDto,
    required: false,
  })
  @Expose()
  @Type(() => EnterpriseResponseDto)
  enterprise?: EnterpriseResponseDto;
}
