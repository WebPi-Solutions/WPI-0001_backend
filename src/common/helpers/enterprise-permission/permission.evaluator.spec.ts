import {
  ADMINISTRATOR_ROLE_PERMISSIONS,
  EMPLOYEE_ROLE_PERMISSIONS,
  ENTERPRISE_ROLE_NAME_ADMINISTRATOR,
  ENTERPRISE_ROLE_NAME_EMPLOYEE,
  EnterpriseRolePermissions,
  isCatalogPermissionAction,
  isCatalogPermissionResource,
  isPermissionActionAllowedForResource,
  getAllowedPermissionActions,
  isProtectedDefaultEnterpriseRoleName,
} from './permission.catalog';
import {
  hasEnterprisePermission,
  implyReadWhenMutationIsGranted,
  revokeMutationsWhenReadIsNotGranted,
  validateEnterpriseRolePermissionsPayload,
} from './permission.evaluator';

/**
 * Pruebas del evaluador: deny by default, comodín `*` y validación del JSONB.
 */
describe('permission.catalog helpers', () => {
  it('reconoce recursos y acciones del catálogo', () => {
    expect(isCatalogPermissionResource('invoices')).toBe(true);
    expect(isCatalogPermissionResource('foo')).toBe(false);
    expect(isCatalogPermissionAction('read')).toBe(true);
    expect(isCatalogPermissionAction('publish')).toBe(false);
    expect(isCatalogPermissionResource('userEnterprises')).toBe(false);
    expect(isPermissionActionAllowedForResource('aiRequests', 'read')).toBe(true);
    expect(isPermissionActionAllowedForResource('aiRequests', 'write')).toBe(false);
    expect(isCatalogPermissionResource('metrics')).toBe(false);
    expect(isPermissionActionAllowedForResource('enterprises', 'delete')).toBe(false);
  });

  it('identifica los roles por defecto no eliminables', () => {
    expect(isProtectedDefaultEnterpriseRoleName(ENTERPRISE_ROLE_NAME_ADMINISTRATOR)).toBe(
      true,
    );
    expect(isProtectedDefaultEnterpriseRoleName(ENTERPRISE_ROLE_NAME_EMPLOYEE)).toBe(true);
    expect(isProtectedDefaultEnterpriseRoleName('Contable')).toBe(false);
    expect(isProtectedDefaultEnterpriseRoleName('  ')).toBe(false);
    expect(isProtectedDefaultEnterpriseRoleName(null)).toBe(false);
    expect(isProtectedDefaultEnterpriseRoleName(undefined)).toBe(false);
    expect(getAllowedPermissionActions('invoices')).toEqual(
      expect.arrayContaining(['read', 'write', 'delete']),
    );
    expect(
      getAllowedPermissionActions('recurso-inventado' as never),
    ).toEqual([]);
  });
});

describe('permission.evaluator', () => {
  describe('hasEnterprisePermission', () => {
    it('deniega si no hay mapa, no es objeto o está vacío', () => {
      expect(hasEnterprisePermission(undefined, 'invoices', 'read')).toBe(false);
      expect(hasEnterprisePermission(null, 'invoices', 'read')).toBe(false);
      expect(hasEnterprisePermission(EMPLOYEE_ROLE_PERMISSIONS, 'invoices', 'read')).toBe(
        false,
      );
      expect(
        hasEnterprisePermission(
          [] as unknown as Record<string, never>,
          'invoices',
          'read',
        ),
      ).toBe(false);
    });

    it('concede solo la acción marcada a true en el recurso', () => {
      const permissions = { invoices: { read: true, write: false } };
      expect(hasEnterprisePermission(permissions, 'invoices', 'read')).toBe(true);
      expect(hasEnterprisePermission(permissions, 'invoices', 'write')).toBe(false);
      expect(hasEnterprisePermission(permissions, 'invoices', 'delete')).toBe(false);
      expect(hasEnterprisePermission(permissions, 'clients', 'read')).toBe(false);
    });

    it('el comodín * concede la acción a cualquier recurso del catálogo', () => {
      expect(
        hasEnterprisePermission(ADMINISTRATOR_ROLE_PERMISSIONS, 'invoices', 'delete'),
      ).toBe(true);
      expect(
        hasEnterprisePermission(ADMINISTRATOR_ROLE_PERMISSIONS, 'billing', 'write'),
      ).toBe(true);
    });

    it('el comodín * no abre acciones fuera del contrato del recurso', () => {
      expect(
        hasEnterprisePermission(ADMINISTRATOR_ROLE_PERMISSIONS, 'aiRequests', 'write'),
      ).toBe(false);
      expect(
        hasEnterprisePermission(ADMINISTRATOR_ROLE_PERMISSIONS, 'aiRequests', 'delete'),
      ).toBe(false);
      expect(
        hasEnterprisePermission(ADMINISTRATOR_ROLE_PERMISSIONS, 'enterprises', 'delete'),
      ).toBe(false);
      expect(
        hasEnterprisePermission(ADMINISTRATOR_ROLE_PERMISSIONS, 'aiRequests', 'read'),
      ).toBe(true);
      expect(
        hasEnterprisePermission(ADMINISTRATOR_ROLE_PERMISSIONS, 'enterprises', 'write'),
      ).toBe(true);
    });

    it('un * parcial no abre el resto de acciones', () => {
      const permissions = { '*': { read: true } };
      expect(hasEnterprisePermission(permissions, 'spents', 'read')).toBe(true);
      expect(hasEnterprisePermission(permissions, 'spents', 'write')).toBe(false);
    });
  });

  describe('validateEnterpriseRolePermissionsPayload', () => {
    it('acepta undefined, null, vacío y un mapa válido', () => {
      expect(validateEnterpriseRolePermissionsPayload(undefined)).toBeNull();
      expect(validateEnterpriseRolePermissionsPayload(null)).toBeNull();
      expect(validateEnterpriseRolePermissionsPayload({})).toBeNull();
      expect(
        validateEnterpriseRolePermissionsPayload({
          invoices: { read: true },
          '*': { write: false },
        }),
      ).toBeNull();
    });

    it('rechaza arrays, recursos u acciones desconocidas y valores no booleanos', () => {
      expect(validateEnterpriseRolePermissionsPayload([])).toContain('objeto');
      expect(validateEnterpriseRolePermissionsPayload({ foo: { read: true } })).toContain(
        'desconocido',
      );
      expect(
        validateEnterpriseRolePermissionsPayload({ invoices: { publish: true } }),
      ).toContain('desconocida');
      expect(
        validateEnterpriseRolePermissionsPayload({ invoices: { read: 'yes' } }),
      ).toContain('booleano');
      expect(validateEnterpriseRolePermissionsPayload({ invoices: [] })).toContain(
        'acciones',
      );
      expect(
        validateEnterpriseRolePermissionsPayload({ invoices: undefined }),
      ).toBeNull();
    });

    it('rechaza acciones que el recurso no admite y el recurso userEnterprises', () => {
      expect(
        validateEnterpriseRolePermissionsPayload({ aiRequests: { write: true } }),
      ).toContain('no está disponible');
      expect(
        validateEnterpriseRolePermissionsPayload({ metrics: { read: true } }),
      ).toContain('desconocido');
      expect(
        validateEnterpriseRolePermissionsPayload({ enterprises: { delete: true } }),
      ).toContain('no está disponible');
      expect(
        validateEnterpriseRolePermissionsPayload({ userEnterprises: { read: true } }),
      ).toContain('desconocido');
    });
  });

  describe('implyReadWhenMutationIsGranted', () => {
    it('devuelve vacío si el mapa no es un objeto', () => {
      expect(implyReadWhenMutationIsGranted(undefined)).toEqual({});
      expect(implyReadWhenMutationIsGranted(null)).toEqual({});
      expect(
        implyReadWhenMutationIsGranted([] as unknown as Record<string, never>),
      ).toEqual({});
    });

    it('añade lectura si solo llega escritura o borrado', () => {
      expect(implyReadWhenMutationIsGranted({ invoices: { write: true } })).toEqual({
        invoices: { write: true, read: true },
      });
      expect(implyReadWhenMutationIsGranted({ clients: { delete: true } })).toEqual({
        clients: { delete: true, read: true },
      });
    });

    it('pisa read:false cuando hay una mutación concedida', () => {
      expect(
        implyReadWhenMutationIsGranted({
          invoices: { write: true, read: false },
        }),
      ).toEqual({ invoices: { write: true, read: true } });
    });

    it('no altera un mapa que solo tiene lectura o está vacío', () => {
      const readOnlyPermissions = { invoices: { read: true } };
      expect(implyReadWhenMutationIsGranted(readOnlyPermissions)).toEqual({
        invoices: { read: true },
      });
      expect(implyReadWhenMutationIsGranted(readOnlyPermissions)).not.toBe(
        readOnlyPermissions,
      );
      expect(implyReadWhenMutationIsGranted({})).toEqual({});
    });

    it('implica lectura en el comodín * si hay escritura', () => {
      expect(implyReadWhenMutationIsGranted({ '*': { write: true } })).toEqual({
        '*': { write: true, read: true },
      });
    });

    it('omite mapas de acción que no son objeto', () => {
      expect(
        implyReadWhenMutationIsGranted({
          invoices: undefined,
        } as EnterpriseRolePermissions),
      ).toEqual({});
      expect(
        implyReadWhenMutationIsGranted({
          invoices: ['read'],
        } as unknown as EnterpriseRolePermissions),
      ).toEqual({});
    });
  });

  describe('revokeMutationsWhenReadIsNotGranted', () => {
    it('devuelve vacío si el mapa no es un objeto', () => {
      expect(revokeMutationsWhenReadIsNotGranted(undefined)).toEqual({});
      expect(revokeMutationsWhenReadIsNotGranted(null)).toEqual({});
    });

    it('quita escritura y borrado si no hay lectura', () => {
      expect(revokeMutationsWhenReadIsNotGranted({ invoices: { write: true } })).toEqual(
        {},
      );
      expect(
        revokeMutationsWhenReadIsNotGranted({
          clients: { delete: true, read: false },
        }),
      ).toEqual({ clients: { read: false } });
    });

    it('conserva mutaciones si la lectura sigue concedida', () => {
      expect(
        revokeMutationsWhenReadIsNotGranted({
          invoices: { read: true, write: true, delete: true },
        }),
      ).toEqual({ invoices: { read: true, write: true, delete: true } });
    });

    it('revoca mutaciones del comodín * sin lectura', () => {
      expect(revokeMutationsWhenReadIsNotGranted({ '*': { write: true } })).toEqual({});
    });

    it('omite mapas de acción que no son objeto', () => {
      expect(
        revokeMutationsWhenReadIsNotGranted({
          invoices: undefined,
        } as EnterpriseRolePermissions),
      ).toEqual({});
    });
  });
});
