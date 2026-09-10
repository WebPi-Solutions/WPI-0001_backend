import { AsyncLocalStorage } from 'node:async_hooks';
import { AccessContext } from './access-context';

/**
 * Almacenamiento asíncrono del {@link AccessContext} de la petición en curso.
 * El interceptor de acceso lo rellena para que los servicios no dependan de `Request`.
 */
const enterpriseAccessStorage = new AsyncLocalStorage<AccessContext>();

/**
 * Ejecuta `callback` con el contexto de acceso visible en toda la cadena asíncrona.
 *
 * @param accessContext - Contexto de la petición
 * @param callback - Función a ejecutar dentro del contexto
 * @returns El valor devuelto por `callback`
 */
export function runWithEnterpriseAccessContext<T>(
  accessContext: AccessContext,
  callback: () => T,
): T {
  return enterpriseAccessStorage.run(accessContext, callback);
}

/**
 * Obtiene el contexto de acceso de la petición actual, si el interceptor lo estableció.
 *
 * @returns El contexto o `undefined` si no hay petición HTTP instrumentada
 */
export function getEnterpriseAccessContext(): AccessContext | undefined {
  return enterpriseAccessStorage.getStore();
}
