import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeleteResult, Repository } from 'typeorm';
import { QueryBuilderService, QueryFilterOptions } from 'src/common/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { ItemCategory } from './item-category.entity';

/**
 * Repositorio de acceso a datos para categorías de artículos (`item_categories`).
 */
@Injectable()
export class ItemCategoryRepository {
  private readonly logger = new Logger(ItemCategoryRepository.name);

  constructor(
    @InjectRepository(ItemCategory)
    private readonly itemCategoryRepository: Repository<ItemCategory>,
  ) {}

  /**
   * Crea una categoría de artículos
   * @param entity - Datos de la categoría
   * @returns Categoría persistida
   */
  create(entity: Partial<ItemCategory>): Promise<ItemCategory> {
    this.logger.log(`Creando categoría de artículos: ${entity.name}`);
    return this.itemCategoryRepository.save(entity);
  }

  /**
   * Listado paginado de categorías de artículos
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
  ): Promise<PaginatedResponse<ItemCategory>> {
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
      this.itemCategoryRepository,
      'itemCategory',
      options,
    );
  }

  /**
   * Busca una categoría por identificador
   * @param id - UUID
   * @param relations - Relaciones opcionales
   * @returns Categoría o null
   */
  findById(id: string, relations?: string[]): Promise<ItemCategory | null> {
    this.logger.log(`Buscando categoría de artículos por id: ${id}`);
    return this.itemCategoryRepository.findOne({ where: { id }, relations });
  }

  /**
   * Actualiza una categoría de artículos
   * @param id - UUID
   * @param partial - Campos a actualizar
   * @returns Entidad actualizada
   */
  async updateById(id: string, partial: Partial<ItemCategory>): Promise<ItemCategory> {
    const existing = await this.itemCategoryRepository.findOne({ where: { id } });
    if (!existing) {
      this.logger.warn(`No existe la categoría de artículos ${id}`);
      throw new HttpException('Categoría de artículos no encontrada', HttpStatus.NOT_FOUND);
    }

    await this.itemCategoryRepository.save({ ...existing, ...partial });
    return this.findById(id, ['enterprise']);
  }

  /**
   * Elimina una categoría de artículos por identificador
   * @param id - UUID
   * @returns Resultado del borrado
   */
  deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando categoría de artículos id: ${id}`);
    return this.itemCategoryRepository.delete(id);
  }
}
