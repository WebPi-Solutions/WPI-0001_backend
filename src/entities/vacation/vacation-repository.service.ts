import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeleteResult, Repository } from 'typeorm';
import { QueryBuilderService, QueryFilterOptions } from 'src/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { Vacation } from './vacation.entity';

/**
 * Repositorio de vacaciones / permisos (vacations).
 */
@Injectable()
export class VacationRepository {
  private readonly logger = new Logger(VacationRepository.name);

  constructor(
    @InjectRepository(Vacation)
    private readonly vacationRepository: Repository<Vacation>
  ) {}

  /**
   * Crea un registro de vacaciones
   * @param entity - Datos del permiso
   * @returns Registro guardado
   */
  create(entity: Partial<Vacation>): Promise<Vacation> {
    return this.vacationRepository.save(entity);
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
    sort: string = 'calendarDate',
    order: 'ASC' | 'DESC' = 'ASC',
    filter: Record<string, unknown> = {},
    relations?: string[]
  ): Promise<PaginatedResponse<Vacation>> {
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

    return QueryBuilderService.getPaginatedResults(this.vacationRepository, 'vacation', options);
  }

  /**
   * Busca por id
   * @param id - UUID
   * @param relations - Relaciones opcionales
   * @returns Vacation o null
   */
  findById(id: string, relations?: string[]): Promise<Vacation | null> {
    this.logger.log(`Buscando vacation por id: ${id}`);
    return this.vacationRepository.findOne({ where: { id }, relations });
  }

  /**
   * Actualiza un registro
   * @param id - UUID
   * @param partial - Campos a fusionar
   * @returns Entidad actualizada
   */
  async updateById(id: string, partial: Partial<Vacation>): Promise<Vacation> {
    const existing = await this.vacationRepository.findOne({ where: { id } });
    if (!existing) {
      throw new HttpException('Registro de vacaciones no encontrado', HttpStatus.NOT_FOUND);
    }
    await this.vacationRepository.save({ ...existing, ...partial });
    return this.findById(id, ['userEnterprise', 'userEnterprise.user', 'userEnterprise.enterprise']);
  }

  /**
   * Elimina por id
   * @param id - UUID
   * @returns Resultado del borrado
   */
  deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando vacation id: ${id}`);
    return this.vacationRepository.delete(id);
  }
}
