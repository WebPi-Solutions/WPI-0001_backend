/**
 * Correos usados como Bearer token (el mock de Firebase devuelve `{ email: token }`).
 */
export const E2E_EMAIL = {
  userA: 'a@e2e.test',
  userB: 'b@e2e.test',
  admin: 'admin@e2e.test',
  outsider: 'outsider@e2e.test',
  unknown: 'unknown@e2e.test',
} as const;

/**
 * Cabecera Authorization para un usuario sembrado.
 *
 * @param email - Email que el mock de Firebase interpretará como identidad
 * @returns Cabecera Bearer
 */
export function authHeader(email: string): { Authorization: string } {
  return { Authorization: `Bearer ${email}` };
}
