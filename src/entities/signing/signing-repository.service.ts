import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { QueryBuilderService, QueryFilterOptions } from 'src/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { Signing, SigningAction } from './signing.entity';
import { SigningUpdate } from './signing-update.entity';

/**
 * Repositorio de fichajes (signings).
 */
@Injectable()
export class SigningRepository {
  private readonly logger = new Logger(SigningRepository.name);

  constructor(
    @InjectRepository(Signing)
    private readonly signingRepository: Repository<Signing>
  ) {}

  /**
   * Expone el `EntityManager` del repositorio TypeORM para ejecutar transacciones.
   *
   * @returns Manager asociado al repositorio `signings`
   */
  getEntityManager(): EntityManager {
    return this.signingRepository.manager;
  }

  /**
   * Crea un fichaje
   * @param entity - Datos del fichaje
   * @returns Registro persistido
   */
  async create(entity: Partial<Signing>): Promise<Signing> {
    const persisted = await this.signingRepository.save(entity);
    /**
     * Un fichaje recién creado no tiene filas en `signings_updates`; evitamos una consulta extra.
     */
    persisted.updatesCount = 0;
    return persisted;
  }

  /**
   * Obtiene el último fichaje de entrada (`start`) sin duración calculada para un usuario, antes (o en) un momento dado.
   * Se usa al registrar una salida para asignar `duration_in_seconds` al `start`.
   *
   * @param userEnterpriseId Identificador del vínculo `user_enterprise`
   * @param inclusiveEndMoment Momento de la salida (límite superior, inclusive)
   * @returns Signing `start` pendiente o `null` si no existe
   */
  async findLatestOpenStartSigningForUser(
    userEnterpriseId: string,
    inclusiveEndMoment: Date,
  ): Promise<Signing | null> {
    return this.signingRepository
      .createQueryBuilder('s')
      .where('s.userEnterpriseId = :userEnterpriseId', { userEnterpriseId })
      .andWhere('s.action = :action', { action: SigningAction.START })
      .andWhere('s.durationInSeconds IS NULL')
      .andWhere('s.cancelled = :activeSigning', { activeSigning: false })
      .andWhere('s.moment <= :endMoment', { endMoment: inclusiveEndMoment })
      .orderBy('s.moment', 'DESC')
      .getOne();
  }

  /**
   * Devuelve todos los fichajes de un vínculo usuario–empresa, ordenados cronológicamente.
   * A igualdad de `moment`, se ordena poniendo `start` antes de `end` (intervalo cero) y
   * luego por `id` (orden estable).
   *
   * @param userEnterpriseId - UUID de `user_enterprise.id`
   * @returns Fichajes ordenados
   */
  async findByUserEnterpriseIdOrderedByMoment(
    userEnterpriseId: string,
  ): Promise<Signing[]> {
    return this.signingRepository
      .createQueryBuilder('s')
      .where('s.userEnterpriseId = :userEnterpriseId', { userEnterpriseId })
      .andWhere('s.cancelled = :activeSigning', { activeSigning: false })
      .orderBy('s.moment', 'ASC')
      .addOrderBy(
        `CASE WHEN s.action = :actionStart THEN 0 ELSE 1 END`,
        'ASC',
      )
      .setParameter('actionStart', SigningAction.START)
      .addOrderBy('s.id', 'ASC')
      .getMany();
  }

  /**
   * Listado paginado de fichajes
   * @param page - Página
   * @param pageSize - Tamaño de página
   * @param sort - Campo de orden
   * @param order - Dirección
   * @param filter - Filtros
   * @param relations - Relaciones
   * @returns Página de resultados
   */
  async findAll(
    page: number = 1,
    pageSize: number = 10,
    sort: string = 'moment',
    order: 'ASC' | 'DESC' = 'DESC',
    filter: Record<string, unknown> = {},
    relations?: string[]
  ): Promise<PaginatedResponse<Signing>> {
    const options: QueryFilterOptions = {
      page,
      pageSize,
      sort,
      order,
      filter,
      /**
       * Listados: solo fichajes no cancelados (independientemente de filtros añadidos en cliente).
       */
      extraAndWhere: {
        sql: 'signing.cancelled = :signingListActiveOnly',
        parameters: { signingListActiveOnly: false },
      },
      relations: (relations ?? []).map(relation => ({
        property: relation,
        alias: relation,
        isLeftJoinAndSelect: true,
      })),
    };

    const pageResult = await QueryBuilderService.getPaginatedResults(
      this.signingRepository,
      'signing',
      options,
    );
    await this.attachUpdatesCountsToSignings(pageResult.items);
    return pageResult;
  }

  /**
   * Busca un fichaje por id
   * @param id - UUID
   * @param relations - Relaciones opcionales
   * @returns Signing o null
   */
  async findById(id: string, relations?: string[]): Promise<Signing | null> {
    this.logger.log(`Buscando signing por id: ${id}`);
    const entity = await this.signingRepository.findOne({ where: { id }, relations });
    if (entity) {
      await this.attachUpdatesCountsToSignings([entity]);
    }
    return entity;
  }

  /**
   * Rellena {@link Signing.updatesCount} en memoria con el conteo de filas en `signings_updates`
   * por cada `signings_id`, en una sola consulta agregada.
   *
   * @param items - Fichajes devueltos al cliente (se mutan in-place)
   */
  private async attachUpdatesCountsToSignings(items: Signing[]): Promise<void> {
    if (items.length === 0) {
      return;
    }
    const signingIds = items.map((row) => row.id).filter((idValue): idValue is string => !!idValue);
    if (signingIds.length === 0) {
      return;
    }

    const countRows = await this.signingRepository.manager
      .createQueryBuilder()
      .select('su.signings_id', 'signingId')
      .addSelect('COUNT(su.id)', 'updatesCount')
      .from(SigningUpdate, 'su')
      .where('su.signings_id IN (:...signingIds)', { signingIds })
      .groupBy('su.signings_id')
      .getRawMany<{ signingId: string; updatesCount: string }>();

    const countBySigningId = new Map<string, number>(
      countRows.map((row) => [
        row.signingId,
        Number.parseInt(String(row.updatesCount), 10) || 0,
      ]),
    );

    for (const signing of items) {
      if (!signing.id) {
        continue;
      }
      signing.updatesCount = countBySigningId.get(signing.id) ?? 0;
    }
  }

  /**
   * Actualiza un fichaje
   * @param id - UUID
   * @param partial - Campos a actualizar (no debe incluir createdAt en negocio)
   * @returns Entidad actualizada
   */
  async updateById(id: string, partial: Partial<Signing>): Promise<Signing> {
    const existing = await this.signingRepository.findOne({ where: { id } });
    if (!existing) {
      throw new HttpException('Fichaje no encontrado', HttpStatus.NOT_FOUND);
    }
    await this.signingRepository.save({ ...existing, ...partial });
    return this.findById(id, ['userEnterprise', 'userEnterprise.user']);
  }

  /**
   * Marca un fichaje como cancelado (anulación lógica; no borra la fila).
   * El registro debe existir; el ámbito de empresa se valida en el servicio.
   *
   * @param signing - Entidad cargada
   * @returns Registro guardado
   */
  markCancelledEntity(signing: Signing): Promise<Signing> {
    this.logger.log(`Anulando lógicamente signing id: ${signing.id}`);
    signing.cancelled = true;
    return this.signingRepository.save(signing);
  }
}
