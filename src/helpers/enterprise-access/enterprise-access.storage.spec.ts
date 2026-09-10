import { AccessContext } from './access-context';
import {
  getEnterpriseAccessContext,
  runWithEnterpriseAccessContext,
} from './enterprise-access.storage';

/**
 * Pruebas del AsyncLocalStorage de acceso por empresa.
 * Garantiza aislamiento entre peticiones y limpieza al salir del callback.
 */
describe('enterprise-access.storage', () => {
  const outerAccessContext: AccessContext = {
    userId: 'user-outer',
    isGlobalAdmin: false,
    allowedEnterpriseIds: ['empresa-a'],
  };
  const innerAccessContext: AccessContext = {
    userId: 'user-inner',
    isGlobalAdmin: true,
    allowedEnterpriseIds: ['empresa-b'],
  };

  it('devuelve undefined fuera de una petición instrumentada', () => {
    expect(getEnterpriseAccessContext()).toBeUndefined();
  });

  it('expone el contexto solo dentro del callback y lo limpia al salir', () => {
    const returnedValue = runWithEnterpriseAccessContext(outerAccessContext, () => {
      expect(getEnterpriseAccessContext()).toEqual(outerAccessContext);
      return 'ok';
    });

    expect(returnedValue).toBe('ok');
    expect(getEnterpriseAccessContext()).toBeUndefined();
  });

  it('el contexto anidado sustituye al exterior y restaura el original al salir', () => {
    runWithEnterpriseAccessContext(outerAccessContext, () => {
      expect(getEnterpriseAccessContext()?.userId).toBe('user-outer');

      runWithEnterpriseAccessContext(innerAccessContext, () => {
        expect(getEnterpriseAccessContext()).toEqual(innerAccessContext);
      });

      expect(getEnterpriseAccessContext()).toEqual(outerAccessContext);
    });

    expect(getEnterpriseAccessContext()).toBeUndefined();
  });
});
