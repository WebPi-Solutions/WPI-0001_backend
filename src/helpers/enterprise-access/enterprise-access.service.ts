import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { User, UserRoleTypes } from 'src/entities/user/user.entity';
import { UserRepository } from 'src/entities/user/user-repository.service';
import { AccessContext } from './access-context';
import { getEnterpriseAccessContext } from './enterprise-access.storage';

/**
 * Opciones para {@link EnterpriseAccessService.assertUserBelongsToEnterprise}.
 * Centraliza mensajes y contexto de log sin acoplar cada servicio de dominio.
 */
export interface AssertUserBelongsToEnterpriseOptions {
  /**
   * Texto breve para identificar el módulo u operación en logs (ej. `work-schedule`, `signing`).
   */
  operationContext?: string;

  /**
   * Cuerpo de respuesta HTTP cuando el usuario no está vinculado a la empresa.
   * Suele ser un mensaje genérico de «no encontrado» por seguridad (no revelar existencia del usuario).
   */
  notFoundMessage: string;
}

/**
 * Comprobaciones compartidas de acceso multi-empresa vía tabla `user_enterprise`.
 * Convive con la capa HTTP pero vive bajo `helpers/` para separarlo de controladores y rutas REST.
 *
 * **Extensión:** añadir aquí nuevas validaciones (p. ej. roles mínimos, cuotas, flags de empresa)
 * para reutilizarlas desde servicios sin duplicar consultas a `user_enterprise`.
 */
@Injectable()
export class EnterpriseAccessService {
  private readonly logger = new Logger(EnterpriseAccessService.name);

  constructor(private readonly userRepository: UserRepository) {}

  /**
   * Comprueba que exista una fila en `user_enterprise` para el par usuario–empresa.
   * Si no hay vínculo, registra advertencia y lanza HTTP 404 con el mensaje indicado.
   *
   * @param userId - Identificador del usuario
   * @param enterpriseId - Identificador de la empresa
   * @param options - Mensaje de respuesta y contexto opcional para trazas
   */
  async assertUserBelongsToEnterprise(
    userId: string,
    enterpriseId: string,
    options: AssertUserBelongsToEnterpriseOptions,
  ): Promise<void> {
    const link =
      await this.userRepository.findUserEnterpriseByUserAndEnterprise(
        userId,
        enterpriseId,
      );

    if (!link) {
      const contextSuffix = options.operationContext
        ? ` (${options.operationContext})`
        : '';
      this.logger.warn(
        `El usuario ${userId} no tiene vinculación con la empresa ${enterpriseId}${contextSuffix}`,
      );
      throw new HttpException(options.notFoundMessage, HttpStatus.NOT_FOUND);
    }
  }

  /**
   * Comprueba que el usuario **sí** esté vinculado a la empresa antes de operaciones explícitas
   * (p. ej. desvincular). Si no existe el vínculo, lanza HTTP 400.
   *
   * @param userId - Identificador del usuario
   * @param enterpriseId - Identificador de la empresa
   * @param options - Mensaje y contexto de log opcionales
   */
  async assertUserEnterpriseLinkExists(
    userId: string,
    enterpriseId: string,
    options?: {
      operationContext?: string;
      badRequestMessage?: string;
    },
  ): Promise<void> {
    const link =
      await this.userRepository.findUserEnterpriseByUserAndEnterprise(
        userId,
        enterpriseId,
      );

    if (!link) {
      const contextSuffix = options?.operationContext
        ? ` (${options.operationContext})`
        : '';
      this.logger.warn(
        `El usuario ${userId} no está vinculado a la empresa ${enterpriseId}${contextSuffix}`,
      );
      throw new HttpException(
        options?.badRequestMessage ??
          'El usuario no está vinculado a esta empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Comprueba que exista una fila `user_enterprise` por id y que pertenezca a `enterpriseId`.
   * Si no existe, lanza HTTP 404 con el mensaje indicado.
   *
   * @param userEnterpriseId - UUID del vínculo usuario–empresa
   * @param enterpriseId - UUID de la empresa
   * @param options - Contexto y mensaje de no encontrado
   * @returns El vínculo (útil para obtener `userId`)
   */
  async assertUserEnterpriseBelongsToEnterprise(
    userEnterpriseId: string,
    enterpriseId: string,
    options: AssertUserBelongsToEnterpriseOptions,
  ): Promise<{ userId: string; enterpriseId: string; id: string }> {
    const link = await this.userRepository.findUserEnterpriseByIdAndEnterprise(
      userEnterpriseId,
      enterpriseId,
    );

    if (!link) {
      const contextSuffix = options.operationContext
        ? ` (${options.operationContext})`
        : '';
      this.logger.warn(
        `El vínculo user_enterprise ${userEnterpriseId} no pertenece a la empresa ${enterpriseId}${contextSuffix}`,
      );
      throw new HttpException(options.notFoundMessage, HttpStatus.NOT_FOUND);
    }

    return { id: link.id, userId: link.userId, enterpriseId: link.enterpriseId };
  }

  /**
   * Construye el contexto de acceso a partir del usuario autenticado y sus vínculos `user_enterprise`.
   *
   * @param user - Usuario cargado por el middleware de Firebase (con `userEnterprises` si es posible)
   * @returns Contexto con empresas permitidas y flag de administrador global
   */
  buildAccessContext(user: User): AccessContext {
    const userEnterpriseLinks = user.userEnterprises ?? [];
    const allowedEnterpriseIds = [
      ...new Set(
        userEnterpriseLinks
          .map((link) => link.enterpriseId ?? link.enterprise?.id)
          .filter((enterpriseId): enterpriseId is string => Boolean(enterpriseId)),
      ),
    ];

    return {
      userId: user.id,
      isGlobalAdmin: user.role === UserRoleTypes.ADMIN,
      allowedEnterpriseIds,
    };
  }

  /**
   * Devuelve el contexto de la petición HTTP actual o lanza 403 si el interceptor no lo estableció.
   *
   * @returns Contexto de acceso de la petición en curso
   */
  getCurrentAccessContextOrThrow(): AccessContext {
    const accessContext = getEnterpriseAccessContext();
    if (!accessContext) {
      this.logger.error(
        'No hay AccessContext en el almacenamiento asíncrono de la petición',
      );
      throw new ForbiddenException(
        'No se pudo resolver el contexto de acceso a empresa',
      );
    }
    return accessContext;
  }

  /**
   * Comprueba que el caller puede operar sobre `enterpriseId` (query/body/param).
   * Los administradores globales (`users.role = administrator`) no se filtran.
   *
   * @param accessContext - Contexto de la petición
   * @param enterpriseId - Empresa solicitada
   */
  assertCanAccessEnterprise(
    accessContext: AccessContext,
    enterpriseId: string,
  ): void {
    const normalizedEnterpriseId = enterpriseId?.trim();
    if (!normalizedEnterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (accessContext.isGlobalAdmin) {
      return;
    }

    if (!accessContext.allowedEnterpriseIds.includes(normalizedEnterpriseId)) {
      this.logger.warn(
        `El usuario ${accessContext.userId} no tiene acceso a la empresa ${normalizedEnterpriseId}`,
      );
      throw new ForbiddenException(
        'No tiene acceso a la empresa indicada.',
      );
    }
  }

  /**
   * Comprueba que una entidad cuyo tenant es `entityEnterpriseId` es visible para el caller.
   * Si no hay acceso, responde 404 para no revelar la existencia del recurso.
   *
   * @param accessContext - Contexto de la petición
   * @param entityEnterpriseId - Empresa propietaria de la entidad (puede faltar si no se cargó la relación)
   * @param options - Mensaje de no encontrado
   */
  assertEntityAccessible(
    accessContext: AccessContext,
    entityEnterpriseId: string | null | undefined,
    options: { notFoundMessage: string },
  ): void {
    if (accessContext.isGlobalAdmin) {
      return;
    }

    const normalizedEnterpriseId = entityEnterpriseId?.trim();
    if (
      !normalizedEnterpriseId ||
      !accessContext.allowedEnterpriseIds.includes(normalizedEnterpriseId)
    ) {
      this.logger.warn(
        `El usuario ${accessContext.userId} no puede acceder al recurso de la empresa ${normalizedEnterpriseId ?? 'desconocida'}`,
      );
      throw new HttpException(options.notFoundMessage, HttpStatus.NOT_FOUND);
    }
  }

  /**
   * Variante de {@link assertEntityAccessible} que usa el contexto de la petición actual.
   *
   * @param entityEnterpriseId - Empresa propietaria de la entidad
   * @param notFoundMessage - Mensaje HTTP 404 si no hay acceso
   */
  assertCurrentEntityAccessible(
    entityEnterpriseId: string | null | undefined,
    notFoundMessage: string,
  ): void {
    const accessContext = this.getCurrentAccessContextOrThrow();
    this.assertEntityAccessible(accessContext, entityEnterpriseId, {
      notFoundMessage,
    });
  }

  /**
   * Comprueba que el caller puede ver o mutar el registro de usuario indicado.
   * Permitido si es él mismo, administrador global, o comparte al menos una empresa.
   *
   * @param accessContext - Contexto de la petición
   * @param targetUser - Usuario objetivo (con `userEnterprises` cargadas)
   * @param notFoundMessage - Mensaje HTTP 404 si no hay acceso
   */
  assertUserRecordAccessible(
    accessContext: AccessContext,
    targetUser: { id: string; userEnterprises?: Array<{ enterpriseId: string }> },
    notFoundMessage: string,
  ): void {
    if (accessContext.isGlobalAdmin) {
      return;
    }
    if (targetUser.id === accessContext.userId) {
      return;
    }

    const targetEnterpriseIds = (targetUser.userEnterprises ?? []).map(
      (link) => link.enterpriseId,
    );
    const sharesEnterprise = targetEnterpriseIds.some((enterpriseId) =>
      accessContext.allowedEnterpriseIds.includes(enterpriseId),
    );
    if (!sharesEnterprise) {
      this.logger.warn(
        `El usuario ${accessContext.userId} no puede acceder al perfil ${targetUser.id}`,
      );
      throw new HttpException(notFoundMessage, HttpStatus.NOT_FOUND);
    }
  }

  /**
   * Variante de {@link assertUserRecordAccessible} con el contexto de la petición actual.
   *
   * @param targetUser - Usuario objetivo
   * @param notFoundMessage - Mensaje HTTP 404 si no hay acceso
   */
  assertCurrentUserRecordAccessible(
    targetUser: { id: string; userEnterprises?: Array<{ enterpriseId: string }> },
    notFoundMessage: string,
  ): void {
    const accessContext = this.getCurrentAccessContextOrThrow();
    this.assertUserRecordAccessible(accessContext, targetUser, notFoundMessage);
  }

  /**
   * Solo un administrador global puede crear empresas (alta en el panel de administración).
   *
   * @param accessContext - Contexto de la petición
   */
  assertCanCreateEnterprise(accessContext: AccessContext): void {
    if (accessContext.isGlobalAdmin) {
      return;
    }
    this.logger.warn(
      `El usuario ${accessContext.userId} intentó crear una empresa sin ser administrador global`,
    );
    throw new ForbiddenException(
      'No tiene permiso para crear empresas.',
    );
  }

  /**
   * Une nombres de relaciones TypeORM evitando duplicados.
   *
   * @param relations - Relaciones pedidas por el caller
   * @param requiredRelationNames - Relaciones imprescindibles para resolver el tenant
   * @returns Lista única
   */
  mergeRelationNames(
    relations: string[] | undefined,
    requiredRelationNames: string[],
  ): string[] {
    return [...new Set([...(relations ?? []), ...requiredRelationNames])];
  }
}
