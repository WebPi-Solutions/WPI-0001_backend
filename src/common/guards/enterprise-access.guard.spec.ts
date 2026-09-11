import { BadRequestException, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import {
  REQUIRE_ENTERPRISE_ID_KEY,
  SKIP_ENTERPRISE_ACCESS_KEY,
} from 'src/common/decorators/enterprise-access.decorator';
import { User, UserRoleTypes } from 'src/entities/user/user.entity';
import { UserRepository } from 'src/entities/user/user-repository.service';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { EnterpriseAccessGuard } from './enterprise-access.guard';

/**
 * Pruebas del guard global de pertenencia a empresa.
 * Cubre skip, exigencia de `enterpriseId`, 403, bypass de administrador y extracción de IDs.
 */
describe('EnterpriseAccessGuard', () => {
  let guard: EnterpriseAccessGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  const allowedEnterpriseId = 'enterprise-uuid';
  const foreignEnterpriseId = 'otra-empresa';

  const regularUser = {
    id: 'user-uuid',
    role: UserRoleTypes.USER,
    userEnterprises: [{ enterpriseId: allowedEnterpriseId }],
  } as User;

  const globalAdminUser = {
    id: 'admin-uuid',
    role: UserRoleTypes.ADMIN,
    userEnterprises: [],
  } as User;

  /**
   * Construye un ExecutionContext HTTP mínimo con query, body y params.
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
   * Configura el Reflector para skip y/o require de empresa.
   * @param options - Flags de metadata de ruta
   */
  const mockRouteMetadata = (options: {
    skip?: boolean;
    requireEnterpriseId?: boolean;
  }): void => {
    reflector.getAllAndOverride.mockImplementation((metadataKey: string) => {
      if (metadataKey === SKIP_ENTERPRISE_ACCESS_KEY) {
        return options.skip === true;
      }
      if (metadataKey === REQUIRE_ENTERPRISE_ID_KEY) {
        return options.requireEnterpriseId === true;
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
        EnterpriseAccessGuard,
        EnterpriseAccessService,
        { provide: Reflector, useValue: reflector },
        { provide: UserRepository, useValue: {} },
      ],
    }).compile();

    guard = testingModule.get(EnterpriseAccessGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('permite la petición y no exige empresa si no hay usuario autenticado', () => {
    const executionContext = createExecutionContext();

    expect(guard.canActivate(executionContext)).toBe(true);
  });

  it('adjunta accessContext y permite el acceso a una empresa vinculada', () => {
    const executionContext = createExecutionContext({
      user: regularUser,
      query: { enterpriseId: allowedEnterpriseId },
    });

    expect(guard.canActivate(executionContext)).toBe(true);
    const request = executionContext.switchToHttp().getRequest<Request>();
    expect(request.accessContext).toEqual({
      userId: regularUser.id,
      isGlobalAdmin: false,
      allowedEnterpriseIds: [allowedEnterpriseId],
      permissionsByEnterpriseId: {
        [allowedEnterpriseId]: {},
      },
    });
  });

  it('lanza 403 si el usuario no pertenece a la empresa del query', () => {
    const executionContext = createExecutionContext({
      user: regularUser,
      query: { enterpriseId: foreignEnterpriseId },
    });

    expect(() => guard.canActivate(executionContext)).toThrow(ForbiddenException);
  });

  it('omite el aislamiento para un administrador global', () => {
    const executionContext = createExecutionContext({
      user: globalAdminUser,
      query: { enterpriseId: foreignEnterpriseId },
    });

    expect(guard.canActivate(executionContext)).toBe(true);
    const request = executionContext.switchToHttp().getRequest<Request>();
    expect(request.accessContext?.isGlobalAdmin).toBe(true);
  });

  it('no valida la empresa en rutas con SkipEnterpriseAccess', () => {
    mockRouteMetadata({ skip: true });
    const executionContext = createExecutionContext({
      user: regularUser,
      query: { enterpriseId: foreignEnterpriseId },
    });

    expect(guard.canActivate(executionContext)).toBe(true);
  });

  it('lanza 400 si RequireEnterpriseId no recibe enterpriseId', () => {
    mockRouteMetadata({ requireEnterpriseId: true });
    const executionContext = createExecutionContext({
      user: regularUser,
    });

    expect(() => guard.canActivate(executionContext)).toThrow(BadRequestException);
  });

  it('trata un enterpriseId solo con espacios como ausente', () => {
    mockRouteMetadata({ requireEnterpriseId: true });
    const executionContext = createExecutionContext({
      user: regularUser,
      query: { enterpriseId: '   ' },
    });

    expect(() => guard.canActivate(executionContext)).toThrow(BadRequestException);
  });

  it('extrae enterpriseId del body cuando no viene en query', () => {
    const executionContext = createExecutionContext({
      user: regularUser,
      body: { enterpriseId: allowedEnterpriseId },
    });

    expect(guard.canActivate(executionContext)).toBe(true);
  });

  it('extrae enterpriseId del primer vínculo userEnterprises del body', () => {
    const executionContext = createExecutionContext({
      user: regularUser,
      body: {
        userEnterprises: [{ enterpriseId: allowedEnterpriseId }],
      },
    });

    expect(guard.canActivate(executionContext)).toBe(true);
  });

  it('extrae enterpriseId de params si no está en query ni body', () => {
    const executionContext = createExecutionContext({
      user: regularUser,
      params: { enterpriseId: allowedEnterpriseId },
    });

    expect(guard.canActivate(executionContext)).toBe(true);
  });
});
