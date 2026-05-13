import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { User, UserStatusTypes } from './user.entity';
import { DeleteResult, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryBuilderService, QueryFilterOptions, QueryRelation } from 'src/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { UserEnterprise } from './user-enterprise.entity';
import { CreateUserEnterpriseDto } from './dto/create-user-enterprise.dto';
import { DefaultSchedule } from '../default-schedule/default-schedule.entity';

@Injectable()
export class UserRepository {
  private readonly logger = new Logger(UserRepository.name);

  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(UserEnterprise) private userEnterpriseRepository: Repository<UserEnterprise>
  ) {}

  /**
   * Crea un nuevo usuario
   * @param user - El usuario a crear (puede ser parcial, sin id, createdAt, updatedAt ni relaciones)
   * @returns El usuario creado
   */
  create(user: Partial<User>): Promise<User> {
    return this.userRepository.save(user);
  }

  /**
   * Calcula el siguiente valor de `card_id` para una nueva fila en `user_enterprise`:
   * máximo `card_id` entre las vinculaciones de esa empresa, más uno.
   * Si la empresa aún no tiene vinculaciones, devuelve 1.
   *
   * @param enterpriseId - Identificador UUID de la empresa
   * @returns Siguiente entero a usar como `cardId` en user_enterprise
   */
  async getNextCardIdForEnterprise(enterpriseId: string): Promise<number> {
    this.logger.log(`Calculando siguiente card_id en user_enterprise para la empresa ${enterpriseId}`);

    const raw = await this.userEnterpriseRepository
      .createQueryBuilder('ue')
      .where('ue.enterpriseId = :enterpriseId', { enterpriseId })
      .select('MAX(ue.cardId)', 'maxCardId')
      .getRawOne<Record<string, string | null>>();

    const maxRaw =
      raw?.maxCardId ??
      raw?.maxcardid ??
      (raw ? (Object.values(raw)[0] as string | null | undefined) : null);
    const maxExisting = maxRaw != null ? Number.parseInt(String(maxRaw), 10) : 0;

    // Asegurar que el primer card_id asignable sea 1:
    // - Si no hay vinculaciones → maxExisting=0 → next=1
    // - Si hay datos corruptos (card_id 0 o negativos) → forzar mínimo 1
    const nextCardIdCandidate = Number.isFinite(maxExisting) ? maxExisting + 1 : 1;
    const nextCardId = Math.max(1, nextCardIdCandidate);

    this.logger.log(
      `Siguiente card_id para empresa ${enterpriseId}: ${nextCardId} (máximo existente en la empresa: ${maxExisting})`
    );
    return nextCardId;
  }

  /**
   * Cuenta los usuarios con filtros y relaciones usando QueryBuilderService
   * @param filter - Filtros a aplicar
   * @param relations - Las relaciones a incluir para aplicar filtros con relaciones
   * @returns El número de usuarios que coinciden con los filtros
   */
  async count(
    filter: Record<string, any> = {},
    relations?: string[]
  ): Promise<number> {
    // Convertir las relaciones de string[] a QueryRelation[] si se proporcionan
    const queryRelations: QueryRelation[] | undefined = relations 
      ? relations.map(relation => ({
          property: relation,
          alias: relation,
          isLeftJoinAndSelect: false // Solo necesitamos el join para filtrar, no seleccionar
        }))
      : undefined;

    // Usar QueryBuilderService para hacer el count con filtros y relaciones
    return QueryBuilderService.getCount(
      this.userRepository,
      'user',
      filter,
      queryRelations
    );
  }

  /**
   * Conteos para las tarjetas del listado de usuarios por empresa: total, activos e inactivos.
   * Cada valor se obtiene con {@link count} y el JOIN de `userEnterprises` necesario para el filtro por empresa.
   * Activo/inactivo sustituyen el criterio `status` del filtro base (misma semántica que las peticiones previas del front).
   *
   * @param enterpriseId - ID de la empresa
   * @param filter - Filtros de listado (búsqueda, fechas, etc.), sin incluir `userEnterprises.enterpriseId`
   * @returns Totales para métricas
   */
  async getListViewCounts(
    enterpriseId: string,
    filter: Record<string, unknown> = {},
  ): Promise<{ total: number; active: number; inactive: number }> {
    const relations = ['userEnterprises'];
    const base: Record<string, unknown> = {
      'userEnterprises.enterpriseId': enterpriseId,
      ...filter,
    };

    const [total, active, inactive] = await Promise.all([
      this.count(base, relations),
      this.count({ ...base, status: UserStatusTypes.ACTIVE }, relations),
      this.count({ ...base, status: UserStatusTypes.INACTIVE }, relations),
    ]);

    return { total, active, inactive };
  }

  /**
   * Cuenta usuarios activos vinculados a una empresa, excluyendo los vínculos con rol "signings"
   * (terminal de fichajes). Se usa para calcular el consumo de unidades (X/Y) de una suscripción.
   *
   * @param enterpriseId - UUID de la empresa
   * @returns Número de usuarios activos excluyendo terminales de fichajes
   */
  async countActiveNonSigningsUsersForEnterprise(enterpriseId: string): Promise<number> {
    const normalizedEnterpriseId = enterpriseId?.trim();
    if (!normalizedEnterpriseId) {
      return 0;
    }

    try {
      const count = await this.userRepository
        .createQueryBuilder('user')
        .innerJoin('user.userEnterprises', 'userEnterprise', 'userEnterprise.enterpriseId = :enterpriseId', {
          enterpriseId: normalizedEnterpriseId,
        })
        .where('user.status = :activeStatus', { activeStatus: UserStatusTypes.ACTIVE })
        .andWhere('userEnterprise.role != :signingsRole', { signingsRole: 'signings' })
        .distinct(true)
        .getCount();

      return count ?? 0;
    } catch (error) {
      this.logger.warn(
        `No se pudo contar usuarios activos (excluyendo terminales) para la empresa ${normalizedEnterpriseId}: ${error instanceof Error ? error.message : error}`,
      );
      return 0;
    }
  }

  /**
   * Obtiene todos los usuarios con paginación, filtros y ordenación
   * @param page - Número de página
   * @param pageSize - Tamaño de página
   * @param sort - Campo por el que ordenar
   * @param order - Dirección de ordenación
   * @param filter - Filtros a aplicar
   * @param relations - Las relaciones a incluir
   * @returns Respuesta paginada con los usuarios
   */
  findAll(
    page: number = 1,
    pageSize: number = 10,
    sort: string = 'name',
    order: 'ASC' | 'DESC' = 'ASC',
    filter: Record<string, any> = {},
    relations?: string[]
  ): Promise<PaginatedResponse<User>> {
    // Configurar opciones para el QueryBuilderService
    const options: QueryFilterOptions = {
      page,
      pageSize,
      sort,
      order,
      filter,
      relations: (relations || []).map(relation => ({
        property: relation,
        alias: relation,
        isLeftJoinAndSelect: true
      }))
    };

    // Usar el servicio genérico para construir la consulta
    return QueryBuilderService.getPaginatedResults(
      this.userRepository,
      'user',
      options
    );
  }

  /**
   * Obtiene un usuario por su ID
   * @param id - El ID del usuario a buscar
   * @param relations - Las relaciones a incluir
   * @returns El usuario si se encuentra, de lo contrario null
   */
  findById(id: string, relations?: string[]): Promise<User> {
    this.logger.log(`Buscando usuario por ID: ${id}${relations ? `, incluyendo relaciones: [${relations.join(', ')}]` : ''}`);

    return this.userRepository.findOne({ where: { id }, relations });
  }

  /**
   * Obtiene un usuario por su email
   * @param email - El email del usuario a buscar
   * @returns El usuario si se encuentra, de lo contrario null
   */
  async findByEmail(email: string, relations?: string[]): Promise<User | null> {
    this.logger.log(`Buscando usuario por email: ${email}${relations ? `, incluyendo relaciones: [${relations.join(', ')}]` : ''}`);
    
    const user = await this.userRepository.findOne({ where: { email }, relations });
    
    if (user) {
      this.logger.log(`Usuario encontrado: ${user.email} (ID: ${user.id})`);
    } else {
      this.logger.log(`No se encontró ningún usuario con email: ${email}`);
    }
    
    return user;
  }

  /**
   * Busca un usuario por `card_id` dentro de una empresa (tabla `user_enterprise`).
   *
   * @param enterpriseId - Empresa donde se busca la tarjeta
   * @param cardId - Identificador numérico de tarjeta/credencial
   * @param relations - Relaciones opcionales a incluir (p. ej. `userEnterprises`, `userEnterprises.enterprise`)
   * @returns Usuario encontrado o `null` si no existe vínculo con ese `card_id`
   */
  async findByEnterpriseCardId(
    enterpriseId: string,
    cardId: number,
    relations?: string[],
  ): Promise<User | null> {
    this.logger.log(`Buscando usuario por card_id ${cardId} en empresa ${enterpriseId}`);

    const baseRelations = new Set<string>(['userEnterprises', ...(relations ?? [])]);
    const relationArray = Array.from(baseRelations);

    const user = await this.userRepository
      .createQueryBuilder('user')
      .innerJoinAndSelect('user.userEnterprises', 'ue', 'ue.enterpriseId = :enterpriseId', { enterpriseId })
      .where('ue.cardId = :cardId', { cardId })
      .getOne();

    if (!user) {
      this.logger.log(`No se encontró usuario para card_id ${cardId} en empresa ${enterpriseId}`);
      return null;
    }

    // Si se solicitan relaciones adicionales, recargar por id con relations (evita duplicar joins manuales).
    if (relationArray.length > 0) {
      return this.userRepository.findOne({ where: { id: user.id }, relations: relationArray });
    }
    return user;
  }

  /**
   * Obtiene el vínculo `user_enterprise` asociado a un `card_id` en una empresa.
   * Útil para terminales/kiosco, ya que los flujos multi-empresa deben operar con `userEnterpriseId`.
   *
   * @param enterpriseId Empresa donde se valida el card_id
   * @param cardId Identificador numérico asignado a la tarjeta en esa empresa
   * @param relations Relaciones opcionales (p. ej. `user`, `enterprise`)
   * @returns Vínculo o null si no existe
   */
  async findUserEnterpriseByEnterpriseAndCardId(
    enterpriseId: string,
    cardId: number,
    relations?: string[],
  ): Promise<UserEnterprise | null> {
    return this.userEnterpriseRepository.findOne({
      where: { enterpriseId, cardId },
      relations,
    });
  }

  /**
   * Actualiza un usuario existente por su ID
   * @param id - El ID del usuario a actualizar
   * @param user - El usuario con datos actualizados (puede ser parcial)
   * @returns El usuario actualizado
   */
  async updateById(id: string, user: Partial<User>): Promise<User> {
    // Obtiene el usuario a actualizar
    const userToUpdate = await this.userRepository.findOne({ where: { id } });

    // Si el usuario no existe, se lanza un error
    if (!userToUpdate) {
      throw new HttpException('Usuario no encontrado', HttpStatus.NOT_FOUND);
    }

    // Actualiza el usuario
    await this.userRepository.save({ ...userToUpdate, ...user });

    // Devuelve el usuario actualizado
    return this.findById(id);
  }

  /**
   * Cuenta cuántas empresas tiene vinculadas un usuario.
   * @param userId - ID del usuario
   * @returns Número de vinculaciones user_enterprise
   */
  async countUserEnterprisesByUserId(userId: string): Promise<number> {
    return this.userEnterpriseRepository.count({ where: { userId } });
  }

  /**
   * Elimina la vinculación de un usuario con una empresa.
   * @param userId - ID del usuario
   * @param enterpriseId - ID de la empresa
   * @returns Resultado de la eliminación
   */
  async removeUserFromEnterprise(userId: string, enterpriseId: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando vinculación usuario ${userId} - empresa ${enterpriseId}`);
    return this.userEnterpriseRepository.delete({ userId, enterpriseId });
  }

  /**
   * Elimina un usuario por su ID (incluye user_enterprise por restricción FK).
   * @param id - El ID del usuario a eliminar
   * @returns El resultado de la operación de eliminación
   */
  async deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando usuario por ID: ${id}`);
    await this.userEnterpriseRepository.delete({ userId: id });
    return this.userRepository.delete(id);
  }

  /**
   * Comprueba si un usuario ya tiene acceso a una empresa.
   * @param userId - ID del usuario
   * @param enterpriseId - ID de la empresa
   * @returns La vinculación si existe, null en caso contrario
   */
  async findUserEnterpriseByUserAndEnterprise(
    userId: string,
    enterpriseId: string
  ): Promise<UserEnterprise | null> {
    this.logger.log(`Comprobando si el usuario ${userId} ya tiene acceso a la empresa ${enterpriseId}`);
    const link = await this.userEnterpriseRepository.findOne({
      where: { userId, enterpriseId }
    });
    if (link) {
      this.logger.log(`El usuario ${userId} ya tiene acceso a la empresa ${enterpriseId}`);
    } else {
      this.logger.log(`El usuario ${userId} no tiene acceso a la empresa ${enterpriseId}`);
    }
    return link ?? null;
  }

  /**
   * Obtiene un vínculo `user_enterprise` por su UUID.
   *
   * @param userEnterpriseId - UUID del vínculo
   * @param relations - Relaciones opcionales
   * @returns Vínculo encontrado o null
   */
  async findUserEnterpriseById(
    userEnterpriseId: string,
    relations?: string[],
  ): Promise<UserEnterprise | null> {
    return this.userEnterpriseRepository.findOne({
      where: { id: userEnterpriseId },
      relations,
    });
  }

  /**
   * Comprueba que un vínculo `user_enterprise` pertenezca a una empresa concreta.
   *
   * @param userEnterpriseId - UUID del vínculo
   * @param enterpriseId - UUID de empresa
   * @returns Vínculo si existe; null si no
   */
  async findUserEnterpriseByIdAndEnterprise(
    userEnterpriseId: string,
    enterpriseId: string,
  ): Promise<UserEnterprise | null> {
    return this.userEnterpriseRepository.findOne({
      where: { id: userEnterpriseId, enterpriseId },
    });
  }

  /**
   * Añade un usuario a una empresa
   * @param userEnterprise - El usuario a añadir
   * @returns El usuario añadido
   */
  async addUserToEnterprise(userEnterprise: CreateUserEnterpriseDto): Promise<UserEnterprise> {
    this.logger.log(`Vinculando usuario ${userEnterprise.userId} con empresa ${userEnterprise.enterpriseId} (Rol: ${userEnterprise.role})`);
    
    try {
      const result = await this.userEnterpriseRepository.save(userEnterprise);
      this.logger.log(`Usuario ${userEnterprise.userId} vinculado exitosamente a la empresa ${userEnterprise.enterpriseId}`);
      return result;
    } catch (error) {
      this.logger.error(`Error al vincular usuario ${userEnterprise.userId} con empresa ${userEnterprise.enterpriseId}: ${error.message || JSON.stringify(error)}`);
      throw error;
    }
  }

  /**
   * Actualiza la plantilla de horario por defecto asociada al par usuario–empresa.
   *
   * @param userId - ID del usuario
   * @param enterpriseId - ID de la empresa
   * @param defaultScheduleId - UUID de `default_schedules` o `null` para desasignar
   */
  async updateUserEnterpriseDefaultSchedule(
    userId: string,
    enterpriseId: string,
    defaultScheduleId: string | null,
  ): Promise<void> {
    this.logger.log(
      `Actualizando default_schedule_id en user_enterprise para usuario ${userId}, empresa ${enterpriseId}`,
    );
    const link = await this.userEnterpriseRepository.findOne({
      where: { userId, enterpriseId },
    });
    if (!link) {
      this.logger.warn(
        `No se encontró fila user_enterprise para usuario ${userId} y empresa ${enterpriseId}`,
      );
      throw new HttpException(
        'No existe vínculo usuario–empresa para actualizar el horario.',
        HttpStatus.NOT_FOUND,
      );
    }
    link.defaultSchedule =
      defaultScheduleId === null
        ? null
        : ({ id: defaultScheduleId } as DefaultSchedule);
    await this.userEnterpriseRepository.save(link);
  }

  /**
   * Actualiza el rol asociado al par usuario–empresa.
   *
   * @param userId - ID del usuario
   * @param enterpriseId - ID de la empresa
   * @param role - Nuevo rol a persistir en `user_enterprise.role`
   */
  async updateUserEnterpriseRole(
    userId: string,
    enterpriseId: string,
    role: string,
  ): Promise<void> {
    this.logger.log(
      `Actualizando role en user_enterprise para usuario ${userId}, empresa ${enterpriseId}`,
    );
    const link = await this.userEnterpriseRepository.findOne({
      where: { userId, enterpriseId },
    });
    if (!link) {
      this.logger.warn(
        `No se encontró fila user_enterprise para usuario ${userId} y empresa ${enterpriseId}`,
      );
      throw new HttpException(
        'No existe vínculo usuario–empresa para actualizar el rol.',
        HttpStatus.NOT_FOUND,
      );
    }
    link.role = role;
    await this.userEnterpriseRepository.save(link);
  }
}