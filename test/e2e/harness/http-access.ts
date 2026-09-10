import { E2E_EMAIL, authHeader } from './auth';
import { http } from './http';
import { E2eSeed } from './seed';

/**
 * Verbo HTTP usado en la matriz e2e.
 */
export type E2eHttpMethod = 'get' | 'post' | 'patch' | 'delete';

/**
 * Ejecuta una petición autenticada (o anónima) contra la app e2e.
 *
 * @param method - Verbo HTTP
 * @param path - Ruta
 * @param options - Query, cuerpo y email (si se omite, no hay Authorization)
 * @returns Respuesta de SuperTest
 */
export async function e2eRequest(
  method: E2eHttpMethod,
  path: string,
  options: {
    email?: string;
    query?: Record<string, string | number | undefined>;
    body?: object;
  } = {},
) {
  let requestBuilder = http()[method](path);
  if (options.query) {
    requestBuilder = requestBuilder.query(options.query);
  }
  if (options.email) {
    requestBuilder = requestBuilder.set(authHeader(options.email));
  }
  if (options.body && (method === 'post' || method === 'patch')) {
    requestBuilder = requestBuilder.send(options.body);
  }
  return requestBuilder;
}

/**
 * Empresa A del dataset, para query params de tenant.
 *
 * @param seed - Semilla e2e
 * @returns Query con enterpriseId de A
 */
export function enterpriseAQuery(seed: E2eSeed): { enterpriseId: string } {
  return { enterpriseId: seed.enterpriseA.id };
}

/**
 * Empresa B del dataset.
 *
 * @param seed - Semilla e2e
 * @returns Query con enterpriseId de B
 */
export function enterpriseBQuery(seed: E2eSeed): { enterpriseId: string } {
  return { enterpriseId: seed.enterpriseB.id };
}

export { E2E_EMAIL };
