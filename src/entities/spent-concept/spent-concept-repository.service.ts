import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeleteResult, Repository } from 'typeorm';
import { QueryBuilderService, QueryFilterOptions } from 'src/common/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { SpentConcept } from './spent-concept.entity';

/**
 * Repositorio de acceso a datos para líneas de gasto (`spent_concepts`).
 */
@Injectable()
export class SpentConceptRepository {
  private readonly logger = new Logger(SpentConceptRepository.name);

  constructor(
    @InjectRepository(SpentConcept)
    private readonly spentConceptRepository: Repository<SpentConcept>,
  ) {}

  /**
   * Crea una línea de gasto
   * @param entity - Datos de la línea
   * @returns Línea persistida
   */
  async create(entity: Partial<SpentConcept>): Promise<SpentConcept> {
    this.logger.log(`Creando línea de gasto para spent ${entity.spentId}`);
    try {
      return await this.spentConceptRepository.save(entity);
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
  }

  /**
   * Listado paginado de líneas
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
    sort: string = 'position',
    order: 'ASC' | 'DESC' = 'ASC',
    filter: Record<string, unknown> = {},
    relations?: string[],
  ): Promise<PaginatedResponse<SpentConcept>> {
    const options: QueryFilterOptions = {
      page,
      pageSize,
      sort,
      order,
      filter,
      relations: (relations ?? []).map((relation) => ({
        property: relation,
        alias: relation,
        isLeftJoinAndSelect: true,
      })),
    };

    return QueryBuilderService.getPaginatedResults(
      this.spentConceptRepository,
      'spentConcept',
      options,
    );
  }

  /**
   * Busca una línea por identificador
   * @param id - UUID
   * @param relations - Relaciones opcionales
   * @returns Línea o null
   */
  findById(id: string, relations?: string[]): Promise<SpentConcept | null> {
    this.logger.log(`Buscando línea de gasto por id: ${id}`);
    return this.spentConceptRepository.findOne({ where: { id }, relations });
  }

  /**
   * Devuelve la posición máxima de las líneas de un gasto, o null si no hay ninguna.
   * @param spentId - UUID del gasto
   * @returns Posición máxima o null
   */
  async findMaxPositionBySpentId(spentId: string): Promise<number | null> {
    const rawRow = await this.spentConceptRepository
      .createQueryBuilder('spentConcept')
      .select('MAX(spentConcept.position)', 'maxPosition')
      .where('spentConcept.spentId = :spentId', { spentId })
      .getRawOne<{ maxPosition: string | number | null }>();

    if (rawRow?.maxPosition === null || rawRow?.maxPosition === undefined) {
      return null;
    }
    return Number(rawRow.maxPosition);
  }

  /**
   * Actualiza una línea
   * @param id - UUID
   * @param partial - Campos a actualizar
   * @returns Entidad actualizada
   */
  async updateById(id: string, partial: Partial<SpentConcept>): Promise<SpentConcept> {
    const existing = await this.spentConceptRepository.findOne({ where: { id } });
    if (!existing) {
      this.logger.warn(`No existe la línea de gasto ${id}`);
      throw new HttpException('Concepto de gasto no encontrado', HttpStatus.NOT_FOUND);
    }

    try {
      await this.spentConceptRepository.save({ ...existing, ...partial });
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
    return this.findById(id, ['spent', 'item', 'serials']);
  }

  /**
   * Elimina una línea por identificador
   * @param id - UUID
   * @returns Resultado del borrado
   */
  deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando línea de gasto id: ${id}`);
    return this.spentConceptRepository.delete(id);
  }

  /**
   * Traduce la violación de unicidad de posición a un 409.
   * @param error - Error de TypeORM/PostgreSQL
   */
  private rethrowUniqueConstraint(error: unknown): void {
    const driverError = error as { code?: string; driverError?: { code?: string } };
    const postgresCode = driverError.code ?? driverError.driverError?.code;
    if (postgresCode === '23505') {
      this.logger.warn('Conflicto de unicidad al persistir una línea de gasto');
      throw new HttpException(
        'Ya existe un concepto en esa posición del gasto',
        HttpStatus.CONFLICT,
      );
    }
  }
}
