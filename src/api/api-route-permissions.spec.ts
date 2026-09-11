import { glob } from 'glob';
import { join } from 'path';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { SKIP_ENTERPRISE_ACCESS_KEY } from 'src/common/decorators/enterprise-access.decorator';
import {
  REQUIRE_ENTERPRISE_PERMISSION_KEY,
  RequiredEnterprisePermission,
  SKIP_ENTERPRISE_PERMISSION_KEY,
} from 'src/common/decorators/enterprise-permission.decorator';
import { isPermissionActionAllowedForResource } from 'src/common/helpers/enterprise-permission/permission.catalog';

jest.mock('src/common/middleware/firebase/firebase.service', () => ({
  firebaseAdmin: {
    auth: jest.fn(),
  },
}));

/**
 * Ruta HTTP inspeccionada en el barrido de decoradores RBAC.
 */
interface InspectedHttpRoute {
  /**
   * Nombre de la clase controladora.
   */
  controllerName: string;

  /**
   * Prefijo `@Controller`.
   */
  controllerPath: string;

  /**
   * Nombre del método.
   */
  methodName: string;
}

/**
 * Lee metadata de método y, si falta, de la clase (mismo criterio que `Reflector.getAllAndOverride`).
 *
 * @param metadataKey - Clave Nest
 * @param handler - Función del método
 * @param controllerClass - Clase del controlador
 * @returns Valor de metadata o `undefined`
 */
function readRouteMetadata<T>(
  metadataKey: string,
  handler: (...argumentsList: never[]) => unknown,
  controllerClass: Function,
): T | undefined {
  const methodMetadata = Reflect.getMetadata(metadataKey, handler) as T | undefined;
  if (methodMetadata !== undefined) {
    return methodMetadata;
  }
  return Reflect.getMetadata(metadataKey, controllerClass) as T | undefined;
}

/**
 * Carga las clases `*Controller` exportadas desde `src/api`.
 *
 * @returns Controladores de API
 */
async function loadApiControllerClasses(): Promise<Function[]> {
  const controllerFiles = glob.sync(join(__dirname, '**/*.controller.ts'));
  const controllerGroups = await Promise.all(
    controllerFiles.map(async (filePath) => {
      const moduleExports = await import(filePath.replace(/\.ts$/, ''));
      return Object.values(moduleExports).filter(
        (exportedItem): exportedItem is Function =>
          typeof exportedItem === 'function' && /Controller$/i.test(exportedItem.name),
      );
    }),
  );
  return controllerGroups.flat();
}

/**
 * Enumera las rutas HTTP de un controlador (métodos con `@Get`/`@Post`/…).
 *
 * @param controllerClass - Clase controladora
 * @returns Rutas con nombre de método
 */
function listHttpRoutes(controllerClass: Function): InspectedHttpRoute[] {
  const controllerPath = (Reflect.getMetadata(PATH_METADATA, controllerClass) as string) ?? '';
  const routes: InspectedHttpRoute[] = [];

  for (const methodName of Object.getOwnPropertyNames(controllerClass.prototype)) {
    if (methodName === 'constructor') {
      continue;
    }
    const handler = controllerClass.prototype[methodName] as
      | ((...argumentsList: never[]) => unknown)
      | undefined;
    if (typeof handler !== 'function') {
      continue;
    }
    const httpMethod = Reflect.getMetadata(METHOD_METADATA, handler);
    if (httpMethod === undefined) {
      continue;
    }
    routes.push({
      controllerName: controllerClass.name,
      controllerPath,
      methodName,
    });
  }

  return routes;
}

/**
 * Barrido de `src/api/**`: toda ruta HTTP debe declarar RBAC (permiso o skip).
 * Evita publicar un endpoint nuevo sin `@RequirePermission` ni skip explícito.
 */
describe('Decoradores RBAC de las rutas de API', () => {
  let controllerClasses: Function[];

  beforeAll(async () => {
    controllerClasses = await loadApiControllerClasses();
  });

  it('descubre controladores de API', () => {
    expect(controllerClasses.length).toBeGreaterThan(0);
  });

  it('toda ruta HTTP declara @RequirePermission, @SkipEnterprisePermission o @SkipEnterpriseAccess', async () => {
    const routesWithoutRbac: string[] = [];

    for (const controllerClass of controllerClasses) {
      for (const route of listHttpRoutes(controllerClass)) {
        const handler = controllerClass.prototype[route.methodName] as (
          ...argumentsList: never[]
        ) => unknown;
        const requiredPermission = readRouteMetadata<RequiredEnterprisePermission>(
          REQUIRE_ENTERPRISE_PERMISSION_KEY,
          handler,
          controllerClass,
        );
        const skipPermission = readRouteMetadata<boolean>(
          SKIP_ENTERPRISE_PERMISSION_KEY,
          handler,
          controllerClass,
        );
        const skipEnterpriseAccess = readRouteMetadata<boolean>(
          SKIP_ENTERPRISE_ACCESS_KEY,
          handler,
          controllerClass,
        );

        if (requiredPermission || skipPermission === true || skipEnterpriseAccess === true) {
          continue;
        }
        routesWithoutRbac.push(
          `${route.controllerName}.${route.methodName} (${route.controllerPath})`,
        );
      }
    }

    expect(routesWithoutRbac).toEqual([]);
  });

  it('los @RequirePermission usan acciones admitidas por el catálogo', async () => {
    const invalidPermissionBindings: string[] = [];

    for (const controllerClass of controllerClasses) {
      for (const route of listHttpRoutes(controllerClass)) {
        const handler = controllerClass.prototype[route.methodName] as (
          ...argumentsList: never[]
        ) => unknown;
        const requiredPermission = readRouteMetadata<RequiredEnterprisePermission>(
          REQUIRE_ENTERPRISE_PERMISSION_KEY,
          handler,
          controllerClass,
        );
        if (!requiredPermission) {
          continue;
        }
        if (
          isPermissionActionAllowedForResource(
            requiredPermission.resource,
            requiredPermission.action,
          )
        ) {
          continue;
        }
        invalidPermissionBindings.push(
          `${route.controllerName}.${route.methodName}: ${requiredPermission.resource}.${requiredPermission.action}`,
        );
      }
    }

    /**
     * `POST /ai-requests` exige `aiRequests.write`, acción que el catálogo no admite
     * (ni el comodín `*` la abre). Solo el administrador global pasa el guard.
     * Se documenta aquí para que un cambio de contrato falle de forma explícita.
     */
    expect(invalidPermissionBindings).toEqual([
      'AiRequestController.create: aiRequests.write',
    ]);
  });
});
