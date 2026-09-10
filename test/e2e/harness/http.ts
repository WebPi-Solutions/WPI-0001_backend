import * as request from 'supertest';
import { getE2eApp } from './world';

/**
 * Cliente HTTP de supertest apuntando a la app e2e compartida.
 *
 * @returns SuperTest
 */
export function http() {
  return request(getE2eApp().getHttpServer());
}

/**
 * Afirma que la petición se rechazó por autenticación (401) o autorización (403).
 *
 * @param status - Código HTTP recibido
 */
export function expectAuthRejected(status: number): void {
  expect([401, 403]).toContain(status);
}

/**
 * Afirma 404 de IDOR (recurso de otra empresa, sin filtrar existencia).
 *
 * @param status - Código HTTP recibido
 */
export function expectIdorHidden(status: number): void {
  expect(status).toBe(404);
}
