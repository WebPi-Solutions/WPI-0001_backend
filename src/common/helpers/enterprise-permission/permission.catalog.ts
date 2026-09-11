/**
 * Catálogo de permisos por recurso (código). El JSONB de `enterprise_roles.permissions`
 * solo guarda concesiones; una clave ausente se interpreta como denegada.
 */

/**
 * Acción CRUD sobre un recurso del catálogo.
 */
export type PermissionAction = 'read' | 'write' | 'delete';

/**
 * Recurso de negocio sobre el que se puede conceder un permiso.
 */
export type PermissionResource =
  | 'clients'
  | 'suppliers'
  | 'invoices'
  | 'quotes'
  | 'invoiceSeries'
  | 'recurrentEarnings'
  | 'spents'
  | 'users'
  | 'enterpriseRoles'
  | 'enterprises'
  | 'signings'
  | 'vacations'
  | 'holidays'
  | 'workSchedules'
  | 'defaultSchedules'
  | 'billing'
  | 'aiRequests';

/**
 * Mapa de acciones concedidas para un recurso (o para el comodín `*`).
 */
export type PermissionActionMap = Partial<Record<PermissionAction, boolean>>;

/**
 * JSONB persistido en `enterprise_roles.permissions`.
 * Solo deben figurar concesiones; `*` otorga la acción a todos los recursos.
 */
export type EnterpriseRolePermissions = {
  '*'?: PermissionActionMap;
} & Partial<Record<PermissionResource, PermissionActionMap>>;

/**
 * Recursos reconocidos por el backend (sin el comodín).
 */
export const PERMISSION_RESOURCES: readonly PermissionResource[] = [
  'clients',
  'suppliers',
  'invoices',
  'quotes',
  'invoiceSeries',
  'recurrentEarnings',
  'spents',
  'users',
  'enterpriseRoles',
  'enterprises',
  'signings',
  'vacations',
  'holidays',
  'workSchedules',
  'defaultSchedules',
  'billing',
  'aiRequests',
] as const;

/**
 * Acciones reconocidas por el backend.
 */
export const PERMISSION_ACTIONS: readonly PermissionAction[] = [
  'read',
  'write',
  'delete',
] as const;

/**
 * Acciones concedibles por recurso. Las no listadas no existen en el rol
 * (ni el comodín `*` las abre): el vínculo usuario–empresa se edita con `users`;
 * una empresa no se borra desde un rol de tenant; solicitudes de IA son solo lectura.
 * Las métricas no son un recurso: cada endpoint exige `read` de la entidad consultada.
 */
export const PERMISSION_RESOURCE_ALLOWED_ACTIONS: Record<
  PermissionResource,
  readonly PermissionAction[]
> = buildAllowedActionsByResource();

/**
 * Construye el mapa de acciones permitidas, con excepciones sobre el CRUD completo.
 *
 * @returns Acciones concedibles por recurso
 */
function buildAllowedActionsByResource(): Record<
  PermissionResource,
  readonly PermissionAction[]
> {
  const allowedActions = {} as Record<PermissionResource, readonly PermissionAction[]>;
  for (const resource of PERMISSION_RESOURCES) {
    allowedActions[resource] = PERMISSION_ACTIONS;
  }
  allowedActions.enterprises = ['read', 'write'];
  allowedActions.aiRequests = ['read'];
  return allowedActions;
}

/**
 * Acciones que un rol puede conceder sobre un recurso.
 *
 * @param resource - Recurso del catálogo
 * @returns Acciones visibles y persistibles
 */
export function getAllowedPermissionActions(
  resource: PermissionResource,
): readonly PermissionAction[] {
  return PERMISSION_RESOURCE_ALLOWED_ACTIONS[resource] ?? [];
}

/**
 * Indica si la acción forma parte del contrato del recurso.
 *
 * @param resource - Recurso del catálogo
 * @param action - Acción candidata
 * @returns `true` si se puede conceder
 */
export function isPermissionActionAllowedForResource(
  resource: PermissionResource,
  action: PermissionAction,
): boolean {
  return getAllowedPermissionActions(resource).includes(action);
}

/**
 * Catálogo público de `GET /enterprise-roles/catalog`.
 *
 * @returns Recursos, acciones globales y acciones por recurso
 */
export function buildEnterprisePermissionCatalog(): {
  resources: PermissionResource[];
  actions: PermissionAction[];
  resourceActions: Record<PermissionResource, PermissionAction[]>;
} {
  const resourceActions = {} as Record<PermissionResource, PermissionAction[]>;
  for (const resource of PERMISSION_RESOURCES) {
    resourceActions[resource] = [...getAllowedPermissionActions(resource)];
  }
  return {
    resources: [...PERMISSION_RESOURCES],
    actions: [...PERMISSION_ACTIONS],
    resourceActions,
  };
}

/**
 * Nombre del rol de administrador de empresa (comodín `*`).
 */
export const ENTERPRISE_ROLE_NAME_ADMINISTRATOR = 'Administrador';

/**
 * Nombre del rol de empleado (sin concesiones).
 */
export const ENTERPRISE_ROLE_NAME_EMPLOYEE = 'Empleado';

/**
 * Nombres de los roles sembrados al crear una empresa.
 * No se pueden eliminar; el Administrador tampoco puede cambiar permisos.
 */
export const PROTECTED_DEFAULT_ENTERPRISE_ROLE_NAMES = [
  ENTERPRISE_ROLE_NAME_ADMINISTRATOR,
  ENTERPRISE_ROLE_NAME_EMPLOYEE,
] as const;

/**
 * Indica si el nombre corresponde a un rol por defecto no eliminable.
 *
 * @param roleName - Nombre candidato
 * @returns `true` si es Administrador o Empleado
 */
export function isProtectedDefaultEnterpriseRoleName(
  roleName: string | undefined | null,
): boolean {
  return (PROTECTED_DEFAULT_ENTERPRISE_ROLE_NAMES as readonly string[]).includes(
    (roleName ?? '').trim(),
  );
}

/**
 * Permisos del administrador de empresa: todas las acciones en todos los recursos.
 */
export const ADMINISTRATOR_ROLE_PERMISSIONS: EnterpriseRolePermissions = {
  '*': { read: true, write: true, delete: true },
};

/**
 * Permisos del empleado: deny by default (objeto vacío).
 */
export const EMPLOYEE_ROLE_PERMISSIONS: EnterpriseRolePermissions = {};

/**
 * Indica si el nombre de recurso pertenece al catálogo (no incluye `*`).
 *
 * @param resourceName - Clave candidata
 * @returns `true` si está en {@link PERMISSION_RESOURCES}
 */
export function isCatalogPermissionResource(
  resourceName: string,
): resourceName is PermissionResource {
  return (PERMISSION_RESOURCES as readonly string[]).includes(resourceName);
}

/**
 * Indica si la acción pertenece al catálogo.
 *
 * @param actionName - Acción candidata
 * @returns `true` si es read, write o delete
 */
export function isCatalogPermissionAction(
  actionName: string,
): actionName is PermissionAction {
  return (PERMISSION_ACTIONS as readonly string[]).includes(actionName);
}
