import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { EnterpriseRolePermissions } from 'src/common/helpers/enterprise-permission/permission.catalog';

/**
 * Vista pública de un rol de empresa.
 */
export class EnterpriseRoleResponseDto {
  /**
   * UUID del rol.
   */
  @ApiProperty({ description: 'UUID del rol de empresa' })
  @Expose()
  id: string;

  /**
   * Empresa propietaria.
   */
  @ApiProperty({ description: 'UUID de la empresa propietaria' })
  @Expose()
  enterpriseId: string;

  /**
   * Nombre del rol.
   */
  @ApiProperty({ description: 'Nombre del rol dentro de la empresa' })
  @Expose()
  role: string;

  /**
   * Concesiones persistidas (claves ausentes = denegado).
   */
  @ApiProperty({
    description: 'Permisos concedidos (deny by default; * = todas las entidades)',
  })
  @Expose()
  permissions: EnterpriseRolePermissions;

  /**
   * Fecha de creación.
   */
  @ApiProperty({ description: 'Fecha de creación del rol' })
  @Expose()
  createdAt: Date;

  /**
   * Fecha de actualización.
   */
  @ApiProperty({ description: 'Fecha de última actualización del rol' })
  @Expose()
  updatedAt: Date;

  /**
   * Usuarios de la empresa con este rol asignado.
   */
  @ApiProperty({ description: 'Número de usuarios de la empresa con este rol' })
  @Expose()
  @Transform(({ value }: { value: unknown }) => {
    const parsedUserCount = Number(value);
    if (!Number.isFinite(parsedUserCount) || parsedUserCount < 0) {
      return 0;
    }
    return Math.floor(parsedUserCount);
  })
  userCount: number;
}
