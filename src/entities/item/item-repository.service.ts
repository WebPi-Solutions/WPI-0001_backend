import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeleteResult, Repository } from 'typeorm';
import { QueryBuilderService, QueryFilterOptions } from 'src/common/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { Item } from './item.entity';

/**
 * Repositorio de acceso a datos para artículos (tabla `items`).
 */
@Injectable()
export class ItemRepository {
  private readonly logger = new Logger(ItemRepository.name);

  constructor(
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
  ) {}

  /**
   * Crea un artículo
   * @param entity - Datos del artículo
   * @returns Artículo persistido
   */
  create(entity: Partial<Item>): Promise<Item> {
    this.logger.log(`Creando artículo: ${entity.name}`);
    return this.itemRepository.save(entity);
  }

  /**
   * Listado paginado de artículos
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
    sort: string = 'name',
    order: 'ASC' | 'DESC' = 'ASC',
    filter: Record<string, unknown> = {},
    relations?: string[],
  ): Promise<PaginatedResponse<Item>> {
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

    return QueryBuilderService.getPaginatedResults(this.itemRepository, 'item', options);
  }

  /**
   * Busca un artículo por identificador
   * @param id - UUID
   * @param relations - Relaciones opcionales
   * @returns Artículo o null
   */
  findById(id: string, relations?: string[]): Promise<Item | null> {
    this.logger.log(`Buscando artículo por id: ${id}`);
    return this.itemRepository.findOne({ where: { id }, relations });
  }

  /**
   * Actualiza un artículo
   * @param id - UUID
   * @param partial - Campos a actualizar
   * @returns Entidad actualizada
   */
  async updateById(id: string, partial: Partial<Item>): Promise<Item> {
    const existing = await this.itemRepository.findOne({ where: { id } });
    if (!existing) {
      this.logger.warn(`No existe el artículo ${id}`);
      throw new HttpException('Artículo no encontrado', HttpStatus.NOT_FOUND);
    }

    await this.itemRepository.save({ ...existing, ...partial });
    return this.findById(id, ['itemCategory']);
  }

  /**
   * Elimina un artículo por identificador
   * @param id - UUID
   * @returns Resultado del borrado
   */
  deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando artículo id: ${id}`);
    return this.itemRepository.delete(id);
  }
}
