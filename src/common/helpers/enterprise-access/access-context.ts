import { EnterpriseRolePermissions } from 'src/common/helpers/enterprise-permission/permission.catalog';

/**
 * Contexto de autorización multi-empresa resuelto para la petición HTTP actual.
 * Lo construye {@link EnterpriseAccessService.buildAccessContext} a partir de `req.user`.
 */
export interface AccessContext {
  /**
   * Identificador del usuario autenticado (`users.id`).
   */
  userId: string;

  /**
   * `true` si `users.role` es `administrator` (bypass de aislamiento entre empresas y de RBAC).
   */
  isGlobalAdmin: boolean;

  /**
   * UUID de empresas a las que el usuario está vinculado vía `user_enterprise`.
   */
  allowedEnterpriseIds: string[];

  /**
   * Permisos del rol de cada empresa vinculada (JSONB). Sin mapa o sin rol = deny.
   */
  permissionsByEnterpriseId?: Record<string, EnterpriseRolePermissions>;
}
