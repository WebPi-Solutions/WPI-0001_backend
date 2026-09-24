import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DeleteResult } from 'typeorm';
import { DEFAULT_ORDER_STATUS, isValidOrderStatus, OrderStatus } from 'src/common/enums';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { ClientRepository } from 'src/entities/client/client-repository.service';
import { Client } from 'src/entities/client/client.entity';
import { EnterpriseRepository } from 'src/entities/enterprise/enterprise-repository.service';
import { OrderRepository } from 'src/entities/order/order-repository.service';
import { Order } from 'src/entities/order/order.entity';
import { QuoteRepository } from 'src/entities/quote/quote-repository.service';
import { Quote } from 'src/entities/quote/quote.entity';
import { HtmlPdfService } from 'src/services/html-pdf/html-pdf.service';
import { Response } from 'express';

/**
 * Reglas de negocio de pedidos: tenant vía cliente, presupuesto de la misma empresa y datos persistentes.
 */
@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly clientRepository: ClientRepository,
    private readonly quoteRepository: QuoteRepository,
    private readonly enterpriseRepository: EnterpriseRepository,
    private readonly enterpriseAccessService: EnterpriseAccessService,
    private readonly htmlPdfService: HtmlPdfService,
  ) {}

  /**
   * Crea un nuevo pedido.
   *
   * @param order - Pedido a crear
   * @returns El pedido creado
   */
  async create(order: Order): Promise<Order> {
    this.logger.log('Iniciando proceso de creación de pedido');
    await this.assertOrderTenantAccessible(order);
    order.status = isValidOrderStatus(order.status) ? order.status : DEFAULT_ORDER_STATUS;
    order = await this.setOrderPersistentData(order);
    this.stripOrderConceptRelation(order);

    try {
      const createdOrder = await this.orderRepository.create(order);
      this.logger.log(`Pedido creado exitosamente con ID: ${createdOrder.id}`);
      return createdOrder;
    } catch (error) {
      this.logger.error('Error al crear pedido:', error);
      throw error;
    }
  }

  /**
   * Obtiene pedidos paginados con filtros y relaciones.
   *
   * @param page - Número de página
   * @param pageSize - Tamaño de página
   * @param sort - Campo de ordenación
   * @param orderDirection - Dirección de ordenación
   * @param filter - Filtros a aplicar
   * @param relations - Relaciones a incluir
   * @returns Pedidos paginados
   */
  async findAll(
    page: number,
    pageSize: number,
    sort: string,
    orderDirection: 'ASC' | 'DESC',
    filter: Record<string, any>,
    relations?: string[],
  ): Promise<PaginatedResponse<Order>> {
    this.logger.log(
      `Obteniendo pedidos paginados - Página: ${page}, Tamaño: ${pageSize}, Ordenación: ${sort} ${orderDirection}`,
    );
    const result = await this.orderRepository.findAll(
      page,
      pageSize,
      sort,
      orderDirection,
      filter,
      relations,
    );
    this.logger.log(`Pedidos obtenidos: ${result.items.length} de ${result.total}`);
    return result;
  }

  /**
   * Obtiene un pedido por su identificador.
   *
   * @param id - UUID del pedido
   * @param relations - Relaciones a incluir
   * @returns El pedido encontrado
   */
  async findById(id: string, relations?: string[]): Promise<Order> {
    this.logger.log(`Buscando pedido por ID: ${id}`);
    const relationsWithClient = this.enterpriseAccessService.mergeRelationNames(relations, [
      'client',
      'orderConcepts',
    ]);
    const order = await this.orderRepository.findById(id, relationsWithClient);

    if (!order) {
      this.logger.log(`No se encontró ningún pedido con ID: ${id}`);
      throw new HttpException(`Pedido con ID: ${id} no encontrado`, HttpStatus.NOT_FOUND);
    }

    this.assertOrderAccessible(order, 'read');
    return order;
  }

  /**
   * Genera y devuelve el PDF del pedido usando la plantilla HTML de su empresa.
   *
   * @param id Identificador del pedido
   * @param response Respuesta HTTP donde se adjunta el documento
   * @returns Nada; el archivo se escribe directamente en la respuesta
   */
  async downloadDocumentById(id: string, response: Response): Promise<void> {
    const order = await this.orderRepository.findById(id, ['client', 'orderConcepts']);
    if (!order) {
      throw new HttpException(`Pedido con ID: ${id} no encontrado`, HttpStatus.NOT_FOUND);
    }
    this.assertOrderAccessible(order, 'read');

    const enterprise = await this.enterpriseRepository.findById(order.client.enterpriseId);
    if (!enterprise) {
      throw new HttpException('Pedido no encontrado', HttpStatus.NOT_FOUND);
    }

    const document = await this.htmlPdfService.generateOrderPdf(
      this.orderRepository.getHtmlTemplateFilePath(enterprise.id),
      order,
      enterprise,
    );
    const fileName = this.sanitizeDocumentFileName(order.name);
    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Content-Length': document.length.toString(),
    });
    response.send(document);
  }

  /**
   * Actualiza un pedido por su identificador.
   *
   * @param id - UUID del pedido
   * @param order - Datos a fusionar
   * @returns El pedido actualizado
   */
  async updateById(id: string, order: Order): Promise<Order> {
    this.logger.log(`Iniciando actualización de pedido con ID: ${id}`);
    const orderToUpdate = await this.orderRepository.findById(id, ['client']);

    if (!orderToUpdate) {
      this.logger.error(`Pedido no encontrado con ID: ${id}`);
      throw new HttpException('Pedido no encontrado', HttpStatus.NOT_FOUND);
    }

    this.assertOrderAccessible(orderToUpdate, 'write');

    order = {
      ...orderToUpdate,
      ...order,
    };
    await this.assertOrderTenantAccessible(order);
    order = await this.setOrderPersistentData(order);
    this.stripOrderConceptRelation(order);

    try {
      const updatedOrder = await this.orderRepository.updateById(id, order);
      this.logger.log(`Pedido ${id} actualizado exitosamente`);
      return updatedOrder;
    } catch (error) {
      this.logger.error(`Error al actualizar pedido ${id}:`, error);
      throw error;
    }
  }

  /**
   * Actualiza únicamente el estado de un pedido.
   *
   * @param id - UUID del pedido
   * @param status - Nuevo estado
   * @returns El pedido actualizado
   */
  async updateStatusById(id: string, status: OrderStatus): Promise<Order> {
    this.logger.log(`Iniciando actualización del estado del pedido con ID: ${id}`);
    if (!isValidOrderStatus(status)) {
      this.logger.error(`El estado del pedido no es válido: ${status}`);
      throw new HttpException(
        `El estado del pedido no es válido: ${status}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const orderToUpdate = await this.orderRepository.findById(id, ['client']);
    if (!orderToUpdate) {
      this.logger.error(`Pedido no encontrado con ID: ${id}`);
      throw new HttpException(`Pedido no encontrado con ID: ${id}`, HttpStatus.NOT_FOUND);
    }

    this.assertOrderAccessible(orderToUpdate, 'write');
    return this.orderRepository.updateById(id, { ...orderToUpdate, status });
  }

  /**
   * Elimina un pedido por su identificador.
   * Solo se pueden borrar pedidos pendientes de recepción.
   *
   * @param id - UUID del pedido
   * @returns Resultado de la eliminación
   */
  async deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Iniciando eliminación de pedido con ID: ${id}`);
    const order = await this.orderRepository.findById(id, ['client']);
    if (!order) {
      this.logger.error(`Pedido con ID ${id} no encontrado`);
      throw new HttpException(`Pedido con ID ${id} no encontrado`, HttpStatus.NOT_FOUND);
    }

    this.assertOrderAccessible(order, 'delete');

    if (order.status !== OrderStatus.AWAITING_RECEIPT) {
      this.logger.error(`No se puede eliminar el pedido ${id} porque ya no está pendiente de recepción`);
      throw new HttpException(
        `No se puede eliminar el pedido ${id} porque ya no está pendiente de recepción`,
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const result = await this.orderRepository.deleteById(id);
      this.logger.log(`Pedido ${id} eliminado exitosamente. Filas afectadas: ${result.affected}`);
      return result;
    } catch (error) {
      this.logger.error(`Error al eliminar pedido ${id}:`, error);
      throw error;
    }
  }

  /**
   * Copia en el pedido los datos de cliente y emisor vigentes.
   *
   * @param order - Pedido a completar
   * @returns El pedido con la instantánea de cliente y emisor
   */
  async setOrderPersistentData(order: Order): Promise<Order> {
    const clientId = order.clientId?.trim();
    if (!clientId) {
      this.logger.error('El pedido debe tener un cliente');
      throw new HttpException('El pedido debe tener un cliente', HttpStatus.BAD_REQUEST);
    }

    const client = await this.clientRepository.findById(clientId);
    if (!client) {
      this.logger.error(`Cliente no encontrado con ID: ${clientId}`);
      throw new HttpException(`Cliente no encontrado con ID: ${clientId}`, HttpStatus.NOT_FOUND);
    }

    order.clientName = client.name;
    order.clientNif = client.nif;
    if (client.address) {
      order.clientAddress = client.address;
    }

    const enterprise = await this.enterpriseRepository.findById(client.enterpriseId);
    if (!enterprise) {
      this.logger.error(`Empresa no encontrada con ID: ${client.enterpriseId}`);
      throw new HttpException(
        `Empresa no encontrada con ID: ${client.enterpriseId}`,
        HttpStatus.NOT_FOUND,
      );
    }

    order.issuerName = enterprise.name;
    order.issuerNif = enterprise.nif;
    if (enterprise.address) {
      order.issuerAddress = enterprise.address;
    }

    return order;
  }

  /**
   * Quita la colección de líneas del payload de pedido: se persisten por `/order-concepts`.
   * @param order - Pedido a persistir
   */
  private stripOrderConceptRelation(order: Order): void {
    delete (order as { orderConcepts?: unknown }).orderConcepts;
  }

  /** Sanitiza el nombre del adjunto para los encabezados HTTP. */
  private sanitizeDocumentFileName(orderName: string | null | undefined): string {
    const baseName = (orderName ?? 'pedido')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/[^\x20-\x7E]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 100) || 'pedido';
    return `${baseName}.pdf`;
  }

  /**
   * Recoge identificadores únicos no vacíos (FK escalar y relación anidada).
   *
   * @param identifierCandidates - UUID recibidos
   * @returns Lista sin duplicados
   */
  private collectUniqueIdentifiers(
    ...identifierCandidates: Array<string | null | undefined>
  ): string[] {
    return [
      ...new Set(
        identifierCandidates
          .map((identifier) => identifier?.trim())
          .filter((identifier): identifier is string => Boolean(identifier)),
      ),
    ];
  }

  /**
   * Comprueba que cliente y presupuesto son accesibles y pertenecen a la misma empresa.
   * El presupuesto debe corresponder al cliente del pedido.
   *
   * @param order - Pedido a persistir
   */
  private async assertOrderTenantAccessible(order: Order): Promise<void> {
    const clientIds = this.collectUniqueIdentifiers(order.clientId, order.client?.id);
    if (clientIds.length === 0) {
      this.logger.error('El pedido debe tener un cliente');
      throw new HttpException('El pedido debe tener un cliente', HttpStatus.BAD_REQUEST);
    }

    const quoteIds = this.collectUniqueIdentifiers(order.quoteId, order.quote?.id);
    if (quoteIds.length === 0) {
      this.logger.error('El pedido debe tener un presupuesto');
      throw new HttpException('El pedido debe tener un presupuesto', HttpStatus.BAD_REQUEST);
    }

    const resolvedClients: Client[] = [];
    const clientEnterpriseIds = new Set<string>();
    for (const clientId of clientIds) {
      const client = await this.clientRepository.findById(clientId);
      if (!client) {
        this.logger.error(`Cliente no encontrado con ID: ${clientId}`);
        throw new HttpException(`Cliente no encontrado con ID: ${clientId}`, HttpStatus.NOT_FOUND);
      }
      this.enterpriseAccessService.assertCurrentEntityAccessible(
        client.enterpriseId,
        'Pedido no encontrado',
        { resource: 'orders', action: 'write' },
      );
      clientEnterpriseIds.add(client.enterpriseId);
      resolvedClients.push(client);
    }

    if (clientEnterpriseIds.size !== 1) {
      this.logger.warn(
        `El pedido referencia clientes de empresas distintas: ${[...clientEnterpriseIds].join(',')}`,
      );
      throw new HttpException('Pedido no encontrado', HttpStatus.NOT_FOUND);
    }

    const resolvedQuotes: Quote[] = [];
    for (const quoteId of quoteIds) {
      const quote = await this.quoteRepository.findById(quoteId, ['client']);
      if (!quote) {
        this.logger.error(`Presupuesto no encontrado con ID: ${quoteId}`);
        throw new HttpException(`Presupuesto no encontrado con ID: ${quoteId}`, HttpStatus.NOT_FOUND);
      }
      this.enterpriseAccessService.assertCurrentEntityAccessible(
        quote.client?.enterpriseId,
        'Pedido no encontrado',
        { resource: 'orders', action: 'write' },
      );
      resolvedQuotes.push(quote);
    }

    const canonicalClientId = resolvedClients[0].id;
    for (const quote of resolvedQuotes) {
      if (quote.clientId !== canonicalClientId) {
        this.logger.error(
          `El presupuesto ${quote.id} no pertenece al cliente ${canonicalClientId} del pedido`,
        );
        throw new HttpException(
          'El presupuesto no pertenece al cliente del pedido',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    order.clientId = canonicalClientId;
    order.quoteId = resolvedQuotes[0].id;
  }

  /**
   * Comprueba tenant y permiso sobre el pedido.
   *
   * @param order - Pedido con relación `client` cargada
   * @param action - Acción del catálogo exigida
   */
  private assertOrderAccessible(order: Order, action: 'read' | 'write' | 'delete'): void {
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      order.client?.enterpriseId,
      `Pedido con ID: ${order.id} no encontrado`,
      { resource: 'orders', action },
    );
  }
}
