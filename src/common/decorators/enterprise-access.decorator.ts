import { SetMetadata } from '@nestjs/common';

/**
 * Clave de metadata para omitir la validación de pertenencia a empresa.
 */
export const SKIP_ENTERPRISE_ACCESS_KEY = 'skip_enterprise_access';

/**
 * Clave de metadata para exigir `enterpriseId` en query, body o params.
 */
export const REQUIRE_ENTERPRISE_ID_KEY = 'require_enterprise_id';

/**
 * Omite la comprobación de `enterpriseId` en el guard de acceso (catálogo Stripe, `/users/myself`, health).
 * El contexto de acceso se sigue adjuntando a la petición si hay usuario autenticado.
 *
 * @returns Decorador de clase o método
 */
export const SkipEnterpriseAccess = () => SetMetadata(SKIP_ENTERPRISE_ACCESS_KEY, true);

/**
 * Exige que la petición informe `enterpriseId` (query, body o param homónimo).
 * Si falta, el guard responde 400. Si está, se valida el vínculo `user_enterprise`.
 *
 * @returns Decorador de clase o método
 */
export const RequireEnterpriseId = () => SetMetadata(REQUIRE_ENTERPRISE_ID_KEY, true);
