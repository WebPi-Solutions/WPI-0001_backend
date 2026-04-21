import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeleteResult, Repository } from 'typeorm';
import { QueryBuilderService, QueryFilterOptions } from 'src/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { WorkSchedule } from './work-schedule.entity';

/**
 * Repositorio de franjas de trabajo (schedules).
 */
@Injectable()
export class WorkScheduleRepository {
  private readonly logger = new Logger(WorkScheduleRepository.name);

  constructor(
    @InjectRepository(WorkSchedule)
    private readonly workScheduleRepository: Repository<WorkSchedule>
  ) {}

  /**
   * Crea una franja de trabajo
   * @param entity - Datos de la franja
   * @returns Registro guardado
   */
  create(entity: Partial<WorkSchedule>): Promise<WorkSchedule> {
    return this.workScheduleRepository.save(entity);
  }

  /**
   * Listado paginado
   * @param page - Página
   * @param pageSize - Tamaño
   * @param sort - Campo de orden
   * @param order - Dirección
   * @param filter - Filtros
   * @param relations - Relaciones
   * @returns Página de resultados
   */
  findAll(
    page: number = 1,
    pageSize: number = 10,
    sort: string = 'startsAt',
    order: 'ASC' | 'DESC' = 'DESC',
    filter: Record<string, unknown> = {},
    relations?: string[]
  ): Promise<PaginatedResponse<WorkSchedule>> {
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
      this.workScheduleRepository,
      'workSchedule',
      options
    );
  }

  /**
   * Obtiene una franja por id
   * @param id - UUID
   * @param relations - Relaciones opcionales
   * @returns WorkSchedule o null
   */
  findById(id: string, relations?: string[]): Promise<WorkSchedule | null> {
    this.logger.log(`Buscando work_schedule por id: ${id}`);
    return this.workScheduleRepository.findOne({ where: { id }, relations });
  }

  /**
   * Actualiza una franja
   * @param id - UUID
   * @param partial - Campos a fusionar
   * @returns Entidad actualizada
   */
  async updateById(id: string, partial: Partial<WorkSchedule>): Promise<WorkSchedule> {
    const existing = await this.workScheduleRepository.findOne({ where: { id } });
    if (!existing) {
      throw new HttpException('Franja de horario no encontrada', HttpStatus.NOT_FOUND);
    }
    await this.workScheduleRepository.save({ ...existing, ...partial });
    return this.findById(id, ['user']);
  }

  /**
   * Elimina una franja por id
   * @param id - UUID
   * @returns Resultado del borrado
   */
  deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando work_schedule id: ${id}`);
    return this.workScheduleRepository.delete(id);
  }
}
