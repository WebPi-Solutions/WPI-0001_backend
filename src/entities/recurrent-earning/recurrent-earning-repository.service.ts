import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeleteResult, Repository } from 'typeorm';
import { QueryBuilderService, QueryFilterOptions } from 'src/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { RecurrentEarning } from './recurrent-earning.entity';

/**
 * Repositorio de ingresos recurrentes.
 * Encapsula las operaciones de persistencia sobre la tabla recurrent_earnings.
 */
@Injectable()
export class RecurrentEarningRepository {
  private readonly logger = new Logger(RecurrentEarningRepository.name);

  constructor(
    @InjectRepository(RecurrentEarning)
    private readonly recurrentEarningTypeOrmRepository: Repository<RecurrentEarning>,
  ) {}

  /**
   * Crea un nuevo ingreso recurrente.
   * @param recurrentEarning - El ingreso recurrente a persistir
   * @returns El ingreso recurrente creado
   */
  create(recurrentEarning: RecurrentEarning): Promise<RecurrentEarning> {
    this.logger.log(`Persistiendo ingreso recurrente "${recurrentEarning.name}"`);
    return this.recurrentEarningTypeOrmRepository.save(recurrentEarning);
  }

  /**
   * Obtiene ingresos recurrentes paginados, filtrados y ordenados.
   * @param page - Número de página
   * @param pageSize - Tamaño de página
   * @param sort - Campo por el que ordenar
   * @param order - Dirección de ordenación
   * @param filter - Filtros a aplicar
   * @param relations - Relaciones a incluir
   * @returns Respuesta paginada con los ingresos recurrentes
   */
  findAll(
    page: number = 1,
    pageSize: number = 10,
    sort: string = 'createdAt',
    order: 'ASC' | 'DESC' = 'DESC',
    filter: Record<string, any> = {},
    relations?: string[],
  ): Promise<PaginatedResponse<RecurrentEarning>> {
    const options: QueryFilterOptions = {
      page,
      pageSize,
      sort,
      order,
      filter,
      relations: (relations || []).map(relation => ({
        property: relation,
        alias: relation,
        isLeftJoinAndSelect: true,
      })),
    };

    return QueryBuilderService.getPaginatedResults(
      this.recurrentEarningTypeOrmRepository,
      'recurrentEarning',
      options,
    );
  }

  /**
   * Obtiene un ingreso recurrente por su ID.
   * @param id - El ID del ingreso recurrente
   * @param relations - Relaciones a incluir
   * @returns El ingreso recurrente si existe; null en caso contrario
   */
  findById(id: string, relations?: string[]): Promise<RecurrentEarning> {
    return this.recurrentEarningTypeOrmRepository.findOne({ where: { id }, relations });
  }

  /**
   * Actualiza un ingreso recurrente existente por su ID.
   * @param id - El ID del ingreso recurrente a actualizar
   * @param recurrentEarning - Datos a fusionar con el registro existente
   * @returns El ingreso recurrente actualizado con relaciones
   */
  async updateById(id: string, recurrentEarning: RecurrentEarning): Promise<RecurrentEarning> {
    const recurrentEarningToUpdate = await this.recurrentEarningTypeOrmRepository.findOne({ where: { id } });

    if (!recurrentEarningToUpdate) {
      this.logger.error(`Ingreso recurrente no encontrado con ID: ${id}`);
      throw new HttpException('Ingreso recurrente no encontrado', HttpStatus.NOT_FOUND);
    }

    await this.recurrentEarningTypeOrmRepository.save({
      ...recurrentEarningToUpdate,
      ...recurrentEarning,
    });

    return this.findById(id, ['client', 'invoiceSeries', 'enterprise']);
  }

  /**
   * Elimina un ingreso recurrente por su ID.
   * @param id - El ID del ingreso recurrente a eliminar
   * @returns El resultado de la operación de eliminación
   */
  deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando ingreso recurrente con ID: ${id}`);
    return this.recurrentEarningTypeOrmRepository.delete(id);
  }
}
