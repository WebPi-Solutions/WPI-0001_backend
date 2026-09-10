import 'reflect-metadata';
import {
  REQUIRE_ENTERPRISE_ID_KEY,
  RequireEnterpriseId,
  SKIP_ENTERPRISE_ACCESS_KEY,
  SkipEnterpriseAccess,
} from './enterprise-access.decorator';

/**
 * Controlador ficticio para comprobar que los decoradores de acceso
 * escriben la metadata que lee `EnterpriseAccessGuard`.
 */
class DummyEnterpriseAccessController {
  @SkipEnterpriseAccess()
  skippedHandler(): string {
    return 'skip';
  }

  @RequireEnterpriseId()
  requiredHandler(): string {
    return 'require';
  }
}

/**
 * Pruebas de `@SkipEnterpriseAccess` y `@RequireEnterpriseId`.
 * Un cambio en las claves rompería el guard global sin fallar en compile.
 */
describe('Decoradores de acceso por empresa', () => {
  it('expone las claves de metadata que consume el guard', () => {
    expect(SKIP_ENTERPRISE_ACCESS_KEY).toBe('skip_enterprise_access');
    expect(REQUIRE_ENTERPRISE_ID_KEY).toBe('require_enterprise_id');
  });

  it('SkipEnterpriseAccess y RequireEnterpriseId son factorías de decorador', () => {
    expect(typeof SkipEnterpriseAccess()).toBe('function');
    expect(typeof RequireEnterpriseId()).toBe('function');
  });

  it('guarda true en la metadata del método decorado', () => {
    expect(
      Reflect.getMetadata(
        SKIP_ENTERPRISE_ACCESS_KEY,
        DummyEnterpriseAccessController.prototype.skippedHandler,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        REQUIRE_ENTERPRISE_ID_KEY,
        DummyEnterpriseAccessController.prototype.requiredHandler,
      ),
    ).toBe(true);
  });
});
