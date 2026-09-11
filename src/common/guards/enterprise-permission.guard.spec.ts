import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { SKIP_ENTERPRISE_ACCESS_KEY } from 'src/common/decorators/enterprise-access.decorator';
import {
  REQUIRE_ENTERPRISE_PERMISSION_KEY,
  SKIP_ENTERPRISE_PERMISSION_KEY,
} from 'src/common/decorators/enterprise-permission.decorator';
import { AccessContext } from 'src/common/helpers/enterprise-access/access-context';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { UserRepository } from 'src/entities/user/user-repository.service';
import { EnterprisePermissionGuard } from './enterprise-permission.guard';

/**
 * Pruebas del guard global de permisos por rol de empresa.
 */
describe('EnterprisePermissionGuard', () => {
  let guard: EnterprisePermissionGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  const allowedEnterpriseId = 'enterprise-uuid';

  const employeeAccessContext: AccessContext = {
    userId: 'user-uuid',
    isGlobalAdmin: false,
    allowedEnterpriseIds: [allowedEnterpriseId],
    permissionsByEnterpriseId: { [allowedEnterpriseId]: {} },
  };

  const adminAccessContext: AccessContext = {
    userId: 'admin-uuid',
    isGlobalAdmin: true,
    allowedEnterpriseIds: [],
  };

  /**
   * Construye un ExecutionContext HTTP mínimo.
   *
   * @param requestOverrides - Campos de la petición
   * @returns Contexto Nest simulado
   */
  const createExecutionContext = (
    requestOverrides: Partial<Request> = {},
  ): ExecutionContext => {
    const request = {
      query: {},
      body: undefined,
      params: {},
      accessContext: employeeAccessContext,
      ...requestOverrides,
    } as Request;

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => jest.fn(),
      getClass: () => class TestController {},
    } as unknown as ExecutionContext;
  };

  /**
   * Configura la metadata de skip y permiso exigido.
   *
   * @param options - Flags de la ruta
   */
  const mockRouteMetadata = (options: {
    skipPermission?: boolean;
    skipEnterpriseAccess?: boolean;
    requiredPermission?: { resource: string; action: string } | undefined;
  }): void => {
    reflector.getAllAndOverride.mockImplementation((metadataKey: string) => {
      if (metadataKey === SKIP_ENTERPRISE_PERMISSION_KEY) {
        return options.skipPermission === true;
      }
      if (metadataKey === SKIP_ENTERPRISE_ACCESS_KEY) {
        return options.skipEnterpriseAccess === true;
      }
      if (metadataKey === REQUIRE_ENTERPRISE_PERMISSION_KEY) {
        return options.requiredPermission;
      }
      return undefined;
    });
  };

  beforeEach(async () => {
    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        EnterprisePermissionGuard,
        EnterpriseAccessService,
        { provide: Reflector, useValue: reflector },
        { provide: UserRepository, useValue: {} },
      ],
    }).compile();

    guard = testingModule.get(EnterprisePermissionGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('permite si la ruta omite el guard de permisos', () => {
    mockRouteMetadata({ skipPermission: true });
    expect(guard.canActivate(createExecutionContext())).toBe(true);
  });

  it('permite si la ruta omite el acceso por empresa', () => {
    mockRouteMetadata({
      skipEnterpriseAccess: true,
      requiredPermission: { resource: 'clients', action: 'read' },
    });
    expect(guard.canActivate(createExecutionContext())).toBe(true);
  });

  it('permite si la ruta no exige un permiso', () => {
    mockRouteMetadata({});
    expect(guard.canActivate(createExecutionContext())).toBe(true);
  });

  it('permite si no hay AccessContext (ruta pública)', () => {
    mockRouteMetadata({
      requiredPermission: { resource: 'clients', action: 'read' },
    });
    expect(
      guard.canActivate(createExecutionContext({ accessContext: undefined })),
    ).toBe(true);
  });

  it('omite el RBAC para el administrador global', () => {
    mockRouteMetadata({
      requiredPermission: { resource: 'clients', action: 'delete' },
    });
    expect(
      guard.canActivate(
        createExecutionContext({
          accessContext: adminAccessContext,
          query: { enterpriseId: allowedEnterpriseId },
        }),
      ),
    ).toBe(true);
  });

  it('permite la ruta por UUID sin enterpriseId (el servicio comprobará después)', () => {
    mockRouteMetadata({
      requiredPermission: { resource: 'clients', action: 'read' },
    });
    expect(guard.canActivate(createExecutionContext())).toBe(true);
  });

  it('lanza 403 si el rol no concede la acción (deny by default)', () => {
    mockRouteMetadata({
      requiredPermission: { resource: 'clients', action: 'read' },
    });
    expect(() =>
      guard.canActivate(
        createExecutionContext({
          query: { enterpriseId: allowedEnterpriseId },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('permite si el rol concede la acción en la empresa del query', () => {
    mockRouteMetadata({
      requiredPermission: { resource: 'clients', action: 'read' },
    });
    expect(
      guard.canActivate(
        createExecutionContext({
          accessContext: {
            ...employeeAccessContext,
            permissionsByEnterpriseId: {
              [allowedEnterpriseId]: { clients: { read: true } },
            },
          },
          query: { enterpriseId: allowedEnterpriseId },
        }),
      ),
    ).toBe(true);
  });

  it('extrae enterpriseId del body.enterpriseId', () => {
    mockRouteMetadata({
      requiredPermission: { resource: 'clients', action: 'read' },
    });
    expect(() =>
      guard.canActivate(
        createExecutionContext({
          body: { enterpriseId: allowedEnterpriseId },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('extrae enterpriseId de params', () => {
    mockRouteMetadata({
      requiredPermission: { resource: 'clients', action: 'read' },
    });
    expect(() =>
      guard.canActivate(
        createExecutionContext({
          params: { enterpriseId: allowedEnterpriseId },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('ignora enterpriseId en blanco', () => {
    mockRouteMetadata({
      requiredPermission: { resource: 'clients', action: 'read' },
    });
    expect(
      guard.canActivate(
        createExecutionContext({
          query: { enterpriseId: '   ' },
        }),
      ),
    ).toBe(true);
  });

  it('extrae enterpriseId del body y de userEnterprises[0]', () => {
    mockRouteMetadata({
      requiredPermission: { resource: 'users', action: 'write' },
    });
    expect(() =>
      guard.canActivate(
        createExecutionContext({
          body: { userEnterprises: [{ enterpriseId: allowedEnterpriseId }] },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('prefiere query.enterpriseId frente al body', () => {
    mockRouteMetadata({
      requiredPermission: { resource: 'clients', action: 'read' },
    });
    expect(
      guard.canActivate(
        createExecutionContext({
          accessContext: {
            ...employeeAccessContext,
            permissionsByEnterpriseId: {
              [allowedEnterpriseId]: { clients: { read: true } },
            },
          },
          query: { enterpriseId: allowedEnterpriseId },
          body: { enterpriseId: 'empresa-del-body' },
        }),
      ),
    ).toBe(true);
  });

  it('ignora enterpriseId no string (array de query duplicada)', () => {
    mockRouteMetadata({
      requiredPermission: { resource: 'clients', action: 'read' },
    });
    expect(
      guard.canActivate(
        createExecutionContext({
          query: { enterpriseId: [allowedEnterpriseId, 'otra'] as unknown as string },
        }),
      ),
    ).toBe(true);
  });

  it('no trata un body no objeto ni userEnterprises vacío como tenant', () => {
    mockRouteMetadata({
      requiredPermission: { resource: 'clients', action: 'read' },
    });
    expect(
      guard.canActivate(
        createExecutionContext({
          body: 'texto' as unknown as Request['body'],
        }),
      ),
    ).toBe(true);
    expect(
      guard.canActivate(
        createExecutionContext({
          body: { userEnterprises: [] },
        }),
      ),
    ).toBe(true);
  });
});
