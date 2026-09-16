import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeleteResult, Repository } from 'typeorm';
import { QueryBuilderService, QueryFilterOptions } from 'src/common/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { InvoiceConceptSerial } from './invoice-concept-serial.entity';

/**
 * Repositorio de acceso a datos para números de serie de línea (`invoice_concept_serials`).
 */
@Injectable()
export class InvoiceConceptSerialRepository {
  private readonly logger = new Logger(InvoiceConceptSerialRepository.name);

  constructor(
    @InjectRepository(InvoiceConceptSerial)
    private readonly invoiceConceptSerialRepository: Repository<InvoiceConceptSerial>,
  ) {}

  /**
   * Crea un número de serie de línea
   * @param entity - Datos del número de serie
   * @returns Registro persistido
   */
  async create(entity: Partial<InvoiceConceptSerial>): Promise<InvoiceConceptSerial> {
    this.logger.log(
      `Creando número de serie para la línea ${entity.invoiceConceptId}`,
    );
    try {
      return await this.invoiceConceptSerialRepository.save(entity);
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
  }

  /**
   * Listado paginado de números de serie
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
    sort: string = 'createdAt',
    order: 'ASC' | 'DESC' = 'ASC',
    filter: Record<string, unknown> = {},
    relations?: string[],
  ): Promise<PaginatedResponse<InvoiceConceptSerial>> {
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
      this.invoiceConceptSerialRepository,
      'invoiceConceptSerial',
      options,
    );
  }

  /**
   * Busca un número de serie por identificador
   * @param id - UUID
   * @param relations - Relaciones opcionales
   * @returns Registro o null
   */
  findById(id: string, relations?: string[]): Promise<InvoiceConceptSerial | null> {
    this.logger.log(`Buscando número de serie de línea por id: ${id}`);
    return this.invoiceConceptSerialRepository.findOne({ where: { id }, relations });
  }

  /**
   * Actualiza un número de serie
   * @param id - UUID
   * @param partial - Campos a actualizar
   * @returns Entidad actualizada
   */
  async updateById(
    id: string,
    partial: Partial<InvoiceConceptSerial>,
  ): Promise<InvoiceConceptSerial> {
    const existing = await this.invoiceConceptSerialRepository.findOne({ where: { id } });
    if (!existing) {
      this.logger.warn(`No existe el número de serie de línea ${id}`);
      throw new HttpException(
        'Número de serie de concepto no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    try {
      await this.invoiceConceptSerialRepository.save({ ...existing, ...partial });
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
    return this.findById(id, ['invoiceConcept']);
  }

  /**
   * Elimina un número de serie por identificador
   * @param id - UUID
   * @returns Resultado del borrado
   */
  deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando número de serie de línea id: ${id}`);
    return this.invoiceConceptSerialRepository.delete(id);
  }

  /**
   * Cuenta los números de serie de una línea.
   * @param invoiceConceptId - UUID de la línea
   * @returns Número de series persistidas
   */
  countByInvoiceConceptId(invoiceConceptId: string): Promise<number> {
    this.logger.log(`Contando números de serie de la línea ${invoiceConceptId}`);
    return this.invoiceConceptSerialRepository.count({ where: { invoiceConceptId } });
  }

  /**
   * Traduce la violación de unicidad de serie a un 409.
   * @param error - Error de TypeORM/PostgreSQL
   */
  private rethrowUniqueConstraint(error: unknown): void {
    const driverError = error as { code?: string; driverError?: { code?: string } };
    const postgresCode = driverError.code ?? driverError.driverError?.code;
    if (postgresCode === '23505') {
      this.logger.warn('Conflicto de unicidad al persistir un número de serie de línea');
      throw new HttpException(
        'El número de serie ya está asignado a este concepto',
        HttpStatus.CONFLICT,
      );
    }
  }
}
