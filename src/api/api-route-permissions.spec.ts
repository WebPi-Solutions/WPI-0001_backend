import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { SKIP_ENTERPRISE_ACCESS_KEY } from 'src/common/decorators/enterprise-access.decorator';
import {
  REQUIRE_ENTERPRISE_PERMISSION_KEY,
  RequiredEnterprisePermission,
  SKIP_ENTERPRISE_PERMISSION_KEY,
} from 'src/common/decorators/enterprise-permission.decorator';

/**
 * Recorre `src/api` y lista los ficheros `*.controller.ts`.
 *
 * @param directoryPath - Carpeta a inspeccionar
 * @returns Rutas absolutas de controladores
 */
function listControllerFilePaths(directoryPath: string): string[] {
  const controllerFilePaths: string[] = [];
  for (const entryName of readdirSync(directoryPath)) {
    const entryPath = join(directoryPath, entryName);
    if (statSync(entryPath).isDirectory()) {
      controllerFilePaths.push(...listControllerFilePaths(entryPath));
      continue;
    }
    if (entryName.endsWith('.controller.ts')) {
      controllerFilePaths.push(entryPath);
    }
  }
  return controllerFilePaths;
}

/**
 * Indica si el handler (o la clase) declara RBAC o un skip explícito.
 *
 * @param controllerClass - Clase del controlador
 * @param handler - Método HTTP
 * @returns `true` si hay `@RequirePermission`, `@SkipEnterprisePermission` o `@SkipEnterpriseAccess`
 */
function hasEnterprisePermissionDeclaration(
  controllerClass: new (...arguments_: never[]) => unknown,
  handler: (...arguments_: unknown[]) => unknown,
): boolean {
  return Boolean(
    Reflect.getMetadata(REQUIRE_ENTERPRISE_PERMISSION_KEY, handler) ||
      Reflect.getMetadata(SKIP_ENTERPRISE_PERMISSION_KEY, handler) ||
      Reflect.getMetadata(SKIP_ENTERPRISE_ACCESS_KEY, handler) ||
      Reflect.getMetadata(REQUIRE_ENTERPRISE_PERMISSION_KEY, controllerClass) ||
      Reflect.getMetadata(SKIP_ENTERPRISE_PERMISSION_KEY, controllerClass) ||
      Reflect.getMetadata(SKIP_ENTERPRISE_ACCESS_KEY, controllerClass),
  );
}

/**
 * Describe una ruta HTTP para el mensaje de aserción.
 *
 * @param controllerClass - Clase del controlador
 * @param handlerName - Nombre del método
 * @returns Etiqueta `METHOD /prefijo/ruta`
 */
function describeHttpRoute(
  controllerClass: new (...arguments_: never[]) => unknown,
  handlerName: string,
): string {
  const controllerPath = String(
    Reflect.getMetadata(PATH_METADATA, controllerClass) ?? '',
  );
  const handler = controllerClass.prototype[handlerName] as (
    ...arguments_: unknown[]
  ) => unknown;
  const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod;
  const handlerPath = String(Reflect.getMetadata(PATH_METADATA, handler) ?? '');
  return `${RequestMethod[requestMethod]} /${controllerPath}/${handlerPath}`.replace(
    /\/+/g,
    '/',
  );
}

/**
 * Auditoría: toda ruta HTTP de `src/api` declara permiso o skip.
 */
describe('Declaración de permisos en rutas HTTP de src/api', () => {
  const controllerFilePaths = listControllerFilePaths(__dirname);

  it('encuentra los controladores de API', () => {
    expect(controllerFilePaths.length).toBeGreaterThan(0);
  });

  it('toda ruta HTTP declara @RequirePermission, @SkipEnterprisePermission o @SkipEnterpriseAccess', () => {
    const routesWithoutDeclaration: string[] = [];

    for (const controllerFilePath of controllerFilePaths) {
      const relativeImportPath = relative(__dirname, controllerFilePath)
        .replace(/\\/g, '/')
        .replace(/\.ts$/, '');
      const loadedModule = require(`./${relativeImportPath}`) as Record<
        string,
        unknown
      >;

      for (const exportedValue of Object.values(loadedModule)) {
        if (typeof exportedValue !== 'function') {
          continue;
        }
        const controllerClass = exportedValue as new (
          ...arguments_: never[]
        ) => unknown;
        const controllerPath = Reflect.getMetadata(PATH_METADATA, controllerClass);
        if (controllerPath === undefined) {
          continue;
        }

        for (const handlerName of Object.getOwnPropertyNames(
          controllerClass.prototype,
        )) {
          if (handlerName === 'constructor') {
            continue;
          }
          const handler = controllerClass.prototype[handlerName] as (
            ...arguments_: unknown[]
          ) => unknown;
          if (typeof handler !== 'function') {
            continue;
          }
          if (Reflect.getMetadata(METHOD_METADATA, handler) === undefined) {
            continue;
          }
          if (!hasEnterprisePermissionDeclaration(controllerClass, handler)) {
            routesWithoutDeclaration.push(
              describeHttpRoute(controllerClass, handlerName),
            );
          }
        }
      }
    }

    expect(routesWithoutDeclaration).toEqual([]);
  });

  it('POST /ai-requests exige aiRequests.write (el catálogo no admite write a roles)', () => {
    const { AiRequestController } = require('./ai-request/ai-request.controller') as {
      AiRequestController: new (...arguments_: never[]) => unknown;
    };
    const requiredPermission = Reflect.getMetadata(
      REQUIRE_ENTERPRISE_PERMISSION_KEY,
      AiRequestController.prototype.create,
    ) as RequiredEnterprisePermission;

    expect(requiredPermission).toEqual({
      resource: 'aiRequests',
      action: 'write',
    });
  });
});
