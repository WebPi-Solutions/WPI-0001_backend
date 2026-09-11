import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { EnterpriseRolePermissions } from 'src/common/helpers/enterprise-permission/permission.catalog';

/**
 * Cuerpo de alta de un rol de empresa. El `enterpriseId` lo pisa el query.
 */
export class CreateEnterpriseRoleDto {
  /**
   * Nombre visible del rol.
   */
  @ApiProperty({ description: 'Nombre del rol (único por empresa)', example: 'Contabilidad' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  role: string;

  /**
   * Concesiones. Si se omite, queda `{}` (sin permisos).
   */
  @ApiPropertyOptional({
    description: 'Permisos concedidos. Ausencia de clave = denegado.',
    example: { invoices: { read: true, write: true } },
  })
  @IsOptional()
  @IsObject()
  permissions?: EnterpriseRolePermissions;
}
