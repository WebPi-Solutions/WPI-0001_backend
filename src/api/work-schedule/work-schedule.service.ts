import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EnterpriseAccessService } from 'src/api/common/enterprise-access.service';
import { WorkScheduleRepository } from 'src/entities/work-schedule/work-schedule-repository.service';
import { WorkSchedule } from 'src/entities/work-schedule/work-schedule.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { DeleteResult } from 'typeorm';
import { CreateWorkScheduleDto } from './dto/create-work-schedule.dto';
import { UpdateWorkScheduleDto } from './dto/update-work-schedule.dto';

/** Relaciones mínimas para filtrar por empresa vía `user_enterprise`. */
const USER_ENTERPRISE_RELATIONS = [
  'userEnterprise',
  'userEnterprise.enterprise',
  'userEnterprise.user',
];

/**
 * Servicio de API para franjas de trabajo (`schedules`).
 * El listado y la comprobación de acceso usan `enterpriseId` y la vinculación usuario-empresa.
 */
@Injectable()
export class WorkScheduleService {
  private readonly logger = new Logger(WorkScheduleService.name);

  constructor(
    private readonly workScheduleRepository: WorkScheduleRepository,
    private readonly enterpriseAccessService: EnterpriseAccessService,
  ) {}

  /**
   * Comprueba que la franja exista y que su usuario pertenezca a la empresa.
   * @param id - UUID de la franja
   * @param enterpriseId - Empresa
   * @param relations - Relaciones adicionales solicitadas por el cliente
   * @returns Entidad cargada con relaciones necesarias para la comprobación
   */
  private async loadScopedOrThrow(
    id: string,
    enterpriseId: string,
    relations?: string[],
  ): Promise<WorkSchedule> {
    const mergedRelations = [
      ...new Set([...USER_ENTERPRISE_RELATIONS, ...(relations ?? [])]),
    ];
    const entity = await this.workScheduleRepository.findById(
      id,
      mergedRelations,
    );
    if (!entity) {
      this.logger.warn(`Franja ${id} no encontrada`);
      throw new HttpException(
        'Franja de horario no encontrada',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.enterpriseAccessService.assertUserEnterpriseBelongsToEnterprise(
      entity.userEnterpriseId,
      enterpriseId,
      { operationContext: 'work-schedule', notFoundMessage: 'Franja de horario no encontrada' },
    );
    return entity;
  }

  /**
   * Crea una franja tras validar que el usuario pertenece a la empresa.
   * @param enterpriseId - Empresa (query)
   * @param dto - Campos permitidos
   * @returns Registro creado
   */
  async create(
    enterpriseId: string,
    dto: CreateWorkScheduleDto,
  ): Promise<WorkSchedule> {
    this.logger.log(
      `Creando franja de trabajo para userEnterprise ${dto.userEnterpriseId} (empresa ${enterpriseId})`,
    );

    await this.enterpriseAccessService.assertUserEnterpriseBelongsToEnterprise(
      dto.userEnterpriseId,
      enterpriseId,
      { operationContext: 'work-schedule', notFoundMessage: 'Franja de horario no encontrada' },
    );

    const entityData: Partial<WorkSchedule> = {
      userEnterpriseId: dto.userEnterpriseId,
      startsAt: new Date(dto.startsAt),
      endsAt: new Date(dto.endsAt),
    };

    try {
      const created = await this.workScheduleRepository.create(entityData);
      this.logger.log(`Franja creada con id ${created.id}`);
      return created;
    } catch (error) {
      this.logger.error(`Error al crear franja de trabajo:`, error);
      throw error;
    }
  }

  /**
   * Listado paginado restringido a usuarios de la empresa (join vía relaciones).
   * @param page - Página
   * @param pageSize - Tamaño
   * @param sort - Orden
   * @param order - Dirección
   * @param filter - Filtros (debe incluir `userEnterprise.enterpriseId` y opcionalmente `userEnterpriseId`)
   * @param relations - Relaciones (se fusionan con las necesarias para el filtro por empresa)
   * @returns Página de resultados
   */
  async findAll(
    page: number,
    pageSize: number,
    sort: string,
    order: 'ASC' | 'DESC',
    filter: Record<string, unknown>,
    relations?: string[],
  ): Promise<PaginatedResponse<WorkSchedule>> {
    const mergedRelations = [
      ...new Set([...USER_ENTERPRISE_RELATIONS, ...(relations ?? [])]),
    ];

    this.logger.log(
      `Listando franjas — página ${page}, orden ${sort} ${order}, filtros: ${JSON.stringify(filter)}, relaciones: ${mergedRelations.join(', ')}`,
    );

    return this.workScheduleRepository.findAll(
      page,
      pageSize,
      sort,
      order,
      filter,
      mergedRelations,
    );
  }

  /**
   * Obtiene una franja si su usuario pertenece a la empresa.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @param relations - Relaciones opcionales
   * @returns WorkSchedule
   */
  async findById(
    id: string,
    enterpriseId: string,
    relations?: string[],
  ): Promise<WorkSchedule> {
    this.logger.log(`Buscando franja ${id} para empresa ${enterpriseId}`);
    return this.loadScopedOrThrow(id, enterpriseId, relations);
  }

  /**
   * Actualiza solo inicio y fin si la franja pertenece a la empresa.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @param dto - Campos opcionales
   * @returns Entidad actualizada
   */
  async updateById(
    id: string,
    enterpriseId: string,
    dto: UpdateWorkScheduleDto,
  ): Promise<WorkSchedule> {
    this.logger.log(`Actualizando franja ${id} para empresa ${enterpriseId}`);

    await this.loadScopedOrThrow(id, enterpriseId);

    const entityData: Partial<WorkSchedule> = {};
    if (dto.startsAt !== undefined) {
      entityData.startsAt = new Date(dto.startsAt);
    }
    if (dto.endsAt !== undefined) {
      entityData.endsAt = new Date(dto.endsAt);
    }

    if (Object.keys(entityData).length === 0) {
      this.logger.log(`Sin campos editables; se devuelve el registro actual`);
      return this.findById(id, enterpriseId, [
        'userEnterprise',
        'userEnterprise.user',
      ]);
    }

    try {
      const updated = await this.workScheduleRepository.updateById(
        id,
        entityData,
      );
      this.logger.log(`Franja ${id} actualizada`);
      return updated;
    } catch (error) {
      this.logger.error(`Error al actualizar franja ${id}:`, error);
      throw error;
    }
  }

  /**
   * Elimina la franja si pertenece a la empresa vía usuario vinculado.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @returns Resultado de borrado
   */
  async deleteById(id: string, enterpriseId: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando franja ${id} para empresa ${enterpriseId}`);

    await this.loadScopedOrThrow(id, enterpriseId);

    try {
      const result = await this.workScheduleRepository.deleteById(id);
      this.logger.log(
        `Franja ${id} eliminada, filas afectadas: ${result.affected ?? 0}`,
      );
      return result;
    } catch (error) {
      this.logger.error(`Error al eliminar franja ${id}:`, error);
      throw error;
    }
  }
}
