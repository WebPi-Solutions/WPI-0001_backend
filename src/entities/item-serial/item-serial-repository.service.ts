import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeleteResult, In, Repository } from 'typeorm';
import { QueryBuilderService, QueryFilterOptions } from 'src/common/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { ItemSerialStatus } from 'src/common/enums';
import { ItemSerial } from './item-serial.entity';

/**
 * Repositorio de acceso a datos para números de serie canónicos (`item_serials`).
 */
@Injectable()
export class ItemSerialRepository {
  private readonly logger = new Logger(ItemSerialRepository.name);

  constructor(
    @InjectRepository(ItemSerial)
    private readonly itemSerialRepository: Repository<ItemSerial>,
  ) {}

  /**
   * Crea un número de serie de artículo
   * @param entity - Datos del número de serie
   * @returns Registro persistido
   */
  async create(entity: Partial<ItemSerial>): Promise<ItemSerial> {
    this.logger.log(
      `Creando número de serie ${entity.serialNumber} para el artículo ${entity.itemId}`,
    );
    try {
      return await this.itemSerialRepository.save(entity);
    } catch (error) {
      this.rethrowUniqueConstraint(error, entity.serialNumber);
      throw error;
    }
  }

  /**
   * Listado paginado de números de serie de artículo
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
    sort: string = 'serialNumber',
    order: 'ASC' | 'DESC' = 'ASC',
    filter: Record<string, unknown> = {},
    relations?: string[],
  ): Promise<PaginatedResponse<ItemSerial>> {
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
      this.itemSerialRepository,
      'itemSerial',
      options,
    );
  }

  /**
   * Busca un número de serie por identificador
   * @param id - UUID
   * @param relations - Relaciones opcionales
   * @returns Registro o null
   */
  findById(id: string, relations?: string[]): Promise<ItemSerial | null> {
    this.logger.log(`Buscando número de serie de artículo por id: ${id}`);
    return this.itemSerialRepository.findOne({ where: { id }, relations });
  }

  /**
   * Busca un número de serie por artículo y valor recortado.
   * @param itemId - UUID del artículo
   * @param serialNumber - Número de serie
   * @param relations - Relaciones opcionales
   * @returns Registro o null
   */
  findByItemIdAndSerialNumber(
    itemId: string,
    serialNumber: string,
    relations?: string[],
  ): Promise<ItemSerial | null> {
    this.logger.log(
      `Buscando número de serie ${serialNumber} del artículo ${itemId}`,
    );
    return this.itemSerialRepository.findOne({
      where: { itemId, serialNumber },
      relations,
    });
  }

  /**
   * Lista los números de serie de un artículo, opcionalmente filtrados por estado.
   * @param itemId - UUID del artículo
   * @param statuses - Estados a incluir; si se omite, todos
   * @returns Unidades encontradas
   */
  findByItemId(
    itemId: string,
    statuses?: ItemSerialStatus[],
  ): Promise<ItemSerial[]> {
    this.logger.log(`Listando números de serie del artículo ${itemId}`);
    if (statuses && statuses.length > 0) {
      return this.itemSerialRepository.find({
        where: { itemId, status: In(statuses) },
        order: { serialNumber: 'ASC' },
      });
    }
    return this.itemSerialRepository.find({
      where: { itemId },
      order: { serialNumber: 'ASC' },
    });
  }

  /**
   * Actualiza un número de serie de artículo
   * @param id - UUID
   * @param partial - Campos a actualizar
   * @returns Entidad actualizada
   */
  async updateById(id: string, partial: Partial<ItemSerial>): Promise<ItemSerial> {
    const existing = await this.itemSerialRepository.findOne({ where: { id } });
    if (!existing) {
      this.logger.warn(`No existe el número de serie de artículo ${id}`);
      throw new HttpException(
        'Número de serie de artículo no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    try {
      await this.itemSerialRepository.save({ ...existing, ...partial });
    } catch (error) {
      this.rethrowUniqueConstraint(
        error,
        partial.serialNumber ?? existing.serialNumber,
      );
      throw error;
    }
    return this.findById(id, ['item', 'item.itemCategory']);
  }

  /**
   * Elimina un número de serie de artículo por identificador
   * @param id - UUID
   * @returns Resultado del borrado
   */
  deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando número de serie de artículo id: ${id}`);
    return this.itemSerialRepository.delete(id);
  }

  /**
   * Traduce la violación de unicidad de serie a un 409 indicando el valor en conflicto.
   * @param error - Error de TypeORM/PostgreSQL
   * @param serialNumber - Número de serie que se intentaba persistir
   */
  private rethrowUniqueConstraint(error: unknown, serialNumber?: string): void {
    const driverError = error as { code?: string; driverError?: { code?: string } };
    const postgresCode = driverError.code ?? driverError.driverError?.code;
    if (postgresCode === '23505') {
      const conflictMessage = ItemSerialRepository.buildAlreadyExistsMessage(serialNumber);
      this.logger.warn(conflictMessage);
      throw new HttpException(conflictMessage, HttpStatus.CONFLICT);
    }
  }

  /**
   * Mensaje 409 cuando el número de serie ya está registrado para el artículo.
   * @param serialNumber - Valor en conflicto, si se conoce
   * @returns Texto de error para la API
   */
  static buildAlreadyExistsMessage(serialNumber?: string): string {
    const trimmedSerialNumber = serialNumber?.trim();
    if (!trimmedSerialNumber) {
      return 'El número de serie ya existe para este artículo';
    }
    return `El número de serie ${trimmedSerialNumber} ya existe para este artículo`;
  }
}
