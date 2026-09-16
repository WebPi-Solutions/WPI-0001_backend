import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeleteResult, Repository } from 'typeorm';
import { QueryBuilderService, QueryFilterOptions } from 'src/common/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { SpentConceptSerial } from './spent-concept-serial.entity';

/**
 * Repositorio de acceso a datos para números de serie de línea (`spent_concept_serials`).
 */
@Injectable()
export class SpentConceptSerialRepository {
  private readonly logger = new Logger(SpentConceptSerialRepository.name);

  constructor(
    @InjectRepository(SpentConceptSerial)
    private readonly spentConceptSerialRepository: Repository<SpentConceptSerial>,
  ) {}

  /**
   * Crea un número de serie de línea
   * @param entity - Datos del número de serie
   * @returns Registro persistido
   */
  async create(entity: Partial<SpentConceptSerial>): Promise<SpentConceptSerial> {
    this.logger.log(
      `Creando número de serie para la línea ${entity.spentConceptId}`,
    );
    try {
      return await this.spentConceptSerialRepository.save(entity);
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
  ): Promise<PaginatedResponse<SpentConceptSerial>> {
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
      this.spentConceptSerialRepository,
      'spentConceptSerial',
      options,
    );
  }

  /**
   * Busca un número de serie por identificador
   * @param id - UUID
   * @param relations - Relaciones opcionales
   * @returns Registro o null
   */
  findById(id: string, relations?: string[]): Promise<SpentConceptSerial | null> {
    this.logger.log(`Buscando número de serie de línea por id: ${id}`);
    return this.spentConceptSerialRepository.findOne({ where: { id }, relations });
  }

  /**
   * Actualiza un número de serie
   * @param id - UUID
   * @param partial - Campos a actualizar
   * @returns Entidad actualizada
   */
  async updateById(
    id: string,
    partial: Partial<SpentConceptSerial>,
  ): Promise<SpentConceptSerial> {
    const existing = await this.spentConceptSerialRepository.findOne({ where: { id } });
    if (!existing) {
      this.logger.warn(`No existe el número de serie de línea ${id}`);
      throw new HttpException(
        'Número de serie de concepto no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    try {
      await this.spentConceptSerialRepository.save({ ...existing, ...partial });
    } catch (error) {
      this.rethrowUniqueConstraint(error);
      throw error;
    }
    return this.findById(id, ['spentConcept']);
  }

  /**
   * Elimina un número de serie por identificador
   * @param id - UUID
   * @returns Resultado del borrado
   */
  deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando número de serie de línea id: ${id}`);
    return this.spentConceptSerialRepository.delete(id);
  }

  /**
   * Cuenta los números de serie de una línea.
   * @param spentConceptId - UUID de la línea
   * @returns Número de series persistidas
   */
  countBySpentConceptId(spentConceptId: string): Promise<number> {
    this.logger.log(`Contando números de serie de la línea ${spentConceptId}`);
    return this.spentConceptSerialRepository.count({ where: { spentConceptId } });
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
