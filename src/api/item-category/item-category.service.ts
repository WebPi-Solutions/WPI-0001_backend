import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { DeleteResult } from 'typeorm';
import { ItemCategoryRepository } from 'src/entities/item-category/item-category-repository.service';
import { ItemCategory } from 'src/entities/item-category/item-category.entity';
import { ItemRepository } from 'src/entities/item/item-repository.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { PermissionAction } from 'src/common/helpers/enterprise-permission/permission.catalog';

/**
 * Servicio de API de categorías de artículos.
 * Aísla por `enterpriseId` y exige el permiso de catálogo `itemCategories`.
 */
@Injectable()
export class ItemCategoryService {
  private readonly logger = new Logger(ItemCategoryService.name);

  constructor(
    private readonly itemCategoryRepository: ItemCategoryRepository,
    private readonly itemRepository: ItemRepository,
    private readonly enterpriseAccessService: EnterpriseAccessService,
  ) {}

  /**
   * Crea una categoría de artículos en la empresa indicada por el controlador.
   * @param itemCategory - Datos de la categoría (el `enterpriseId` ya viene pisado por la query)
   * @returns La categoría persistida
   */
  async create(itemCategory: ItemCategory): Promise<ItemCategory> {
    this.logger.log(`Iniciando creación de categoría de artículos: ${itemCategory.name}`);
    this.stripNestedEnterprise(itemCategory);

    try {
      const createdItemCategory = await this.itemCategoryRepository.create(itemCategory);
      this.logger.log(`Categoría de artículos creada con ID: ${createdItemCategory.id}`);
      return createdItemCategory;
    } catch (error) {
      this.logger.error(`Error al crear la categoría de artículos ${itemCategory.name}:`, error);
      throw error;
    }
  }

  /**
   * Lista categorías de artículos con paginación, filtros y ordenación.
   * @param page - Número de página
   * @param pageSize - Tamaño de página
   * @param sort - Campo de ordenación
   * @param order - Dirección de ordenación
   * @param filter - Filtros (debe incluir `enterpriseId` forzado por el controlador)
   * @param relations - Relaciones a incluir
   * @returns Página de categorías
   */
  async findAll(
    page: number,
    pageSize: number,
    sort: string,
    order: 'ASC' | 'DESC',
    filter: Record<string, unknown>,
    relations?: string[],
  ): Promise<PaginatedResponse<ItemCategory>> {
    this.logger.log(
      `Obteniendo categorías de artículos paginadas - Página: ${page}, Tamaño: ${pageSize}, Ordenación: ${sort} ${order}`,
    );
    this.logger.log(`Filtros aplicados:`, JSON.stringify(filter, null, 2));

    if (relations && relations.length > 0) {
      this.logger.log(`Incluyendo relaciones: ${relations.join(', ')}`);
    }

    const result = await this.itemCategoryRepository.findAll(
      page,
      pageSize,
      sort,
      order,
      filter,
      relations,
    );
    this.logger.log(`Categorías de artículos obtenidas: ${result.items.length} de ${result.total}`);
    return result;
  }

  /**
   * Obtiene una categoría por identificador y comprueba tenant + permiso de lectura.
   * @param id - UUID de la categoría
   * @param relations - Relaciones a incluir
   * @returns La categoría encontrada
   */
  async findById(id: string, relations?: string[]): Promise<ItemCategory> {
    this.logger.log(
      `Buscando categoría de artículos por ID: ${id}${relations ? ` con relaciones: [${relations.join(', ')}]` : ''}`,
    );

    const itemCategory = await this.itemCategoryRepository.findById(id, relations);
    if (!itemCategory) {
      this.logger.log(`No se encontró ninguna categoría de artículos con ID: ${id}`);
      throw new HttpException('Categoría de artículos no encontrada', HttpStatus.NOT_FOUND);
    }

    this.assertItemCategoryAccessible(itemCategory, 'read');
    this.logger.log(`Categoría de artículos encontrada: ${itemCategory.name} (ID: ${itemCategory.id})`);
    return itemCategory;
  }

  /**
   * Actualiza una categoría. Congela el `enterpriseId` para impedir relocatar el tenant.
   * @param id - UUID de la categoría
   * @param itemCategory - Campos a actualizar
   * @returns La categoría actualizada
   */
  async updateById(id: string, itemCategory: ItemCategory): Promise<ItemCategory> {
    this.logger.log(`Iniciando actualización de categoría de artículos con ID: ${id}`);
    this.logger.log(`Datos a actualizar:`, JSON.stringify(itemCategory, null, 2));

    const existingItemCategory = await this.itemCategoryRepository.findById(id);
    if (!existingItemCategory) {
      throw new HttpException('Categoría de artículos no encontrada', HttpStatus.NOT_FOUND);
    }
    this.assertItemCategoryAccessible(existingItemCategory, 'write');

    const payloadForPersistence = {
      ...itemCategory,
      enterpriseId: existingItemCategory.enterpriseId,
    } as ItemCategory;
    this.stripNestedEnterprise(payloadForPersistence);

    try {
      const updatedItemCategory = await this.itemCategoryRepository.updateById(
        id,
        payloadForPersistence,
      );
      this.logger.log(`Categoría de artículos ${id} actualizada exitosamente`);
      return updatedItemCategory;
    } catch (error) {
      this.logger.error(`Error al actualizar la categoría de artículos ${id}:`, error);
      throw error;
    }
  }

  /**
   * Elimina una categoría si no tiene artículos asociados.
   * @param id - UUID de la categoría
   * @returns Resultado del borrado
   */
  async deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Iniciando eliminación de categoría de artículos con ID: ${id}`);

    const existingItemCategory = await this.itemCategoryRepository.findById(id);
    if (!existingItemCategory) {
      throw new HttpException('Categoría de artículos no encontrada', HttpStatus.NOT_FOUND);
    }
    this.assertItemCategoryAccessible(existingItemCategory, 'delete');

    const associatedItems = await this.itemRepository.findAll(1, 1, 'name', 'ASC', {
      itemCategoryId: id,
    });
    if (associatedItems.total > 0) {
      this.logger.error(
        `No se puede eliminar la categoría ${id} porque tiene artículos asociados`,
      );
      throw new HttpException(
        'No se puede eliminar la categoría de artículos porque tiene artículos asociados',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const result = await this.itemCategoryRepository.deleteById(id);
      this.logger.log(
        `Categoría de artículos ${id} eliminada exitosamente. Filas afectadas: ${result.affected}`,
      );
      return result;
    } catch (error) {
      this.logger.error(`Error al eliminar la categoría de artículos ${id}:`, error);
      throw error;
    }
  }

  /**
   * Comprueba tenant y permiso sobre la categoría.
   * @param itemCategory - Categoría con `enterpriseId`
   * @param action - Acción del catálogo exigida
   */
  private assertItemCategoryAccessible(
    itemCategory: ItemCategory,
    action: PermissionAction,
  ): void {
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      itemCategory.enterpriseId,
      'Categoría de artículos no encontrada',
      { resource: 'itemCategories', action },
    );
  }

  /**
   * Impide persistir la relación anidada `enterprise` enviada en el cuerpo.
   * @param itemCategory - Payload a sanitizar
   */
  private stripNestedEnterprise(itemCategory: ItemCategory): void {
    delete (itemCategory as { enterprise?: unknown }).enterprise;
  }
}
