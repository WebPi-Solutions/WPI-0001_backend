import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeleteResult, Repository } from 'typeorm';
import { QueryBuilderService, QueryFilterOptions } from 'src/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { Holiday } from './holiday.entity';

/**
 * Repositorio de acceso a datos para festivos (holidays).
 */
@Injectable()
export class HolidayRepository {
  private readonly logger = new Logger(HolidayRepository.name);

  constructor(
    @InjectRepository(Holiday)
    private readonly holidayRepository: Repository<Holiday>
  ) {}

  /**
   * Crea un registro de festivo
   * @param entity - Datos del festivo
   * @returns Registro persistido
   */
  create(entity: Partial<Holiday>): Promise<Holiday> {
    return this.holidayRepository.save(entity);
  }

  /**
   * Listado paginado de festivos
   * @param page - Página
   * @param pageSize - Tamaño de página
   * @param sort - Campo de ordenación
   * @param order - ASC o DESC
   * @param filter - Filtros
   * @param relations - Relaciones
   * @returns Página de resultados
   */
  findAll(
    page: number = 1,
    pageSize: number = 10,
    sort: string = 'calendarDate',
    order: 'ASC' | 'DESC' = 'ASC',
    filter: Record<string, unknown> = {},
    relations?: string[]
  ): Promise<PaginatedResponse<Holiday>> {
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

    return QueryBuilderService.getPaginatedResults(this.holidayRepository, 'holiday', options);
  }

  /**
   * Busca un festivo por id
   * @param id - UUID
   * @param relations - Relaciones opcionales
   * @returns Holiday o null
   */
  findById(id: string, relations?: string[]): Promise<Holiday | null> {
    this.logger.log(`Buscando holiday por id: ${id}`);
    return this.holidayRepository.findOne({ where: { id }, relations });
  }

  /**
   * Actualiza un festivo
   * @param id - UUID
   * @param partial - Campos a actualizar
   * @returns Entidad actualizada
   */
  async updateById(id: string, partial: Partial<Holiday>): Promise<Holiday> {
    const existing = await this.holidayRepository.findOne({ where: { id } });
    if (!existing) {
      throw new HttpException('Festivo no encontrado', HttpStatus.NOT_FOUND);
    }
    await this.holidayRepository.save({ ...existing, ...partial });
    return this.findById(id, ['enterprise']);
  }

  /**
   * Elimina un festivo por id
   * @param id - UUID
   * @returns Resultado del borrado
   */
  deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando holiday id: ${id}`);
    return this.holidayRepository.delete(id);
  }
}
