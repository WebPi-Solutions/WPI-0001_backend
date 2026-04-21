import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeleteResult, Repository } from 'typeorm';
import { QueryBuilderService, QueryFilterOptions } from 'src/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { DefaultSchedule } from './default-schedule.entity';

/**
 * Repositorio de acceso a datos para plantillas de horario por defecto (default_schedules).
 */
@Injectable()
export class DefaultScheduleRepository {
  private readonly logger = new Logger(DefaultScheduleRepository.name);

  constructor(
    @InjectRepository(DefaultSchedule)
    private readonly defaultScheduleRepository: Repository<DefaultSchedule>
  ) {}

  /**
   * Persiste una nueva plantilla de horario
   * @param entity - Datos de la plantilla
   * @returns Registro guardado
   */
  create(entity: Partial<DefaultSchedule>): Promise<DefaultSchedule> {
    return this.defaultScheduleRepository.save(entity);
  }

  /**
   * Listado paginado con filtros y relaciones
   * @param page - Página (base 1)
   * @param pageSize - Tamaño de página
   * @param sort - Campo de ordenación
   * @param order - Dirección ASC o DESC
   * @param filter - Filtros dinámicos
   * @param relations - Relaciones a incluir
   * @returns Resultado paginado
   */
  findAll(
    page: number = 1,
    pageSize: number = 10,
    sort: string = 'name',
    order: 'ASC' | 'DESC' = 'ASC',
    filter: Record<string, unknown> = {},
    relations?: string[]
  ): Promise<PaginatedResponse<DefaultSchedule>> {
    const options: QueryFilterOptions = {
      page,
      pageSize,
      sort,
      order,
      filter,
      relations: (relations ?? []).map(relation => ({
        property: relation,
        alias: relation,
        isLeftJoinAndSelect: true,
      })),
    };

    return QueryBuilderService.getPaginatedResults(
      this.defaultScheduleRepository,
      'defaultSchedule',
      options
    );
  }

  /**
   * Obtiene una plantilla por su identificador
   * @param id - UUID de la plantilla
   * @param relations - Relaciones opcionales
   * @returns Entidad o null
   */
  findById(id: string, relations?: string[]): Promise<DefaultSchedule | null> {
    this.logger.log(`Buscando default_schedule por id: ${id}`);
    return this.defaultScheduleRepository.findOne({ where: { id }, relations });
  }

  /**
   * Actualiza una plantilla existente
   * @param id - UUID de la plantilla
   * @param partial - Campos a fusionar
   * @returns Entidad actualizada
   */
  async updateById(id: string, partial: Partial<DefaultSchedule>): Promise<DefaultSchedule> {
    const existing = await this.defaultScheduleRepository.findOne({ where: { id } });
    if (!existing) {
      throw new HttpException('Plantilla de horario no encontrada', HttpStatus.NOT_FOUND);
    }
    await this.defaultScheduleRepository.save({ ...existing, ...partial });
    return this.findById(id, ['enterprise']);
  }

  /**
   * Elimina una plantilla por id
   * @param id - UUID de la plantilla
   * @returns Resultado de borrado
   */
  deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando default_schedule id: ${id}`);
    return this.defaultScheduleRepository.delete(id);
  }
}
