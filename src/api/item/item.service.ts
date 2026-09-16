import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { DeleteResult } from 'typeorm';
import { ItemRepository } from 'src/entities/item/item-repository.service';
import { Item } from 'src/entities/item/item.entity';
import { ItemCategoryRepository } from 'src/entities/item-category/item-category-repository.service';
import { ItemCategory } from 'src/entities/item-category/item-category.entity';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { PermissionAction } from 'src/common/helpers/enterprise-permission/permission.catalog';

/**
 * Servicio de API de artículos.
 * El tenant no vive en `item`: se resuelve a través de `itemCategory.enterpriseId`.
 */
@Injectable()
export class ItemService {
  private readonly logger = new Logger(ItemService.name);

  constructor(
    private readonly itemRepository: ItemRepository,
    private readonly itemCategoryRepository: ItemCategoryRepository,
    private readonly enterpriseAccessService: EnterpriseAccessService,
  ) {}

  /**
   * Crea un artículo en una categoría de la empresa de la query.
   * @param item - Datos del artículo
   * @param expectedEnterpriseId - Empresa de la query (el Guard ya comprobó el vínculo)
   * @returns El artículo persistido
   */
  async create(item: Item, expectedEnterpriseId: string): Promise<Item> {
    this.logger.log(`Iniciando creación de artículo: ${item.name}`);
    this.logger.log(`Datos del artículo a crear:`, JSON.stringify(item, null, 2));

    const itemCategory = await this.resolveAccessibleItemCategory(
      item,
      'write',
      expectedEnterpriseId,
    );
    const payloadForPersistence = this.buildPersistencePayload(
      item,
      itemCategory.itemCategoryId,
      true,
    );

    try {
      const createdItem = await this.itemRepository.create(payloadForPersistence);
      this.logger.log(`Artículo creado exitosamente con ID: ${createdItem.id}`);
      return createdItem;
    } catch (error) {
      this.logger.error(`Error al crear el artículo ${item.name}:`, error);
      throw error;
    }
  }

  /**
   * Lista artículos con paginación. El controlador fuerza el filtro `itemCategory.enterpriseId`.
   * @param page - Número de página
   * @param pageSize - Tamaño de página
   * @param sort - Campo de ordenación
   * @param order - Dirección de ordenación
   * @param filter - Filtros (incluye el tenant anidado)
   * @param relations - Relaciones a incluir
   * @returns Página de artículos
   */
  async findAll(
    page: number,
    pageSize: number,
    sort: string,
    order: 'ASC' | 'DESC',
    filter: Record<string, unknown>,
    relations?: string[],
  ): Promise<PaginatedResponse<Item>> {
    this.logger.log(
      `Obteniendo artículos paginados - Página: ${page}, Tamaño: ${pageSize}, Ordenación: ${sort} ${order}`,
    );
    this.logger.log(`Filtros aplicados:`, JSON.stringify(filter, null, 2));

    if (relations && relations.length > 0) {
      this.logger.log(`Incluyendo relaciones: ${relations.join(', ')}`);
    }

    const result = await this.itemRepository.findAll(
      page,
      pageSize,
      sort,
      order,
      filter,
      relations,
    );
    this.logger.log(`Artículos obtenidos: ${result.items.length} de ${result.total}`);
    return result;
  }

  /**
   * Obtiene un artículo por identificador. Carga la categoría para resolver el tenant.
   * @param id - UUID del artículo
   * @param relations - Relaciones a incluir
   * @returns El artículo encontrado
   */
  async findById(id: string, relations?: string[]): Promise<Item> {
    this.logger.log(
      `Buscando artículo por ID: ${id}${relations ? ` con relaciones: [${relations.join(', ')}]` : ''}`,
    );

    const relationsWithItemCategory = this.enterpriseAccessService.mergeRelationNames(
      relations,
      ['itemCategory'],
    );
    const item = await this.itemRepository.findById(id, relationsWithItemCategory);

    if (!item) {
      this.logger.log(`No se encontró ningún artículo con ID: ${id}`);
      throw new HttpException('Artículo no encontrado', HttpStatus.NOT_FOUND);
    }

    this.assertItemAccessible(item, 'read');
    this.logger.log(`Artículo encontrado: ${item.name} (ID: ${item.id})`);
    return item;
  }

  /**
   * Actualiza un artículo. Revalida la categoría y congela el tenant de la categoría original.
   * @param id - UUID del artículo
   * @param item - Campos a actualizar
   * @returns El artículo actualizado
   */
  async updateById(id: string, item: Item): Promise<Item> {
    this.logger.log(`Iniciando actualización de artículo con ID: ${id}`);
    this.logger.log(`Datos a actualizar:`, JSON.stringify(item, null, 2));

    const existingItem = await this.itemRepository.findById(id, ['itemCategory']);
    if (!existingItem) {
      throw new HttpException('Artículo no encontrado', HttpStatus.NOT_FOUND);
    }
    this.assertItemAccessible(existingItem, 'write');

    const mergedItem = {
      ...existingItem,
      ...item,
      itemCategoryId: item.itemCategoryId ?? item.itemCategory?.id ?? existingItem.itemCategoryId,
    } as Item;

    const resolvedItemCategory = await this.resolveAccessibleItemCategory(
      mergedItem,
      'write',
      existingItem.itemCategory?.enterpriseId,
    );
    const payloadForPersistence = this.buildPersistencePayload(
      item,
      resolvedItemCategory.itemCategoryId,
      false,
    );

    try {
      const updatedItem = await this.itemRepository.updateById(id, payloadForPersistence);
      this.logger.log(`Artículo ${id} actualizado exitosamente`);
      return updatedItem;
    } catch (error) {
      this.logger.error(`Error al actualizar el artículo ${id}:`, error);
      throw error;
    }
  }

  /**
   * Elimina un artículo por identificador tras comprobar tenant y permiso.
   * @param id - UUID del artículo
   * @returns Resultado del borrado
   */
  async deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Iniciando eliminación de artículo con ID: ${id}`);

    const existingItem = await this.itemRepository.findById(id, ['itemCategory']);
    if (!existingItem) {
      throw new HttpException('Artículo no encontrado', HttpStatus.NOT_FOUND);
    }
    this.assertItemAccessible(existingItem, 'delete');

    try {
      const result = await this.itemRepository.deleteById(id);
      this.logger.log(`Artículo ${id} eliminado exitosamente. Filas afectadas: ${result.affected}`);
      return result;
    } catch (error) {
      this.logger.error(`Error al eliminar el artículo ${id}:`, error);
      throw error;
    }
  }

  /**
   * Carga las categorías referenciadas (`itemCategoryId` y `itemCategory.id`) y comprueba
   * que pertenecen a una única empresa accesible. Si se informa `expectedEnterpriseId`,
   * también exige que coincida (create: query; update: tenant original).
   * @param item - Artículo a persistir o ya fusionado
   * @param action - Acción del catálogo exigida
   * @param expectedEnterpriseId - Empresa que debe poseer la categoría
   * @returns Identificador de categoría canónico y su empresa
   */
  private async resolveAccessibleItemCategory(
    item: Item,
    action: PermissionAction,
    expectedEnterpriseId?: string,
  ): Promise<{ itemCategoryId: string; enterpriseId: string }> {
    const itemCategoryIds = this.collectUniqueIdentifiers(
      item.itemCategoryId,
      item.itemCategory?.id,
    );
    if (itemCategoryIds.length === 0) {
      this.logger.error('El artículo debe tener una categoría');
      throw new HttpException('El artículo debe tener una categoría', HttpStatus.BAD_REQUEST);
    }

    const categoryEnterpriseIds = new Set<string>();
    let canonicalItemCategoryId = itemCategoryIds[0];

    for (const itemCategoryId of itemCategoryIds) {
      const itemCategory = await this.loadItemCategoryOrThrow(itemCategoryId);
      this.enterpriseAccessService.assertCurrentEntityAccessible(
        itemCategory.enterpriseId,
        'Artículo no encontrado',
        { resource: 'items', action },
      );

      if (expectedEnterpriseId && itemCategory.enterpriseId !== expectedEnterpriseId) {
        this.logger.warn(
          `La categoría ${itemCategoryId} pertenece a la empresa ${itemCategory.enterpriseId}, no a ${expectedEnterpriseId}`,
        );
        throw new HttpException('Artículo no encontrado', HttpStatus.NOT_FOUND);
      }

      categoryEnterpriseIds.add(itemCategory.enterpriseId);
      canonicalItemCategoryId = itemCategoryId;
    }

    if (categoryEnterpriseIds.size !== 1) {
      this.logger.warn(
        `El artículo referencia categorías de empresas distintas: ${[...categoryEnterpriseIds].join(',')}`,
      );
      throw new HttpException('Artículo no encontrado', HttpStatus.NOT_FOUND);
    }

    return {
      itemCategoryId: canonicalItemCategoryId,
      enterpriseId: [...categoryEnterpriseIds][0],
    };
  }

  /**
   * Carga una categoría o lanza 404.
   * @param itemCategoryId - UUID de la categoría
   * @returns La categoría persistida
   */
  private async loadItemCategoryOrThrow(itemCategoryId: string): Promise<ItemCategory> {
    const itemCategory = await this.itemCategoryRepository.findById(itemCategoryId);
    if (!itemCategory) {
      this.logger.error(`Categoría de artículos no encontrada con ID: ${itemCategoryId}`);
      throw new HttpException('Artículo no encontrado', HttpStatus.NOT_FOUND);
    }
    return itemCategory;
  }

  /**
   * Comprueba tenant y permiso sobre el artículo a través de su categoría.
   * @param item - Artículo con relación `itemCategory` cargada
   * @param action - Acción del catálogo exigida
   */
  private assertItemAccessible(item: Item, action: PermissionAction): void {
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      item.itemCategory?.enterpriseId,
      'Artículo no encontrado',
      { resource: 'items', action },
    );
  }

  /**
   * Recoge identificadores únicos no vacíos (FK escalar y relación anidada).
   * @param identifierCandidates - UUID recibidos en `itemCategoryId` y en `itemCategory.id`
   * @returns Lista sin duplicados
   */
  private collectUniqueIdentifiers(
    ...identifierCandidates: Array<string | null | undefined>
  ): string[] {
    return [...new Set(
      identifierCandidates
        .map((identifier) => identifier?.trim())
        .filter((identifier): identifier is string => Boolean(identifier)),
    )];
  }

  /**
   * Construye el payload persistible: FK canónica, sin la relación anidada,
   * con defaults y restricciones comerciales aplicadas.
   * @param item - Cuerpo recibido
   * @param itemCategoryId - Categoría validada
   * @param applyCreateDefaults - Si es true, rellena precios y booleanos ausentes
   * @returns Partial listo para el repositorio
   */
  private buildPersistencePayload(
    item: Item,
    itemCategoryId: string,
    applyCreateDefaults: boolean,
  ): Partial<Item> {
    const payloadForPersistence = {
      ...item,
      itemCategoryId,
    } as Item;
    delete (payloadForPersistence as { itemCategory?: unknown }).itemCategory;
    this.applyItemCommercialDefaults(payloadForPersistence, applyCreateDefaults);
    this.normalizeItemCommercialFields(payloadForPersistence);
    return payloadForPersistence;
  }

  /**
   * Aplica los defaults de esquema: precios a 0 y booleanos comerciales a false.
   * En el alta también rellena campos omitidos. En actualización, `null` se
   * interpreta como default y los omitidos no se incluyen en el payload.
   * @param payloadForPersistence - Payload a mutar
   * @param applyCreateDefaults - Si deben aplicarse los defaults de creación
   */
  private applyItemCommercialDefaults(
    payloadForPersistence: Partial<Item>,
    applyCreateDefaults: boolean,
  ): void {
    this.assignResolvedCommercialField(
      payloadForPersistence,
      'pricePvp',
      this.resolveDefaultedNumericField(payloadForPersistence.pricePvp, applyCreateDefaults),
    );
    this.assignResolvedCommercialField(
      payloadForPersistence,
      'lastPurchasePrice',
      this.resolveDefaultedNumericField(
        payloadForPersistence.lastPurchasePrice,
        applyCreateDefaults,
      ),
    );
    this.assignResolvedCommercialField(
      payloadForPersistence,
      'serialNumber',
      this.resolveDefaultedBooleanField(
        payloadForPersistence.serialNumber,
        applyCreateDefaults,
      ),
    );
    this.assignResolvedCommercialField(
      payloadForPersistence,
      'stock',
      this.resolveDefaultedBooleanField(
        payloadForPersistence.stock,
        applyCreateDefaults,
      ),
    );
  }

  /**
   * Escribe un campo comercial resuelto o lo elimina si no debe persistirse.
   * @param payloadForPersistence - Payload a mutar
   * @param fieldName - Nombre del campo
   * @param resolvedValue - Valor a persistir, o undefined para omitirlo
   */
  private assignResolvedCommercialField<FieldName extends 'pricePvp' | 'lastPurchasePrice' | 'serialNumber' | 'stock'>(
    payloadForPersistence: Partial<Item>,
    fieldName: FieldName,
    resolvedValue: Item[FieldName] | undefined,
  ): void {
    if (resolvedValue === undefined) {
      delete payloadForPersistence[fieldName];
      return;
    }
    payloadForPersistence[fieldName] = resolvedValue;
  }

  /**
   * Resuelve un precio con default 0: omitido solo se rellena en alta; `null` siempre es 0.
   * @param fieldValue - Valor recibido
   * @param applyCreateDefaults - Si el omitido debe convertirse en 0
   * @returns El valor a persistir, o undefined si no debe incluirse
   */
  private resolveDefaultedNumericField(
    fieldValue: number | null | undefined,
    applyCreateDefaults: boolean,
  ): number | undefined {
    if (fieldValue === undefined) {
      return applyCreateDefaults ? 0 : undefined;
    }
    if (fieldValue === null) {
      return 0;
    }
    return fieldValue;
  }

  /**
   * Resuelve un booleano comercial con default false: omitido solo en alta; `null` es false.
   * @param fieldValue - Valor recibido
   * @param applyCreateDefaults - Si el omitido debe convertirse en false
   * @returns El valor a persistir, o undefined si no debe incluirse
   */
  private resolveDefaultedBooleanField(
    fieldValue: boolean | null | undefined,
    applyCreateDefaults: boolean,
  ): boolean | undefined {
    if (fieldValue === undefined) {
      return applyCreateDefaults ? false : undefined;
    }
    if (fieldValue === null) {
      return false;
    }
    return fieldValue;
  }

  /**
   * Valida y normaliza precios, indicadores booleanos y EAN cuando vienen informados.
   * @param payloadForPersistence - Payload a mutar
   */
  private normalizeItemCommercialFields(payloadForPersistence: Partial<Item>): void {
    if (payloadForPersistence.pricePvp !== undefined) {
      payloadForPersistence.pricePvp = this.parseNonNegativePrice(
        payloadForPersistence.pricePvp,
        'El precio PVP',
      );
    }
    if (payloadForPersistence.lastPurchasePrice !== undefined) {
      payloadForPersistence.lastPurchasePrice = this.parseNonNegativePrice(
        payloadForPersistence.lastPurchasePrice,
        'El último precio de compra',
      );
    }
    if (payloadForPersistence.serialNumber !== undefined) {
      payloadForPersistence.serialNumber = this.parseBooleanFlag(
        payloadForPersistence.serialNumber,
        'serialNumber',
        'El indicador de número de serie debe ser un valor booleano',
      );
    }
    if (payloadForPersistence.stock !== undefined) {
      payloadForPersistence.stock = this.parseBooleanFlag(
        payloadForPersistence.stock,
        'stock',
        'El indicador de stock debe ser un valor booleano',
      );
    }
    if (payloadForPersistence.ean !== undefined) {
      payloadForPersistence.ean = this.normalizeOptionalEan(payloadForPersistence.ean);
    }
  }

  /**
   * Convierte un precio a número finito mayor o igual que 0.
   * @param rawValue - Valor recibido en el cuerpo
   * @param fieldLabel - Etiqueta en español para el mensaje de error
   * @returns El precio normalizado
   */
  private parseNonNegativePrice(rawValue: unknown, fieldLabel: string): number {
    const numericValue = this.coerceNumericValue(rawValue);
    if (numericValue === null || numericValue < 0) {
      this.logger.error(`${fieldLabel} no es un número válido mayor o igual que 0: ${String(rawValue)}`);
      throw new HttpException(
        `${fieldLabel} debe ser un número mayor o igual que 0`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return numericValue;
  }

  /**
   * Interpreta un valor como número finito (number o string numérico).
   * @param rawValue - Valor recibido
   * @returns El número, o null si no es convertible
   */
  private coerceNumericValue(rawValue: unknown): number | null {
    if (typeof rawValue === 'number') {
      return Number.isFinite(rawValue) ? rawValue : null;
    }
    if (typeof rawValue === 'string' && rawValue.trim() !== '') {
      const parsedValue = Number(rawValue);
      return Number.isFinite(parsedValue) ? parsedValue : null;
    }
    return null;
  }

  /**
   * Normaliza un indicador booleano comercial (serie o stock).
   * @param rawValue - Valor recibido (ya no llega `null`; el default lo convierte en false)
   * @param fieldName - Nombre del campo para el log
   * @param errorMessage - Mensaje HTTP en español
   * @returns Booleano persistible
   */
  private parseBooleanFlag(
    rawValue: unknown,
    fieldName: string,
    errorMessage: string,
  ): boolean {
    if (typeof rawValue !== 'boolean') {
      this.logger.error(`${fieldName} no es booleano: ${String(rawValue)}`);
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
    return rawValue;
  }

  /**
   * Recorta el EAN y convierte vacío o nulo a null.
   * @param rawEan - Valor recibido
   * @returns EAN recortado o null
   */
  private normalizeOptionalEan(rawEan: unknown): string | null {
    if (rawEan === null) {
      return null;
    }
    if (typeof rawEan !== 'string') {
      this.logger.error(`EAN con tipo no válido: ${typeof rawEan}`);
      throw new HttpException(
        'El código EAN debe ser una cadena de texto',
        HttpStatus.BAD_REQUEST,
      );
    }
    const trimmedEan = rawEan.trim();
    return trimmedEan === '' ? null : trimmedEan;
  }
}
