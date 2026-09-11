import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import {
  REQUIRE_ENTERPRISE_ID_KEY,
  SKIP_ENTERPRISE_ACCESS_KEY,
} from 'src/common/decorators/enterprise-access.decorator';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';

/**
 * Guard global de pertenencia a empresa.
 * Adjunta `req.accessContext` y, si hay `enterpriseId` en la petición, valida el vínculo
 * (salvo administradores globales o rutas con {@link SkipEnterpriseAccess}).
 */
@Injectable()
export class EnterpriseAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly enterpriseAccessService: EnterpriseAccessService,
  ) {}

  /**
   * Decide si la petición puede continuar según el usuario autenticado y el `enterpriseId` informado.
   *
   * @param executionContext - Contexto Nest de la ruta
   * @returns `true` si el acceso está permitido
   */
  canActivate(executionContext: ExecutionContext): boolean {
    const request = executionContext.switchToHttp().getRequest<Request>();
    const shouldSkipEnterpriseAccess = this.reflector.getAllAndOverride<boolean>(
      SKIP_ENTERPRISE_ACCESS_KEY,
      [executionContext.getHandler(), executionContext.getClass()],
    );
    const shouldRequireEnterpriseId = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_ENTERPRISE_ID_KEY,
      [executionContext.getHandler(), executionContext.getClass()],
    );

    if (request.user) {
      request.accessContext =
        this.enterpriseAccessService.buildAccessContext(request.user);
    }

    if (shouldSkipEnterpriseAccess) {
      return true;
    }

    if (!request.user || !request.accessContext) {
      return true;
    }

    const enterpriseId = this.extractEnterpriseId(request);
    if (shouldRequireEnterpriseId && !enterpriseId) {
      throw new BadRequestException(
        'Es obligatorio especificar el ID de la empresa',
      );
    }

    if (enterpriseId) {
      this.enterpriseAccessService.assertCanAccessEnterprise(
        request.accessContext,
        enterpriseId,
      );
    }

    return true;
  }

  /**
   * Extrae `enterpriseId` de query, body o params (incluido `userEnterprises[0]` en altas de usuario).
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
