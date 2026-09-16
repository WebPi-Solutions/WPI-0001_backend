import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeleteResult, Repository } from 'typeorm';
import { QueryBuilderService, QueryFilterOptions } from 'src/common/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { OrderConcept } from './order-concept.entity';

/**
 * Repositorio de acceso a datos para líneas de pedido (`order_concepts`).
 */
@Injectable()
export class OrderConceptRepository {
  private readonly logger = new Logger(OrderConceptRepository.name);

  constructor(
    @InjectRepository(OrderConcept)
    private readonly orderConceptRepository: Repository<OrderConcept>,
  ) {}

  /**
   * Crea una línea de pedido
   * @param entity - Datos de la línea
   * @returns Línea persistida
   */
  async create(entity: Partial<OrderConcept>): Promise<OrderConcept> {
    this.logger.log(`Creando línea de pedido para order ${entity.orderId}`);
    try {
      return await this.orderConceptRepository.save(entity);
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
  ): Promise<PaginatedResponse<OrderConcept>> {
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
      this.orderConceptRepository,
      'orderConcept',
      options,
    );
  }

  /**
   * Busca una línea por identificador
   * @param id - UUID
   * @param relations - Relaciones opcionales
   * @returns Línea o null
   */
  findById(id: string, relations?: string[]): Promise<OrderConcept | null> {
    this.logger.log(`Buscando línea de pedido por id: ${id}`);
    return this.orderConceptRepository.findOne({ where: { id }, relations });
  }

  /**
   * Devuelve la posición máxima de las líneas de un pedido, o null si no hay ninguna.
   * @param orderId - UUID del pedido
   * @returns Posición máxima o null
   */
  async findMaxPositionByOrderId(orderId: string): Promise<number | null> {
    const rawRow = await this.orderConceptRepository
      .createQueryBuilder('orderConcept')
      .select('MAX(orderConcept.position)', 'maxPosition')
      .where('orderConcept.orderId = :orderId', { orderId })
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
  async updateById(id: string, partial: Partial<OrderConcept>): Promise<OrderConcept> {
    const existing = await this.orderConceptRepository.findOne({ where: { id } });
    if (!existing) {
      this.logger.warn(`No existe la línea de pedido ${id}`);
      throw new HttpException('Concepto de pedido no encontrado', HttpStatus.NOT_FOUND);
    }

    try {
      await this.orderConceptRepository.save({ ...existing, ...partial });
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
    return this.findById(id, ['order', 'item']);
  }

  /**
   * Elimina una línea por identificador
   * @param id - UUID
   * @returns Resultado del borrado
   */
  deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando línea de pedido id: ${id}`);
    return this.orderConceptRepository.delete(id);
  }

  /**
   * Traduce la violación de unicidad de posición a un 409.
   * @param error - Error de TypeORM/PostgreSQL
   */
  private rethrowUniqueConstraint(error: unknown): void {
    const driverError = error as { code?: string; driverError?: { code?: string } };
    const postgresCode = driverError.code ?? driverError.driverError?.code;
    if (postgresCode === '23505') {
      this.logger.warn('Conflicto de unicidad al persistir una línea de pedido');
      throw new HttpException(
        'Ya existe un concepto en esa posición del pedido',
        HttpStatus.CONFLICT,
      );
    }
  }
}
