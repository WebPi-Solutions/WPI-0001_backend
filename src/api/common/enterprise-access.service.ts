import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { UserRepository } from 'src/entities/user/user-repository.service';

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
 * Servicio compartido de comprobaciones de acceso y vínculos usuario–empresa en la capa API.
 *
 * **Extensión:** añadir aquí nuevas funciones de validación (p. ej. roles mínimos, cuotas, flags de empresa)
 * para reutilizarlas desde controladores/servicios sin duplicar consultas a `user_enterprise`.
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

  // --- Ampliar con nuevas validaciones de acceso por empresa debajo de esta línea ---
}
