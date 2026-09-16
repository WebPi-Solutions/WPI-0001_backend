import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeleteResult, Repository } from 'typeorm';
import { QueryBuilderService, QueryFilterOptions } from 'src/common/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { QuoteConcept } from './quote-concept.entity';

/**
 * Repositorio de acceso a datos para líneas de presupuesto (`quote_concepts`).
 */
@Injectable()
export class QuoteConceptRepository {
  private readonly logger = new Logger(QuoteConceptRepository.name);

  constructor(
    @InjectRepository(QuoteConcept)
    private readonly quoteConceptRepository: Repository<QuoteConcept>,
  ) {}

  /**
   * Crea una línea de presupuesto
   * @param entity - Datos de la línea
   * @returns Línea persistida
   */
  async create(entity: Partial<QuoteConcept>): Promise<QuoteConcept> {
    this.logger.log(`Creando línea de presupuesto para quote ${entity.quoteId}`);
    try {
      return await this.quoteConceptRepository.save(entity);
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
  ): Promise<PaginatedResponse<QuoteConcept>> {
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
      this.quoteConceptRepository,
      'quoteConcept',
      options,
    );
  }

  /**
   * Busca una línea por identificador
   * @param id - UUID
   * @param relations - Relaciones opcionales
   * @returns Línea o null
   */
  findById(id: string, relations?: string[]): Promise<QuoteConcept | null> {
    this.logger.log(`Buscando línea de presupuesto por id: ${id}`);
    return this.quoteConceptRepository.findOne({ where: { id }, relations });
  }

  /**
   * Devuelve la posición máxima de las líneas de un presupuesto, o null si no hay ninguna.
   * @param quoteId - UUID del presupuesto
   * @returns Posición máxima o null
   */
  async findMaxPositionByQuoteId(quoteId: string): Promise<number | null> {
    const rawRow = await this.quoteConceptRepository
      .createQueryBuilder('quoteConcept')
      .select('MAX(quoteConcept.position)', 'maxPosition')
      .where('quoteConcept.quoteId = :quoteId', { quoteId })
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
  async updateById(id: string, partial: Partial<QuoteConcept>): Promise<QuoteConcept> {
    const existing = await this.quoteConceptRepository.findOne({ where: { id } });
    if (!existing) {
      this.logger.warn(`No existe la línea de presupuesto ${id}`);
      throw new HttpException('Concepto de presupuesto no encontrado', HttpStatus.NOT_FOUND);
    }

    try {
      await this.quoteConceptRepository.save({ ...existing, ...partial });
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
    return this.findById(id, ['quote', 'item']);
  }

  /**
   * Elimina una línea por identificador
   * @param id - UUID
   * @returns Resultado del borrado
   */
  deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando línea de presupuesto id: ${id}`);
    return this.quoteConceptRepository.delete(id);
  }

  /**
   * Traduce la violación de unicidad de posición a un 409.
   * @param error - Error de TypeORM/PostgreSQL
   */
  private rethrowUniqueConstraint(error: unknown): void {
    const driverError = error as { code?: string; driverError?: { code?: string } };
    const postgresCode = driverError.code ?? driverError.driverError?.code;
    if (postgresCode === '23505') {
      this.logger.warn('Conflicto de unicidad al persistir una línea de presupuesto');
      throw new HttpException(
        'Ya existe un concepto en esa posición del presupuesto',
        HttpStatus.CONFLICT,
      );
    }
  }
}
