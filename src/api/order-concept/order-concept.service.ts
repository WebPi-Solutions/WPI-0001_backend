import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { DeleteResult } from 'typeorm';
import { OrderConceptRepository } from 'src/entities/order-concept/order-concept-repository.service';
import { OrderConcept } from 'src/entities/order-concept/order-concept.entity';
import { OrderRepository } from 'src/entities/order/order-repository.service';
import { Order } from 'src/entities/order/order.entity';
import { OrderStatus } from 'src/common/enums';
import { ItemRepository } from 'src/entities/item/item-repository.service';
import { Item } from 'src/entities/item/item.entity';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { PermissionAction } from 'src/common/helpers/enterprise-permission/permission.catalog';

/**
 * Servicio de API de líneas de pedido.
 * El tenant se resuelve a través de `order.client.enterpriseId`.
 * Las mutaciones solo se permiten si el pedido sigue pendiente de recepción.
 */
@Injectable()
export class OrderConceptService {
  private readonly logger = new Logger(OrderConceptService.name);

  constructor(
    private readonly orderConceptRepository: OrderConceptRepository,
    private readonly orderRepository: OrderRepository,
    private readonly itemRepository: ItemRepository,
    private readonly enterpriseAccessService: EnterpriseAccessService,
  ) {}

  /**
   * Crea una línea en un pedido de la empresa de la query.
   * @param orderConcept - Datos de la línea
   * @param expectedEnterpriseId - Empresa de la query
   * @returns La línea persistida
   */
  async create(
    orderConcept: OrderConcept,
    expectedEnterpriseId: string,
  ): Promise<OrderConcept> {
    this.logger.log('Iniciando creación de línea de pedido');
    const accessibleOrder = await this.resolveAccessibleOrder(
      orderConcept,
      'write',
      expectedEnterpriseId,
    );
    this.assertOrderIsAwaitingReceipt(accessibleOrder);

    const resolvedItem = await this.resolveOptionalAccessibleItem(
      orderConcept,
      accessibleOrder.client.enterpriseId,
    );
    const persistencePayload = await this.buildCreatePersistencePayload(
      orderConcept,
      accessibleOrder.id,
      resolvedItem,
    );

    try {
      const createdOrderConcept = await this.orderConceptRepository.create(persistencePayload);
      this.logger.log(`Línea de pedido creada con ID: ${createdOrderConcept.id}`);
      return createdOrderConcept;
    } catch (error) {
      this.logger.error('Error al crear la línea de pedido:', error);
      throw error;
    }
  }

  /**
   * Lista líneas con paginación. El controlador fuerza el filtro `client.enterpriseId`.
   * @param page - Número de página
   * @param pageSize - Tamaño de página
   * @param sort - Campo de ordenación
   * @param order - Dirección de ordenación
   * @param filter - Filtros (incluye el tenant anidado)
   * @param relations - Relaciones a incluir
   * @returns Página de líneas
   */
  async findAll(
    page: number,
    pageSize: number,
    sort: string,
    order: 'ASC' | 'DESC',
    filter: Record<string, unknown>,
    relations?: string[],
  ): Promise<PaginatedResponse<OrderConcept>> {
    this.logger.log(
      `Obteniendo líneas de pedido paginadas - Página: ${page}, Tamaño: ${pageSize}`,
    );
    const result = await this.orderConceptRepository.findAll(
      page,
      pageSize,
      sort,
      order,
      filter,
      relations,
    );
    this.logger.log(`Líneas obtenidas: ${result.items.length} de ${result.total}`);
    return result;
  }

  /**
   * Obtiene una línea por identificador. Carga pedido y cliente para resolver el tenant.
   * @param id - UUID de la línea
   * @param relations - Relaciones a incluir
   * @returns La línea encontrada
   */
  async findById(id: string, relations?: string[]): Promise<OrderConcept> {
    const relationsWithOrder = this.enterpriseAccessService.mergeRelationNames(
      relations,
      ['order', 'order.client'],
    );
    const orderConcept = await this.orderConceptRepository.findById(id, relationsWithOrder);
    if (!orderConcept) {
      this.logger.log(`No se encontró ninguna línea de pedido con ID: ${id}`);
      throw new HttpException('Concepto de pedido no encontrado', HttpStatus.NOT_FOUND);
    }

    this.assertOrderConceptAccessible(orderConcept, 'read');
    return orderConcept;
  }

  /**
   * Actualiza una línea. Congela `orderId` y exige pedido pendiente de recepción.
   * @param id - UUID de la línea
   * @param orderConcept - Campos a actualizar
   * @returns La línea actualizada
   */
  async updateById(id: string, orderConcept: OrderConcept): Promise<OrderConcept> {
    this.logger.log(`Iniciando actualización de línea de pedido con ID: ${id}`);
    const existingOrderConcept = await this.orderConceptRepository.findById(id, [
      'order',
      'order.client',
    ]);
    if (!existingOrderConcept) {
      throw new HttpException('Concepto de pedido no encontrado', HttpStatus.NOT_FOUND);
    }
    this.assertOrderConceptAccessible(existingOrderConcept, 'write');
    this.assertOrderIsAwaitingReceipt(existingOrderConcept.order);

    const resolvedItem = await this.resolveOptionalAccessibleItem(
      orderConcept,
      existingOrderConcept.order.client.enterpriseId,
    );
    const persistencePayload = this.buildUpdatePersistencePayload(
      orderConcept,
      existingOrderConcept,
      resolvedItem,
    );

    try {
      const updatedOrderConcept = await this.orderConceptRepository.updateById(
        id,
        persistencePayload,
      );
      this.logger.log(`Línea de pedido ${id} actualizada`);
      return updatedOrderConcept;
    } catch (error) {
      this.logger.error(`Error al actualizar la línea de pedido ${id}:`, error);
      throw error;
    }
  }

  /**
   * Elimina una línea si el pedido sigue pendiente de recepción.
   * @param id - UUID de la línea
   * @returns Resultado del borrado
   */
  async deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Iniciando eliminación de línea de pedido con ID: ${id}`);
    const existingOrderConcept = await this.orderConceptRepository.findById(id, [
      'order',
      'order.client',
    ]);
    if (!existingOrderConcept) {
      throw new HttpException('Concepto de pedido no encontrado', HttpStatus.NOT_FOUND);
    }
    this.assertOrderConceptAccessible(existingOrderConcept, 'delete');
    this.assertOrderIsAwaitingReceipt(existingOrderConcept.order);

    try {
      const result = await this.orderConceptRepository.deleteById(id);
      this.logger.log(`Línea de pedido ${id} eliminada. Filas afectadas: ${result.affected}`);
      return result;
    } catch (error) {
      this.logger.error(`Error al eliminar la línea de pedido ${id}:`, error);
      throw error;
    }
  }

  /**
   * Carga el pedido referenciado (`orderId` y `order.id`) y comprueba tenant y permiso.
   * @param orderConcept - Línea a persistir
   * @param action - Acción del catálogo
   * @param expectedEnterpriseId - Empresa de la query
   * @returns Pedido con `client` cargado
   */
  private async resolveAccessibleOrder(
    orderConcept: OrderConcept,
    action: PermissionAction,
    expectedEnterpriseId: string,
  ): Promise<Order> {
    const orderIds = this.collectUniqueIdentifiers(
      orderConcept.orderId,
      orderConcept.order?.id,
    );
    if (orderIds.length === 0) {
      this.logger.error('La línea de pedido debe tener un pedido');
      throw new HttpException(
        'El concepto debe pertenecer a un pedido',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (orderIds.length !== 1) {
      this.logger.warn(`La línea referencia pedidos distintos: ${orderIds.join(',')}`);
      throw new HttpException('Concepto de pedido no encontrado', HttpStatus.NOT_FOUND);
    }

    const order = await this.orderRepository.findById(orderIds[0], ['client']);
    if (!order) {
      this.logger.error(`Pedido no encontrado con ID: ${orderIds[0]}`);
      throw new HttpException('Concepto de pedido no encontrado', HttpStatus.NOT_FOUND);
    }

    this.enterpriseAccessService.assertCurrentEntityAccessible(
      order.client?.enterpriseId,
      'Concepto de pedido no encontrado',
      { resource: 'orders', action },
    );
    if (order.client.enterpriseId !== expectedEnterpriseId) {
      this.logger.warn(
        `El pedido ${order.id} pertenece a ${order.client.enterpriseId}, no a ${expectedEnterpriseId}`,
      );
      throw new HttpException('Concepto de pedido no encontrado', HttpStatus.NOT_FOUND);
    }
    return order;
  }

  /**
   * Carga el artículo opcional y comprueba que pertenece a la misma empresa que el pedido.
   * @param orderConcept - Línea fusionada o de alta
   * @param orderEnterpriseId - Empresa del pedido
   * @returns Artículo validado, o null si la línea es texto libre
   */
  private async resolveOptionalAccessibleItem(
    orderConcept: OrderConcept,
    orderEnterpriseId: string,
  ): Promise<Item | null> {
    const itemIds = this.collectUniqueIdentifiers(
      orderConcept.itemId,
      orderConcept.item?.id,
    );
    if (itemIds.length === 0) {
      return null;
    }
    if (itemIds.length !== 1) {
      this.logger.warn(`La línea referencia artículos distintos: ${itemIds.join(',')}`);
      throw new HttpException('Concepto de pedido no encontrado', HttpStatus.NOT_FOUND);
    }

    const item = await this.itemRepository.findById(itemIds[0], ['itemCategory']);
    if (!item) {
      this.logger.error(`Artículo no encontrado con ID: ${itemIds[0]}`);
      throw new HttpException('Concepto de pedido no encontrado', HttpStatus.NOT_FOUND);
    }
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      item.itemCategory?.enterpriseId,
      'Concepto de pedido no encontrado',
      { resource: 'orders', action: 'write' },
    );
    if (item.itemCategory.enterpriseId !== orderEnterpriseId) {
      this.logger.warn(
        `El artículo ${item.id} pertenece a ${item.itemCategory.enterpriseId}, no a ${orderEnterpriseId}`,
      );
      throw new HttpException('Concepto de pedido no encontrado', HttpStatus.NOT_FOUND);
    }
    return item;
  }

  /**
   * Impide mutar líneas de un pedido que ya no está pendiente de recepción.
   * @param order - Pedido propietario
   */
  private assertOrderIsAwaitingReceipt(order: Order): void {
    if (order.status !== OrderStatus.AWAITING_RECEIPT) {
      this.logger.error(
        `No se pueden modificar los conceptos del pedido ${order.id} porque ya no está pendiente de recepción`,
      );
      throw new HttpException(
        'No se pueden modificar los conceptos de un pedido que ya no está pendiente de recepción',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Comprueba tenant y permiso sobre la línea a través de su pedido.
   * @param orderConcept - Línea con `order.client` cargado
   * @param action - Acción del catálogo
   */
  private assertOrderConceptAccessible(
    orderConcept: OrderConcept,
    action: PermissionAction,
  ): void {
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      orderConcept.order?.client?.enterpriseId,
      'Concepto de pedido no encontrado',
      { resource: 'orders', action },
    );
  }

  /**
   * Construye el payload de alta: FK, posición, instantánea del artículo y defaults.
   * @param orderConcept - Cuerpo recibido
   * @param orderId - Pedido validado
   * @param resolvedItem - Artículo validado o null
   * @returns Partial listo para el repositorio
   */
  private async buildCreatePersistencePayload(
    orderConcept: OrderConcept,
    orderId: string,
    resolvedItem: Item | null,
  ): Promise<Partial<OrderConcept>> {
    const position = await this.resolveCreatePosition(orderConcept.position, orderId);
    const snapshotFields = this.buildSnapshotFields(orderConcept, resolvedItem, true);
    return {
      orderId,
      itemId: resolvedItem?.id ?? null,
      position,
      name: snapshotFields.name,
      basePrice: snapshotFields.basePrice,
      vat: snapshotFields.vat,
      irpf: snapshotFields.irpf,
      quantity: snapshotFields.quantity,
      ean: snapshotFields.ean,
    };
  }

  /**
   * Construye el payload de actualización. No reescribe `orderId`.
   * @param orderConcept - Cuerpo recibido
   * @param existingOrderConcept - Línea persistida
   * @param resolvedItem - Artículo validado o null
   * @returns Partial listo para el repositorio
   */
  private buildUpdatePersistencePayload(
    orderConcept: OrderConcept,
    existingOrderConcept: OrderConcept,
    resolvedItem: Item | null,
  ): Partial<OrderConcept> {
    const snapshotFields = this.buildSnapshotFields(orderConcept, resolvedItem, false);
    const persistencePayload: Partial<OrderConcept> = {};
    this.assignIfDefined(persistencePayload, 'itemId', this.resolveUpdateItemId(
      orderConcept,
      existingOrderConcept,
      resolvedItem,
    ));
    this.assignIfDefined(persistencePayload, 'position', this.resolveOptionalIntegerField(
      orderConcept.position,
      'La posición',
    ));
    this.assignIfDefined(persistencePayload, 'name', snapshotFields.name);
    this.assignIfDefined(persistencePayload, 'basePrice', snapshotFields.basePrice);
    this.assignIfDefined(persistencePayload, 'vat', snapshotFields.vat);
    this.assignIfDefined(persistencePayload, 'irpf', snapshotFields.irpf);
    this.assignIfDefined(persistencePayload, 'quantity', snapshotFields.quantity);
    if (orderConcept.ean !== undefined) {
      persistencePayload.ean = snapshotFields.ean ?? null;
    }
    return persistencePayload;
  }

  /**
   * Resuelve el `itemId` de una actualización: omitido conserva, null desvincula.
   * @param orderConcept - Cuerpo recibido
   * @param existingOrderConcept - Línea persistida
   * @param resolvedItem - Artículo validado o null
   * @returns UUID, null o undefined para no tocar el campo
   */
  private resolveUpdateItemId(
    orderConcept: OrderConcept,
    existingOrderConcept: OrderConcept,
    resolvedItem: Item | null,
  ): string | null | undefined {
    if (resolvedItem) {
      return resolvedItem.id;
    }
    if (orderConcept.itemId === null) {
      return null;
    }
    if (orderConcept.itemId === undefined && orderConcept.item === undefined) {
      return undefined;
    }
    return existingOrderConcept.itemId;
  }

  /**
   * Calcula la posición de alta: la informada o MAX+1.
   * @param requestedPosition - Posición del cuerpo
   * @param orderId - Pedido destino
   * @returns Posición persistible
   */
  private async resolveCreatePosition(
    requestedPosition: number | undefined,
    orderId: string,
  ): Promise<number> {
    if (requestedPosition !== undefined && requestedPosition !== null) {
      return this.parseNonNegativeInteger(requestedPosition, 'La posición');
    }
    const maxPosition = await this.orderConceptRepository.findMaxPositionByOrderId(orderId);
    return maxPosition === null ? 0 : maxPosition + 1;
  }

  /**
   * Compone nombre, precios e impuestos: instantánea del artículo si hay vínculo.
   * @param orderConcept - Cuerpo recibido
   * @param resolvedItem - Artículo validado o null
   * @param applyCreateDefaults - Si deben aplicarse defaults de alta
   * @returns Campos de instantánea
   */
  private buildSnapshotFields(
    orderConcept: OrderConcept,
    resolvedItem: Item | null,
    applyCreateDefaults: boolean,
  ): {
    name?: string;
    basePrice?: number;
    vat?: number;
    irpf?: number;
    quantity?: number;
    ean?: string | null;
  } {
    const resolvedName = this.resolveLineName(
      orderConcept.name,
      resolvedItem,
      applyCreateDefaults,
    );
    const resolvedBasePrice = this.resolveDefaultedNumericField(
      orderConcept.basePrice,
      resolvedItem?.pricePvp,
      applyCreateDefaults,
    );
    return {
      name: resolvedName,
      basePrice: resolvedBasePrice,
      vat: this.resolveDefaultedIntegerField(orderConcept.vat, 21, applyCreateDefaults),
      irpf: this.resolveDefaultedIntegerField(orderConcept.irpf, 0, applyCreateDefaults),
      quantity: this.resolveDefaultedIntegerField(
        orderConcept.quantity,
        1,
        applyCreateDefaults,
      ),
      ean: this.resolveLineEan(orderConcept.ean, resolvedItem, applyCreateDefaults),
    };
  }

  /**
   * Nombre de la línea: cuerpo, nombre del artículo o error si queda vacío en alta.
   * @param rawName - Nombre recibido
   * @param resolvedItem - Artículo de origen
   * @param applyCreateDefaults - Si el alta exige nombre
   * @returns Nombre recortado
   */
  private resolveLineName(
    rawName: string | undefined,
    resolvedItem: Item | null,
    applyCreateDefaults: boolean,
  ): string | undefined {
    if (rawName !== undefined && rawName !== null) {
      if (typeof rawName !== 'string') {
        throw new HttpException(
          'El nombre del concepto debe ser una cadena de texto',
          HttpStatus.BAD_REQUEST,
        );
      }
      const trimmedName = rawName.trim();
      if (trimmedName === '') {
        throw new HttpException(
          'El nombre del concepto no puede estar vacío',
          HttpStatus.BAD_REQUEST,
        );
      }
      return trimmedName;
    }
    if (resolvedItem && applyCreateDefaults) {
      return resolvedItem.name;
    }
    if (applyCreateDefaults) {
      throw new HttpException(
        'El concepto debe tener un nombre',
        HttpStatus.BAD_REQUEST,
      );
    }
    return undefined;
  }

  /**
   * EAN de la línea: cuerpo, EAN del artículo o null en alta.
   * @param rawEan - EAN recibido
   * @param resolvedItem - Artículo de origen
   * @param applyCreateDefaults - Si el omitido debe resolverse
   * @returns EAN recortado o null
   */
  private resolveLineEan(
    rawEan: string | null | undefined,
    resolvedItem: Item | null,
    applyCreateDefaults: boolean,
  ): string | null | undefined {
    if (rawEan !== undefined) {
      return this.normalizeOptionalEan(rawEan);
    }
    if (resolvedItem && applyCreateDefaults) {
      return resolvedItem.ean ?? null;
    }
    return applyCreateDefaults ? null : undefined;
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
      throw new HttpException(
        'El código EAN debe ser una cadena de texto',
        HttpStatus.BAD_REQUEST,
      );
    }
    const trimmedEan = rawEan.trim();
    return trimmedEan === '' ? null : trimmedEan;
  }

  /**
   * Precio: cuerpo, precio del artículo o 0 en alta.
   * @param fieldValue - Valor recibido
   * @param itemFallbackPrice - Precio PVP del artículo
   * @param applyCreateDefaults - Si el omitido debe convertirse en default
   * @returns Precio persistible
   */
  private resolveDefaultedNumericField(
    fieldValue: number | null | undefined,
    itemFallbackPrice: number | undefined,
    applyCreateDefaults: boolean,
  ): number | undefined {
    if (fieldValue === null) {
      return 0;
    }
    if (fieldValue !== undefined) {
      return this.parseNonNegativePrice(fieldValue, 'El precio base');
    }
    if (itemFallbackPrice !== undefined && applyCreateDefaults) {
      return this.parseNonNegativePrice(itemFallbackPrice, 'El precio base');
    }
    return applyCreateDefaults ? 0 : undefined;
  }

  /**
   * Entero con default de esquema: omitido solo se rellena en alta.
   * @param fieldValue - Valor recibido
   * @param defaultValue - Default de tabla
   * @param applyCreateDefaults - Si el omitido debe convertirse en default
   * @returns Entero persistible
   */
  private resolveDefaultedIntegerField(
    fieldValue: number | null | undefined,
    defaultValue: number,
    applyCreateDefaults: boolean,
  ): number | undefined {
    if (fieldValue === undefined) {
      return applyCreateDefaults ? defaultValue : undefined;
    }
    if (fieldValue === null) {
      return defaultValue;
    }
    const fieldLabel = defaultValue === 21 ? 'El IVA' : defaultValue === 1 ? 'La cantidad' : 'El IRPF';
    return this.parseNonNegativeInteger(fieldValue, fieldLabel);
  }

  /**
   * Interpreta un entero opcional en actualización; undefined no se toca.
   * @param fieldValue - Valor recibido
   * @param fieldLabel - Etiqueta para el error
   * @returns Entero o undefined
   */
  private resolveOptionalIntegerField(
    fieldValue: number | undefined,
    fieldLabel: string,
  ): number | undefined {
    if (fieldValue === undefined) {
      return undefined;
    }
    return this.parseNonNegativeInteger(fieldValue, fieldLabel);
  }

  /**
   * Convierte un precio a número finito mayor o igual que 0.
   * @param rawValue - Valor recibido
   * @param fieldLabel - Etiqueta en español
   * @returns El precio normalizado
   */
  private parseNonNegativePrice(rawValue: unknown, fieldLabel: string): number {
    const numericValue = this.coerceNumericValue(rawValue);
    if (numericValue === null || numericValue < 0) {
      this.logger.error(`${fieldLabel} no es un número válido ≥ 0: ${String(rawValue)}`);
      throw new HttpException(
        `${fieldLabel} debe ser un número mayor o igual que 0`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return numericValue;
  }

  /**
   * Convierte un entero a número ≥ 0 (redondea decimales).
   * @param rawValue - Valor recibido
   * @param fieldLabel - Etiqueta en español
   * @returns Entero normalizado
   */
  private parseNonNegativeInteger(rawValue: unknown, fieldLabel: string): number {
    const numericValue = this.coerceNumericValue(rawValue);
    if (numericValue === null || numericValue < 0) {
      this.logger.error(`${fieldLabel} no es un entero válido ≥ 0: ${String(rawValue)}`);
      throw new HttpException(
        `${fieldLabel} debe ser un número entero mayor o igual que 0`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return Math.round(numericValue);
  }

  /**
   * Interpreta un valor como número finito.
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
   * Escribe un campo si el valor no es undefined.
   * @param payload - Payload a mutar
   * @param fieldName - Nombre del campo
   * @param fieldValue - Valor o undefined
   */
  private assignIfDefined<FieldName extends keyof OrderConcept>(
    payload: Partial<OrderConcept>,
    fieldName: FieldName,
    fieldValue: OrderConcept[FieldName] | undefined,
  ): void {
    if (fieldValue === undefined) {
      return;
    }
    payload[fieldName] = fieldValue;
  }

  /**
   * Recoge identificadores únicos no vacíos.
   * @param identifierCandidates - UUID recibidos
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
}
