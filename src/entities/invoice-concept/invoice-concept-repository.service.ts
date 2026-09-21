import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeleteResult, Repository } from 'typeorm';
import { QueryBuilderService, QueryFilterOptions } from 'src/common/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { InvoiceConcept } from './invoice-concept.entity';

/**
 * Repositorio de acceso a datos para líneas de factura (`invoice_concepts`).
 */
@Injectable()
export class InvoiceConceptRepository {
  private readonly logger = new Logger(InvoiceConceptRepository.name);

  constructor(
    @InjectRepository(InvoiceConcept)
    private readonly invoiceConceptRepository: Repository<InvoiceConcept>,
  ) {}

  /**
   * Crea una línea de factura
   * @param entity - Datos de la línea
   * @returns Línea persistida
   */
  async create(entity: Partial<InvoiceConcept>): Promise<InvoiceConcept> {
    this.logger.log(`Creando línea de factura para invoice ${entity.invoiceId}`);
    try {
      return await this.invoiceConceptRepository.save(entity);
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
  ): Promise<PaginatedResponse<InvoiceConcept>> {
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
      this.invoiceConceptRepository,
      'invoiceConcept',
      options,
    );
  }

  /**
   * Busca una línea por identificador
   * @param id - UUID
   * @param relations - Relaciones opcionales
   * @returns Línea o null
   */
  findById(id: string, relations?: string[]): Promise<InvoiceConcept | null> {
    this.logger.log(`Buscando línea de factura por id: ${id}`);
    return this.invoiceConceptRepository.findOne({ where: { id }, relations });
  }

  /**
   * Devuelve la posición máxima de las líneas de una factura, o null si no hay ninguna.
   * @param invoiceId - UUID de la factura
   * @returns Posición máxima o null
   */
  async findMaxPositionByInvoiceId(invoiceId: string): Promise<number | null> {
    const rawRow = await this.invoiceConceptRepository
      .createQueryBuilder('invoiceConcept')
      .select('MAX(invoiceConcept.position)', 'maxPosition')
      .where('invoiceConcept.invoiceId = :invoiceId', { invoiceId })
      .getRawOne<{ maxPosition: string | number | null }>();

    if (rawRow?.maxPosition === null || rawRow?.maxPosition === undefined) {
      return null;
    }
    return Number(rawRow.maxPosition);
  }

  /**
   * Lista las líneas de una factura.
   * @param invoiceId - UUID de la factura
   * @param relations - Relaciones opcionales
   * @returns Líneas encontradas
   */
  findByInvoiceId(invoiceId: string, relations?: string[]): Promise<InvoiceConcept[]> {
    this.logger.log(`Listando líneas de la factura ${invoiceId}`);
    return this.invoiceConceptRepository.find({
      where: { invoiceId },
      relations,
      order: { position: 'ASC' },
    });
  }

  /**
   * Actualiza una línea
   * @param id - UUID
   * @param partial - Campos a actualizar
   * @returns Entidad actualizada
   */
  async updateById(id: string, partial: Partial<InvoiceConcept>): Promise<InvoiceConcept> {
    const existing = await this.invoiceConceptRepository.findOne({ where: { id } });
    if (!existing) {
      this.logger.warn(`No existe la línea de factura ${id}`);
      throw new HttpException('Concepto de factura no encontrado', HttpStatus.NOT_FOUND);
    }

    try {
      await this.invoiceConceptRepository.save({ ...existing, ...partial });
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
    return this.findById(id, ['invoice', 'item', 'serials']);
  }

  /**
   * Elimina una línea por identificador
   * @param id - UUID
   * @returns Resultado del borrado
   */
  deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando línea de factura id: ${id}`);
    return this.invoiceConceptRepository.delete(id);
  }

  /**
   * Traduce la violación de unicidad de posición a un 409.
   * @param error - Error de TypeORM/PostgreSQL
   */
  private rethrowUniqueConstraint(error: unknown): void {
    const driverError = error as { code?: string; driverError?: { code?: string } };
    const postgresCode = driverError.code ?? driverError.driverError?.code;
    if (postgresCode === '23505') {
      this.logger.warn('Conflicto de unicidad al persistir una línea de factura');
      throw new HttpException(
        'Ya existe un concepto en esa posición de la factura',
        HttpStatus.CONFLICT,
      );
    }
  }
}
