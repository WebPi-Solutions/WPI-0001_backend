import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { SKIP_ENTERPRISE_ACCESS_KEY } from 'src/common/decorators/enterprise-access.decorator';
import {
  REQUIRE_ENTERPRISE_PERMISSION_KEY,
  RequiredEnterprisePermission,
  SKIP_ENTERPRISE_PERMISSION_KEY,
} from 'src/common/decorators/enterprise-permission.decorator';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';

/**
 * Guard global de permisos por rol de empresa.
 * Se evalúa después de {@link EnterpriseAccessGuard} (el contexto ya está en `req.accessContext`).
 * El administrador global se salta la comprobación.
 */
@Injectable()
export class EnterprisePermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly enterpriseAccessService: EnterpriseAccessService,
  ) {}

  /**
   * Decide si el rol de la empresa activa concede la acción exigida por la ruta.
   *
   * @param executionContext - Contexto Nest
   * @returns `true` si puede continuar
   */
  canActivate(executionContext: ExecutionContext): boolean {
    const shouldSkipPermission = this.reflector.getAllAndOverride<boolean>(
      SKIP_ENTERPRISE_PERMISSION_KEY,
      [executionContext.getHandler(), executionContext.getClass()],
    );
    const shouldSkipEnterpriseAccess = this.reflector.getAllAndOverride<boolean>(
      SKIP_ENTERPRISE_ACCESS_KEY,
      [executionContext.getHandler(), executionContext.getClass()],
    );
    if (shouldSkipPermission || shouldSkipEnterpriseAccess) {
      return true;
    }

    const requiredPermission =
      this.reflector.getAllAndOverride<RequiredEnterprisePermission>(
        REQUIRE_ENTERPRISE_PERMISSION_KEY,
        [executionContext.getHandler(), executionContext.getClass()],
      );
    if (!requiredPermission) {
      return true;
    }

    const request = executionContext.switchToHttp().getRequest<Request>();
    const accessContext = request.accessContext;
    if (!accessContext) {
      return true;
    }
    if (accessContext.isGlobalAdmin) {
      return true;
    }

    const enterpriseId = this.extractEnterpriseId(request);
    if (!enterpriseId) {
      /**
       * Rutas por UUID sin `enterpriseId`: el servicio evalúa el permiso
       * tras el `findById` con {@link EnterpriseAccessService.assertCurrentPermission}.
       */
      return true;
    }

    this.enterpriseAccessService.assertCanPerformEnterprisePermission(
      accessContext,
      enterpriseId,
      requiredPermission.resource,
      requiredPermission.action,
    );
    return true;
  }

  /**
   * Extrae `enterpriseId` de query, body o params (misma prioridad que el guard de empresa).
   *
   * @param request - Petición HTTP
   * @returns UUID recortado o `undefined`
   */
  private extractEnterpriseId(request: Request): string | undefined {
    const queryEnterpriseId = this.readTrimmedString(request.query?.enterpriseId);
    if (queryEnterpriseId) {
      return queryEnterpriseId;
    }

    const body = request.body as Record<string, unknown> | undefined;
    if (body && typeof body === 'object') {
      const bodyEnterpriseId = this.readTrimmedString(body.enterpriseId);
      if (bodyEnterpriseId) {
        return bodyEnterpriseId;
      }
      const userEnterprises = body.userEnterprises;
      if (Array.isArray(userEnterprises) && userEnterprises.length > 0) {
        const firstLink = userEnterprises[0] as { enterpriseId?: unknown };
        const nestedEnterpriseId = this.readTrimmedString(firstLink?.enterpriseId);
        if (nestedEnterpriseId) {
          return nestedEnterpriseId;
        }
      }
    }

    const params = request.params as Record<string, unknown> | undefined;
    return this.readTrimmedString(params?.enterpriseId);
  }

  /**
   * Convierte un valor desconocido en string no vacío.
   *
   * @param value - Valor de query, body o params
   * @returns String recortado o `undefined`
   */
  private readTrimmedString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : undefined;
  }
}
