import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EnterpriseAccessService } from 'src/api/common/enterprise-access.service';
import { DefaultScheduleRepository } from 'src/entities/default-schedule/default-schedule-repository.service';
import { CreateUserEnterpriseDto } from 'src/entities/user/dto/create-user-enterprise.dto';
import { CreateUserDto } from 'src/entities/user/dto/create-user.dto';
import { UserEnterprise } from 'src/entities/user/user-enterprise.entity';
import { UserRepository } from 'src/entities/user/user-repository.service';
import { User, UserStatusTypes } from 'src/entities/user/user.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { DeleteResult } from 'typeorm';
import { FirebaseService } from 'src/services/firebase/firebase.service';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly firebaseService: FirebaseService,
    private readonly enterpriseAccessService: EnterpriseAccessService,
    private readonly defaultScheduleRepository: DefaultScheduleRepository,
  ) {}

  /**
   * Resuelve el UUID de plantilla de horario para **creación** de usuario:
   * - `undefined`: no se envió el campo → sin plantilla (`null` en BD).
   * - `null` o cadena vacía: desasignar explícitamente (`null` en BD).
   * - UUID: valida que exista y pertenezca a la empresa indicada.
   *
   * @param requestedScheduleId - Valor recibido en el DTO de creación
   * @param enterpriseId - Empresa de contexto (vínculo solicitado)
   * @returns UUID persistible o `null`
   */
  private async resolveDefaultScheduleIdForUserCreation(
    requestedScheduleId: string | null | undefined,
    enterpriseId: string,
  ): Promise<string | null> {
    if (requestedScheduleId === undefined) {
      return null;
    }
    if (requestedScheduleId === null || requestedScheduleId === '') {
      return null;
    }
    return this.assertDefaultScheduleBelongsToEnterpriseOrThrow(
      requestedScheduleId,
      enterpriseId,
    );
  }

  /**
   * Resuelve el UUID para **actualización** (PATCH) cuando el cliente envía `defaultScheduleId`.
   *
   * @param requestedScheduleId - `null` o vacío borra la FK; UUID válido la establece
   * @param enterpriseId - Empresa activa (query) para validar titularidad de la plantilla
   * @returns UUID o `null`
   */
  private async resolveDefaultScheduleIdForUserPatch(
    requestedScheduleId: string | null | undefined,
    enterpriseId: string,
  ): Promise<string | null> {
    if (requestedScheduleId === null || requestedScheduleId === undefined) {
      return null;
    }
    if (requestedScheduleId === '') {
      return null;
    }
    return this.assertDefaultScheduleBelongsToEnterpriseOrThrow(
      requestedScheduleId,
      enterpriseId,
    );
  }

  /**
   * Comprueba que la plantilla exista y pertenezca a la empresa; devuelve su id.
   *
   * @param scheduleId - UUID de `default_schedules`
   * @param enterpriseId - Empresa que debe poseer la plantilla
   * @returns El mismo UUID si es válido
   */
  private async assertDefaultScheduleBelongsToEnterpriseOrThrow(
    scheduleId: string,
    enterpriseId: string,
  ): Promise<string> {
    const schedule = await this.defaultScheduleRepository.findById(scheduleId);
    if (!schedule || schedule.enterpriseId !== enterpriseId) {
      this.logger.warn(
        `Plantilla de horario ${scheduleId} inexistente o ajena a la empresa ${enterpriseId}`,
      );
      throw new HttpException(
        'La plantilla de horario no existe o no pertenece a esta empresa.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return schedule.id;
  }

  /**
   * Crea un nuevo usuario y lo vincula a una empresa, o vincula un usuario existente a la empresa.
   * Si el usuario ya existe (por email), solo se crea la vinculación con la empresa solicitada.
   * @param user - El usuario a crear o datos para vincular empresa
   * @returns El usuario creado o el usuario existente con la nueva vinculación
   */
  async create(user: CreateUserDto): Promise<User> {
    this.logger.log(
      `Iniciando proceso de creación/vinculación de usuario: ${user.email}`,
    );
    this.logger.log(
      `Datos recibidos:`,
      JSON.stringify(
        { ...user, password: user.password ? '[REDACTED]' : undefined },
        null,
        2,
      ),
    );

    // Verifica si el usuario tiene una única empresa en el momento de la creación/vinculación
    if (!user.userEnterprises?.length || user.userEnterprises.length !== 1) {
      this.logger.error(
        `Usuario ${user.email} debe estar vinculado a una única empresa. Empresas recibidas: ${user.userEnterprises?.length ?? 0}`,
      );
      throw new HttpException(
        'El usuario debe estar vinculado a una única empresa.',
        HttpStatus.BAD_REQUEST,
      );
    }
    this.logger.log(
      `Usuario ${user.email} tiene vinculación válida a una empresa`,
    );

    const enterpriseId =
      user.userEnterprises[0].enterprise?.id ??
      user.userEnterprises[0].enterpriseId;
    if (!enterpriseId) {
      this.logger.error(
        `No se pudo obtener el ID de la empresa para el usuario ${user.email}`,
      );
      throw new HttpException(
        'Debe especificar la empresa a la que vincular el usuario.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const role = user.userEnterprises[0].role;

    /** FK resuelta para `user_enterprise.default_schedule_id` al vincular con esta empresa. */
    const resolvedDefaultScheduleForCreation =
      await this.resolveDefaultScheduleIdForUserCreation(
        user.defaultScheduleId,
        enterpriseId,
      );

    // Verifica si el usuario ya existe por email
    const existingUser = await this.userRepository.findByEmail(user.email, [
      'userEnterprises',
      'userEnterprises.enterprise',
    ]);

    if (existingUser) {
      this.logger.log(
        `Usuario ${user.email} ya existe en el sistema (ID: ${existingUser.id}). Procediendo a vincular con la empresa`,
      );

      // Comprueba si ya tiene acceso a esta empresa
      const existingLink =
        await this.userRepository.findUserEnterpriseByUserAndEnterprise(
          existingUser.id,
          enterpriseId,
        );
      if (existingLink) {
        this.logger.log(
          `El usuario ${existingUser.email} ya tiene acceso a la empresa ${enterpriseId}. Operación idempotente.`,
        );
        if (Object.prototype.hasOwnProperty.call(user, 'defaultScheduleId')) {
          const scheduleIdForLink = await this.resolveDefaultScheduleIdForUserPatch(
            user.defaultScheduleId,
            enterpriseId,
          );
          await this.userRepository.updateUserEnterpriseDefaultSchedule(
            existingUser.id,
            enterpriseId,
            scheduleIdForLink,
          );
        }
        return this.userRepository.findById(existingUser.id, [
          'userEnterprises',
          'userEnterprises.enterprise',
          'userEnterprises.defaultSchedule',
        ]);
      }

      const nextCardIdForLink =
        await this.userRepository.getNextCardIdForEnterprise(enterpriseId);
      this.logger.log(
        `Asignando card_id ${nextCardIdForLink} a la vinculación del usuario existente ${existingUser.id} con empresa ${enterpriseId}`,
      );

      const userEnterprise: CreateUserEnterpriseDto = {
        userId: existingUser.id,
        enterpriseId,
        role,
        cardId: nextCardIdForLink,
        defaultScheduleId: resolvedDefaultScheduleForCreation,
      };
      this.logger.log(
        `Vinculando usuario existente ${existingUser.id} a empresa ${enterpriseId}`,
      );

      await this.userRepository.addUserToEnterprise(userEnterprise);
      this.logger.log(
        `Usuario ${existingUser.email} vinculado exitosamente a la empresa ${enterpriseId}`,
      );

      return this.userRepository.findById(existingUser.id, [
        'userEnterprises',
        'userEnterprises.enterprise',
        'userEnterprises.defaultSchedule',
      ]);
    }

    // Usuario nuevo: requiere contraseña para registro en Firebase y base de datos
    if (!user.password?.trim()) {
      this.logger.error(
        `Contraseña obligatoria para crear un nuevo usuario: ${user.email}`,
      );
      throw new HttpException(
        'La contraseña es obligatoria para crear un nuevo usuario.',
        HttpStatus.BAD_REQUEST,
      );
    }
    this.logger.log(
      `Usuario ${user.email} no existe, continuando con la creación`,
    );

    // Verificar que el email no exista ya en Firebase
    const emailExistsInFirebase =
      await this.firebaseService.verifyUserExistsByEmail(user.email);
    if (emailExistsInFirebase) {
      this.logger.error(
        `Ya existe un usuario en Firebase con el email: ${user.email}`,
      );
      throw new HttpException(
        `Ya existe un usuario en Firebase con el email: ${user.email}`,
        HttpStatus.CONFLICT,
      );
    }

    const flags = { database: false, databaseId: null as string | null };

    try {
      // 1. Crear usuario en base de datos (sin relaciones ni contraseña: solo columnas de la tabla users)
      const newUser = await this.userRepository.create({
        name: user.name,
        email: user.email,
        phone: user.phone,
        status: user.status ?? UserStatusTypes.ACTIVE,
      });
      flags.database = true;
      flags.databaseId = newUser.id;
      this.logger.log(`Usuario creado en base de datos con ID: ${newUser.id}`);

      const nextCardId =
        await this.userRepository.getNextCardIdForEnterprise(enterpriseId);
      this.logger.log(
        `Asignando card_id ${nextCardId} a la vinculación del nuevo usuario con empresa ${enterpriseId}`,
      );

      // 2. Vincula el usuario a la empresa (card_id por empresa en user_enterprise)
      const userEnterprise: CreateUserEnterpriseDto = {
        userId: newUser.id,
        enterpriseId,
        role,
        cardId: nextCardId,
        defaultScheduleId: resolvedDefaultScheduleForCreation,
      };
      this.logger.log(
        `Vinculando usuario ${newUser.id} a empresa ${enterpriseId}`,
      );
      await this.userRepository.addUserToEnterprise(userEnterprise);
      this.logger.log(
        `Usuario ${newUser.id} vinculado exitosamente a la empresa`,
      );

      // 3. Crear usuario en Firebase
      const firebaseUser = await this.firebaseService.createUser(
        user.email,
        user.password,
      );
      if (firebaseUser) {
        this.logger.log(
          `Usuario creado en Firebase exitosamente con UID: ${firebaseUser.uid}`,
        );
      }

      this.logger.log(
        `Proceso de creación completado para usuario ${newUser.email} (ID: ${newUser.id})`,
      );
      return newUser;
    } catch (error) {
      this.logger.error(`Error al crear usuario ${user.email}:`, error);

      // Rollback: eliminar de base de datos si se creó
      if (flags.database && flags.databaseId) {
        try {
          await this.userRepository.deleteById(flags.databaseId);
          this.logger.log(
            `Usuario eliminado de base de datos tras error (rollback)`,
          );
        } catch (rollbackError) {
          this.logger.error(
            `Error al hacer rollback en base de datos:`,
            rollbackError,
          );
        }
      }

      throw error;
    }
  }

  /**
   * Obtiene todos los usuarios
   * @param page - La página
   * @param pageSize - El tamaño de la página
   * @param sort - El campo por el que se ordenará
   * @param order - La dirección de la ordenación
   * @param filter - El filtro a aplicar
   * @param relations - Las relaciones a incluir
   * @returns Los usuarios
   */
  async findAll(
    page: number,
    pageSize: number,
    sort: string,
    order: 'ASC' | 'DESC',
    filter: Record<string, any>,
    relations?: string[],
  ): Promise<PaginatedResponse<User>> {
    this.logger.log(
      `Obteniendo usuarios paginados - Página: ${page}, Tamaño: ${pageSize}, Ordenación: ${sort} ${order}`,
    );
    this.logger.log(`Filtros aplicados:`, JSON.stringify(filter, null, 2));

    const result = await this.userRepository.findAll(
      page,
      pageSize,
      sort,
      order,
      filter,
      relations,
    );
    this.logger.log(
      `Usuarios obtenidos: ${result.items.length} de ${result.total}`,
    );
    return result;
  }

  /**
   * Obtiene un usuario por su ID
   * @param id - El ID del usuario
   * @param relations - Las relaciones a incluir
   * @returns El usuario
   */
  findById(id: string, relations?: string[]): Promise<User> {
    this.logger.log(
      `Buscando usuario por ID: ${id}${relations ? ` con relaciones: [${relations.join(', ')}]` : ''}`,
    );
    return this.userRepository.findById(id, relations);
  }

  /**
   * Obtiene un usuario por su email
   * @param email - El email del usuario
   * @param relations - Las relaciones a incluir
   * @returns El usuario
   */
  findByEmail(email: string, relations?: string[]): Promise<User | null> {
    this.logger.log(
      `Buscando usuario por email: ${email}${relations ? ` con relaciones: [${relations.join(', ')}]` : ''}`,
    );
    return this.userRepository.findByEmail(email, relations);
  }

  /**
   * Obtiene un usuario a partir del `card_id` de la relación `user_enterprise` en una empresa.
   * Se usa para terminales de fichaje (vista NFC/kiosco).
   *
   * @param enterpriseId - Empresa donde está registrada la tarjeta
   * @param cardId - Identificador numérico de tarjeta/credencial
   * @param relations - Relaciones opcionales a incluir
   * @returns Usuario si existe vínculo con la empresa
   */
  async findByEnterpriseCardId(
    enterpriseId: string,
    cardId: number,
    relations?: string[],
  ): Promise<User> {
    const startedAtMs = Date.now();
    const relationsLabel =
      relations && relations.length > 0 ? `[${relations.join(', ')}]` : '[]';

    this.logger.log(
      `Búsqueda por tarjeta iniciada: card_id=${cardId}, empresa=${enterpriseId}, relaciones=${relationsLabel}`,
    );

    if (!enterpriseId || enterpriseId.trim().length === 0) {
      this.logger.warn(
        `Búsqueda por tarjeta rechazada: falta enterpriseId (card_id=${cardId})`,
      );
      throw new HttpException(
        'Debe especificar la empresa para buscar por tarjeta.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!Number.isFinite(cardId) || cardId <= 0) {
      this.logger.warn(
        `Búsqueda por tarjeta rechazada: card_id inválido (${cardId}) para empresa ${enterpriseId}`,
      );
      throw new HttpException(
        'El identificador de tarjeta debe ser un número positivo.',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const resolved = await this.userRepository.findByEnterpriseCardId(
        enterpriseId,
        cardId,
        relations,
      );

      const elapsedMs = Date.now() - startedAtMs;
      if (!resolved) {
        this.logger.warn(
          `Búsqueda por tarjeta sin resultados: card_id=${cardId}, empresa=${enterpriseId} (${elapsedMs} ms)`,
        );
        throw new HttpException('Usuario no encontrado', HttpStatus.NOT_FOUND);
      }

      this.logger.log(
        `Búsqueda por tarjeta exitosa: userId=${resolved.id}, card_id=${cardId}, empresa=${enterpriseId} (${elapsedMs} ms)`,
      );
      return resolved;
    } catch (error) {
      const elapsedMs = Date.now() - startedAtMs;
      this.logger.error(
        `Error en búsqueda por tarjeta: card_id=${cardId}, empresa=${enterpriseId} (${elapsedMs} ms)`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Actualiza un usuario por su ID.
   * Si el cuerpo incluye `defaultScheduleId`, es obligatorio el query `enterpriseId` para validar titularidad de la plantilla.
   *
   * @param id - El ID del usuario
   * @param user - Campos a actualizar
   * @param enterpriseId - Empresa activa (recomendado; obligatorio si se envía `defaultScheduleId`)
   * @returns El usuario actualizado
   */
  async updateById(
    id: string,
    user: Partial<User>,
    enterpriseId?: string,
  ): Promise<User> {
    this.logger.log(`Iniciando actualización de usuario con ID: ${id}`);
    this.logger.log(`Datos a actualizar:`, JSON.stringify(user, null, 2));

    try {
      if (enterpriseId) {
        await this.enterpriseAccessService.assertUserBelongsToEnterprise(
          id,
          enterpriseId,
          {
            operationContext: 'user.update',
            notFoundMessage: 'Usuario no encontrado en esta empresa.',
          },
        );
      }

      const patch: Partial<User> = { ...user };
      delete (patch as { defaultScheduleId?: unknown }).defaultScheduleId;
      // Evitar que el `save` del usuario intente persistir relaciones `userEnterprises` con payload incompleto.
      // Las actualizaciones del vínculo usuario–empresa se gestionan explícitamente con métodos dedicados.
      delete (patch as { userEnterprises?: unknown }).userEnterprises;

      if (Object.prototype.hasOwnProperty.call(user as object, 'defaultScheduleId')) {
        if (!enterpriseId) {
          this.logger.warn(
            `Actualización de defaultScheduleId rechazada: falta enterpriseId en la petición (usuario ${id})`,
          );
          throw new HttpException(
            'Se requiere el parámetro enterpriseId en la URL para modificar el horario por defecto del usuario.',
            HttpStatus.BAD_REQUEST,
          );
        }
        const userPayload = user as Partial<User> & {
          defaultScheduleId?: string | null;
        };
        const resolvedScheduleId = await this.resolveDefaultScheduleIdForUserPatch(
          userPayload.defaultScheduleId,
          enterpriseId,
        );
        await this.userRepository.updateUserEnterpriseDefaultSchedule(
          id,
          enterpriseId,
          resolvedScheduleId,
        );
      }

      // Actualización de rol en el vínculo usuario–empresa (si se envía en el body).
      // Se acepta el patrón `userEnterprises: [{ role: '...' }]` desde el frontend, pero no se persiste
      // como relación; se aplica como UPDATE sobre la fila del vínculo para la empresa activa.
      const userPayloadWithEnterprises = user as Partial<User> & {
        userEnterprises?: Array<{ role?: string | null }> | null;
      };
      const requestedRole = userPayloadWithEnterprises.userEnterprises?.[0]?.role ?? null;
      const requestedRoleNormalized =
        typeof requestedRole === 'string' ? requestedRole.trim() : '';
      const shouldUpdateEnterpriseRole =
        Object.prototype.hasOwnProperty.call(user as object, 'userEnterprises') &&
        requestedRoleNormalized !== '';
      if (shouldUpdateEnterpriseRole) {
        if (!enterpriseId) {
          this.logger.warn(
            `Actualización de rol rechazada: falta enterpriseId en la petición (usuario ${id})`,
          );
          throw new HttpException(
            'Se requiere el parámetro enterpriseId en la URL para modificar el rol del usuario en la empresa.',
            HttpStatus.BAD_REQUEST,
          );
        }
        await this.userRepository.updateUserEnterpriseRole(
          id,
          enterpriseId,
          requestedRoleNormalized,
        );
      }

      const updatedUser = await this.userRepository.updateById(id, patch);
      this.logger.log(`Usuario ${id} actualizado exitosamente`);
      return updatedUser;
    } catch (error) {
      this.logger.error(`Error al actualizar usuario ${id}:`, error);
      throw error;
    }
  }

  /**
   * Desvincula un usuario de una empresa.
   * Si el usuario solo tiene esa empresa vinculada, se elimina por completo (BD y Firebase).
   * Si tiene más empresas, solo se elimina la relación con la empresa indicada.
   * @param userId - ID del usuario
   * @param enterpriseId - ID de la empresa de la que se desvincula
   * @returns Resultado de la operación
   */
  async unlinkUserFromEnterprise(
    userId: string,
    enterpriseId: string,
  ): Promise<DeleteResult> {
    this.logger.log(
      `Iniciando desvinculación de usuario ${userId} de empresa ${enterpriseId}`,
    );

    const user = await this.userRepository.findById(userId);
    if (!user) {
      this.logger.warn(`No se encontró ningún usuario con ID: ${userId}`);
      throw new HttpException('Usuario no encontrado', HttpStatus.NOT_FOUND);
    }

    await this.enterpriseAccessService.assertUserEnterpriseLinkExists(
      userId,
      enterpriseId,
      { operationContext: 'user.unlink-from-enterprise' },
    );

    const enterpriseCount =
      await this.userRepository.countUserEnterprisesByUserId(userId);
    this.logger.log(
      `Usuario ${userId} tiene ${enterpriseCount} empresa(s) vinculada(s)`,
    );

    if (enterpriseCount === 1) {
      this.logger.log(
        `Usuario con una única empresa: eliminación completa (BD y Firebase)`,
      );
      return this.deleteUserCompletely(userId);
    }

    this.logger.log(
      `Usuario con varias empresas: solo se elimina la vinculación con ${enterpriseId}`,
    );
    return this.userRepository.removeUserFromEnterprise(userId, enterpriseId);
  }

  /**
   * Elimina un usuario por completo (BD y Firebase).
   * Solo se usa internamente cuando el usuario tiene una única empresa vinculada.
   * @param id - El ID del usuario a eliminar
   * @returns El resultado de la eliminación
   */
  private async deleteUserCompletely(id: string): Promise<DeleteResult> {
    const userToDelete = await this.userRepository.findById(id);
    if (!userToDelete) {
      throw new HttpException('Usuario no encontrado', HttpStatus.NOT_FOUND);
    }

    try {
      if (
        await this.firebaseService.verifyUserExistsByEmail(userToDelete.email)
      ) {
        this.logger.log(
          `Eliminando usuario ${userToDelete.email} (ID: ${id}) en Firebase...`,
        );
        await this.firebaseService.deleteUser(userToDelete.email);
        this.logger.log(`Usuario eliminado de Firebase exitosamente`);
      } else {
        this.logger.warn(
          `El usuario ${userToDelete.email} no existe en Firebase. Eliminación omitida`,
        );
      }

      const result = await this.userRepository.deleteById(id);
      this.logger.log(
        `Usuario ${id} eliminado de BD. Filas afectadas: ${result.affected}`,
      );
      return result;
    } catch (error) {
      this.logger.error(`Error al eliminar usuario ${id}:`, error);
      throw error;
    }
  }

  /**
   * Añade un usuario a una empresa
   * @param userEnterprise - El usuario a añadir
   * @returns El usuario añadido
   */
  async addUserToEnterprise(
    userEnterprise: UserEnterprise,
  ): Promise<UserEnterprise> {
    const resolvedUserId = userEnterprise.userId ?? userEnterprise.user?.id;
    const resolvedEnterpriseId =
      userEnterprise.enterpriseId ?? userEnterprise.enterprise?.id;

    this.logger.log(
      `Añadiendo usuario ${resolvedUserId ?? 'ID no disponible'} a empresa ${resolvedEnterpriseId ?? 'ID no disponible'}`,
    );
    this.logger.log(
      `Detalles de la vinculación:`,
      JSON.stringify(
        {
          userId: resolvedUserId,
          enterpriseId: resolvedEnterpriseId,
          role: userEnterprise.role,
        },
        null,
        2,
      ),
    );

    if (!resolvedUserId || !resolvedEnterpriseId) {
      this.logger.error(
        'Vinculación rechazada: faltan userId o enterpriseId resolubles',
      );
      throw new HttpException(
        'Se requieren userId y enterpriseId para vincular el usuario a la empresa.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const nextCardId =
      await this.userRepository.getNextCardIdForEnterprise(
        resolvedEnterpriseId,
      );
    this.logger.log(`card_id asignado a la nueva vinculación: ${nextCardId}`);

    try {
      const result = await this.userRepository.addUserToEnterprise({
        userId: resolvedUserId,
        enterpriseId: resolvedEnterpriseId,
        role: userEnterprise.role,
        cardId: nextCardId,
      });
      this.logger.log(`Vinculación empresa-usuario creada exitosamente`);
      return result;
    } catch (error) {
      this.logger.error(`Error al vincular usuario a empresa:`, error);
      throw error;
    }
  }
}
