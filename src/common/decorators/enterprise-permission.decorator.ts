import { SetMetadata } from '@nestjs/common';
import {
  PermissionAction,
  PermissionResource,
} from 'src/common/helpers/enterprise-permission/permission.catalog';

/**
 * Metadata de la acción exigida por {@link RequirePermission}.
 */
export interface RequiredEnterprisePermission {
  /**
   * Recurso del catálogo.
   */
  resource: PermissionResource;

  /**
   * Acción sobre el recurso.
   */
  action: PermissionAction;
}

/**
 * Clave de metadata para exigir un permiso de rol de empresa.
 */
export const REQUIRE_ENTERPRISE_PERMISSION_KEY = 'require_enterprise_permission';

/**
 * Clave de metadata para omitir el guard de permisos de rol.
 */
export const SKIP_ENTERPRISE_PERMISSION_KEY = 'skip_enterprise_permission';

/**
 * Exige que el rol de la empresa activa conceda la acción sobre el recurso.
 * El administrador global (`users.role === administrator`) se salta esta comprobación.
 *
 * @param resource - Recurso del catálogo
 * @param action - Acción (read, write, delete)
 * @returns Decorador de clase o método
 */
export const RequirePermission = (
  resource: PermissionResource,
  action: PermissionAction,
) => SetMetadata(REQUIRE_ENTERPRISE_PERMISSION_KEY, { resource, action });

/**
 * Omite el guard de permisos de rol (perfil propio, catálogo Stripe, alta de empresa).
 *
 * @returns Decorador de clase o método
 */
export const SkipEnterprisePermission = () =>
  SetMetadata(SKIP_ENTERPRISE_PERMISSION_KEY, true);
