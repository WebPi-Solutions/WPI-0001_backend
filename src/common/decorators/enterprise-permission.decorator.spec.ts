import {
  REQUIRE_ENTERPRISE_PERMISSION_KEY,
  RequirePermission,
  SKIP_ENTERPRISE_PERMISSION_KEY,
  SkipEnterprisePermission,
} from './enterprise-permission.decorator';

/**
 * Controlador ficticio para comprobar que los decoradores de RBAC guardan metadata.
 */
class DummyPermissionController {
  @RequirePermission('clients', 'read')
  listClients(): void {
    return;
  }

  @SkipEnterprisePermission()
  publicCatalog(): void {
    return;
  }
}

/**
 * Pruebas de los decoradores `@RequirePermission` y `@SkipEnterprisePermission`.
 */
describe('enterprise-permission.decorator', () => {
  it('RequirePermission guarda recurso y acción en la metadata del método', () => {
    const storedPermission = Reflect.getMetadata(
      REQUIRE_ENTERPRISE_PERMISSION_KEY,
      DummyPermissionController.prototype.listClients,
    );

    expect(storedPermission).toEqual({ resource: 'clients', action: 'read' });
  });

  it('SkipEnterprisePermission marca el método para omitir el guard de rol', () => {
    const shouldSkip = Reflect.getMetadata(
      SKIP_ENTERPRISE_PERMISSION_KEY,
      DummyPermissionController.prototype.publicCatalog,
    );

    expect(shouldSkip).toBe(true);
  });
});
