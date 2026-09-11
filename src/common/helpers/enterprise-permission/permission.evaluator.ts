import {
  EnterpriseRolePermissions,
  PermissionAction,
  PermissionActionMap,
  PermissionResource,
  isCatalogPermissionAction,
  isCatalogPermissionResource,
  isPermissionActionAllowedForResource,
} from './permission.catalog';

/**
 * Evalúa si un mapa JSONB concede una acción sobre un recurso.
 * Deny by default: ausencia de clave o valor distinto de `true` deniega.
 * El comodín `*` concede la acción a cualquier recurso si `permissions['*'][action] === true`.
 *
 * @param permissions - JSONB del rol (puede ser nulo o no objeto)
 * @param resource - Recurso del catálogo
 * @param action - Acción solicitada
 * @returns `true` solo si hay concesión explícita
 */
export function hasEnterprisePermission(
  permissions: EnterpriseRolePermissions | null | undefined,
  resource: PermissionResource,
  action: PermissionAction,
): boolean {
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
    return false;
  }

  if (!isPermissionActionAllowedForResource(resource, action)) {
    return false;
  }

  const wildcardActions = permissions['*'];
  if (isActionGranted(wildcardActions, action)) {
    return true;
  }

  const resourceActions = permissions[resource];
  return isActionGranted(resourceActions, action);
}

/**
 * Comprueba que un JSON de permisos solo use recursos/acciones del catálogo (y `*`).
 *
 * @param permissions - Cuerpo recibido en create/update de rol
 * @returns Mensaje de error o `null` si es válido
 */
export function validateEnterpriseRolePermissionsPayload(
  permissions: unknown,
): string | null {
  if (permissions === null || permissions === undefined) {
    return null;
  }
  if (typeof permissions !== 'object' || Array.isArray(permissions)) {
    return 'Los permisos deben ser un objeto JSON';
  }

  for (const [resourceKey, actionMap] of Object.entries(
    permissions as Record<string, unknown>,
  )) {
    if (resourceKey !== '*' && !isCatalogPermissionResource(resourceKey)) {
      return `Recurso de permiso desconocido: ${resourceKey}`;
    }
    if (actionMap === undefined) {
      continue;
    }
    if (typeof actionMap !== 'object' || actionMap === null || Array.isArray(actionMap)) {
      return `Las acciones de «${resourceKey}» deben ser un objeto`;
    }
    for (const [actionKey, actionGranted] of Object.entries(
      actionMap as Record<string, unknown>,
    )) {
      if (!isCatalogPermissionAction(actionKey)) {
        return `Acción de permiso desconocida: ${actionKey}`;
      }
      if (
        resourceKey !== '*' &&
        isCatalogPermissionResource(resourceKey) &&
        !isPermissionActionAllowedForResource(resourceKey, actionKey)
      ) {
        return `La acción ${actionKey} no está disponible para «${resourceKey}»`;
      }
      if (typeof actionGranted !== 'boolean') {
        return `El valor de ${resourceKey}.${actionKey} debe ser booleano`;
      }
    }
  }

  return null;
}

/**
 * Añade `read: true` a cada recurso (o al comodín `*`) que tenga `write` o `delete`.
 * Crear o borrar una entidad exige poder verla. No muta el objeto de entrada.
 *
 * @param permissions - JSONB ya validado (o vacío)
 * @returns Copia con lectura implicada donde corresponda
 */
export function implyReadWhenMutationIsGranted(
  permissions: EnterpriseRolePermissions | null | undefined,
): EnterpriseRolePermissions {
  return normalizeEnterpriseRolePermissions(permissions, 'imply-read');
}

/**
 * Quita `write` y `delete` de cada recurso (o del comodín `*`) si `read` no es `true`.
 * Revocar la lectura implica no poder crear ni borrar esa entidad.
 *
 * @param permissions - JSONB ya validado (o vacío)
 * @returns Copia sin mutaciones huérfanas
 */
export function revokeMutationsWhenReadIsNotGranted(
  permissions: EnterpriseRolePermissions | null | undefined,
): EnterpriseRolePermissions {
  return normalizeEnterpriseRolePermissions(permissions, 'revoke-mutations');
}

/**
 * Normaliza el JSONB de permisos según la consistencia lectura ↔ mutación.
 * No muta el objeto de entrada.
 *
 * @param permissions - JSONB ya validado (o vacío)
 * @param consistencyMode - Dirección de la normalización
 * @returns Copia normalizada
 */
function normalizeEnterpriseRolePermissions(
  permissions: EnterpriseRolePermissions | null | undefined,
  consistencyMode: 'imply-read' | 'revoke-mutations',
): EnterpriseRolePermissions {
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
    return {};
  }

  const normalizedPermissions: EnterpriseRolePermissions = {};

  for (const [resourceKey, actionMap] of Object.entries(permissions)) {
    if (!actionMap || typeof actionMap !== 'object' || Array.isArray(actionMap)) {
      continue;
    }

    const nextActionMap: PermissionActionMap = { ...actionMap };
    applyPermissionConsistencyToActionMap(nextActionMap, resourceKey, consistencyMode);
    if (Object.keys(nextActionMap).length === 0) {
      continue;
    }

    if (resourceKey === '*') {
      normalizedPermissions['*'] = nextActionMap;
      continue;
    }
    if (isCatalogPermissionResource(resourceKey)) {
      normalizedPermissions[resourceKey] = nextActionMap;
    }
  }

  return normalizedPermissions;
}

/**
 * Aplica la consistencia lectura ↔ mutación sobre un mapa de acciones.
 *
 * @param actionMap - Mapa a ajustar (se muta)
 * @param resourceKey - Recurso del catálogo o `*`
 * @param consistencyMode - Dirección de la normalización
 */
function applyPermissionConsistencyToActionMap(
  actionMap: PermissionActionMap,
  resourceKey: string,
  consistencyMode: 'imply-read' | 'revoke-mutations',
): void {
  const mutationIsGranted = actionMap.write === true || actionMap.delete === true;
  const readIsGranted = actionMap.read === true;

  if (consistencyMode === 'imply-read') {
    if (mutationIsGranted && canImplyReadForPermissionKey(resourceKey)) {
      actionMap.read = true;
    }
    return;
  }

  if (!readIsGranted && mutationIsGranted) {
    delete actionMap.write;
    delete actionMap.delete;
  }
}

/**
 * Indica si la clave admite implicar `read` (comodín o recurso con lectura en el contrato).
 *
 * @param resourceKey - Recurso del catálogo o `*`
 * @returns `true` si se puede marcar lectura
 */
function canImplyReadForPermissionKey(resourceKey: string): boolean {
  if (resourceKey === '*') {
    return true;
  }
  return (
    isCatalogPermissionResource(resourceKey) &&
    isPermissionActionAllowedForResource(resourceKey, 'read')
  );
}

/**
 * Indica si el mapa de acciones concede explícitamente la acción.
 *
 * @param actionMap - Mapa read/write/delete
 * @param action - Acción a comprobar
 * @returns `true` si el valor es estrictamente `true`
 */
function isActionGranted(
  actionMap: Partial<Record<PermissionAction, boolean>> | undefined,
  action: PermissionAction,
): boolean {
  return actionMap?.[action] === true;
}
