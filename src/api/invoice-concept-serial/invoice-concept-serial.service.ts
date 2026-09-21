import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { DeleteResult } from 'typeorm';
import { InvoiceConceptSerialRepository } from 'src/entities/invoice-concept-serial/invoice-concept-serial-repository.service';
import { InvoiceConceptSerial } from 'src/entities/invoice-concept-serial/invoice-concept-serial.entity';
import { InvoiceConceptRepository } from 'src/entities/invoice-concept/invoice-concept-repository.service';
import { InvoiceConcept } from 'src/entities/invoice-concept/invoice-concept.entity';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { PermissionAction } from 'src/common/helpers/enterprise-permission/permission.catalog';
import { InventoryLedgerService } from 'src/common/helpers/inventory/inventory-ledger.service';

import { InvoiceStatus } from 'src/common/enums';

/**
 * Servicio de API de números de serie de línea de factura.
 * El tenant se resuelve a través de la línea → factura → cliente.
 * Las mutaciones solo se permiten si la factura sigue en borrador.
 * La venta reserva una unidad ya existente en stock.
 */
@Injectable()
export class InvoiceConceptSerialService {
  private readonly logger = new Logger(InvoiceConceptSerialService.name);

  constructor(
    private readonly invoiceConceptSerialRepository: InvoiceConceptSerialRepository,
    private readonly invoiceConceptRepository: InvoiceConceptRepository,
    private readonly enterpriseAccessService: EnterpriseAccessService,
    private readonly inventoryLedgerService: InventoryLedgerService,
  ) {}

  /**
   * Crea un número de serie en una línea de la empresa de la query.
   * @param invoiceConceptSerial - Datos del número de serie
   * @param expectedEnterpriseId - Empresa de la query
   * @returns El registro persistido
   */
  async create(
    invoiceConceptSerial: InvoiceConceptSerial,
    expectedEnterpriseId: string,
  ): Promise<InvoiceConceptSerial> {
    this.logger.log('Iniciando creación de número de serie de línea');
    const accessibleInvoiceConcept = await this.resolveAccessibleInvoiceConcept(
      invoiceConceptSerial,
      'write',
      expectedEnterpriseId,
    );
    this.assertInvoiceIsDraft(accessibleInvoiceConcept);
    this.assertLineAllowsSerialNumbers(accessibleInvoiceConcept);
    await this.assertSerialCountWithinQuantity(accessibleInvoiceConcept);

    const availableItemSerial = await this.inventoryLedgerService.resolveAvailableSaleSerial(
      accessibleInvoiceConcept.item,
      invoiceConceptSerial.itemSerialId,
      invoiceConceptSerial.serialNumber,
    );
    const reservedItemSerial = await this.inventoryLedgerService.reserveSaleSerial(
      accessibleInvoiceConcept.item,
      availableItemSerial.id,
    );

    const persistencePayload: Partial<InvoiceConceptSerial> = {
      invoiceConceptId: accessibleInvoiceConcept.id,
      itemSerialId: reservedItemSerial.id,
      serialNumber: reservedItemSerial.serialNumber,
    };

    try {
      const createdSerial = await this.invoiceConceptSerialRepository.create(
        persistencePayload,
      );
      this.logger.log(`Número de serie de línea creado con ID: ${createdSerial.id}`);
      return createdSerial;
    } catch (error) {
      this.logger.error('Error al crear el número de serie de línea:', error);
      throw error;
    }
  }

  /**
   * Lista números de serie. El controlador fuerza `invoiceConceptId` y el tenant.
   * @param page - Número de página
   * @param pageSize - Tamaño de página
   * @param sort - Campo de ordenación
   * @param order - Dirección de ordenación
   * @param filter - Filtros
   * @param relations - Relaciones a incluir
   * @returns Página de números de serie
   */
  async findAll(
    page: number,
    pageSize: number,
    sort: string,
    order: 'ASC' | 'DESC',
    filter: Record<string, unknown>,
    relations?: string[],
  ): Promise<PaginatedResponse<InvoiceConceptSerial>> {
    this.logger.log(
      `Obteniendo números de serie de línea - Página: ${page}, Tamaño: ${pageSize}`,
    );
    const result = await this.invoiceConceptSerialRepository.findAll(
      page,
      pageSize,
      sort,
      order,
      filter,
      relations,
    );
    this.logger.log(`Números de serie obtenidos: ${result.items.length} de ${result.total}`);
    return result;
  }

  /**
   * Obtiene un número de serie por identificador.
   * @param id - UUID
   * @param relations - Relaciones a incluir
   * @returns El registro encontrado
   */
  async findById(id: string, relations?: string[]): Promise<InvoiceConceptSerial> {
    const relationsWithConcept = this.enterpriseAccessService.mergeRelationNames(
      relations,
      ['invoiceConcept', 'invoiceConcept.invoice', 'invoiceConcept.invoice.client'],
    );
    const invoiceConceptSerial = await this.invoiceConceptSerialRepository.findById(
      id,
      relationsWithConcept,
    );
    if (!invoiceConceptSerial) {
      this.logger.log(`No se encontró ningún número de serie de línea con ID: ${id}`);
      throw new HttpException(
        'Número de serie de concepto no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    this.assertSerialAccessible(invoiceConceptSerial, 'read');
    return invoiceConceptSerial;
  }

  /**
   * Actualiza un número de serie. Congela `invoiceConceptId`.
   * @param id - UUID
   * @param invoiceConceptSerial - Campos a actualizar
   * @returns El registro actualizado
   */
  async updateById(
    id: string,
    invoiceConceptSerial: InvoiceConceptSerial,
  ): Promise<InvoiceConceptSerial> {
    this.logger.log(`Iniciando actualización de número de serie de línea con ID: ${id}`);
    const existingSerial = await this.invoiceConceptSerialRepository.findById(id, [
      'invoiceConcept',
      'invoiceConcept.invoice',
      'invoiceConcept.invoice.client',
      'invoiceConcept.item',
      'itemSerial',
    ]);
    if (!existingSerial) {
      throw new HttpException(
        'Número de serie de concepto no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    this.assertSerialAccessible(existingSerial, 'write');
    this.assertInvoiceIsDraft(existingSerial.invoiceConcept);

    const persistencePayload: Partial<InvoiceConceptSerial> = {};
    const nextItemSerialId =
      invoiceConceptSerial.itemSerialId ?? invoiceConceptSerial.itemSerial?.id;
    const shouldReplaceSerial =
      nextItemSerialId !== undefined || invoiceConceptSerial.serialNumber !== undefined;
    if (shouldReplaceSerial) {
      const availableItemSerial = await this.inventoryLedgerService.resolveAvailableSaleSerial(
        existingSerial.invoiceConcept.item,
        nextItemSerialId,
        invoiceConceptSerial.serialNumber,
      );
      const reservedItemSerial = await this.inventoryLedgerService.replaceReservedSaleSerial(
        existingSerial.invoiceConcept.item,
        existingSerial.itemSerial,
        availableItemSerial.id,
      );
      persistencePayload.itemSerialId = reservedItemSerial.id;
      persistencePayload.serialNumber = reservedItemSerial.serialNumber;
    }

    try {
      const updatedSerial = await this.invoiceConceptSerialRepository.updateById(
        id,
        persistencePayload,
      );
      this.logger.log(`Número de serie de línea ${id} actualizado`);
      return updatedSerial;
    } catch (error) {
      this.logger.error(`Error al actualizar el número de serie de línea ${id}:`, error);
      throw error;
    }
  }

  /**
   * Elimina un número de serie si la factura sigue en borrador.
   * @param id - UUID
   * @returns Resultado del borrado
   */
  async deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Iniciando eliminación de número de serie de línea con ID: ${id}`);
    const existingSerial = await this.invoiceConceptSerialRepository.findById(id, [
      'invoiceConcept',
      'invoiceConcept.invoice',
      'invoiceConcept.invoice.client',
      'itemSerial',
    ]);
    if (!existingSerial) {
      throw new HttpException(
        'Número de serie de concepto no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    this.assertSerialAccessible(existingSerial, 'delete');
    this.assertInvoiceIsDraft(existingSerial.invoiceConcept);

    try {
      if (existingSerial.itemSerial) {
        await this.inventoryLedgerService.releaseReservedSaleSerial(existingSerial.itemSerial);
      }
      const result = await this.invoiceConceptSerialRepository.deleteById(id);
      this.logger.log(
        `Número de serie de línea ${id} eliminado. Filas afectadas: ${result.affected}`,
      );
      return result;
    } catch (error) {
      this.logger.error(`Error al eliminar el número de serie de línea ${id}:`, error);
      throw error;
    }
  }

  /**
   * Comprueba que la línea del listado existe y pertenece a la empresa de la query.
   * Evita listar números de serie de otra empresa conociendo el UUID de la línea.
   * @param invoiceConceptId - UUID de la línea
   * @param expectedEnterpriseId - Empresa de la query
   */
  async assertInvoiceConceptAccessibleForList(
    invoiceConceptId: string,
    expectedEnterpriseId: string,
  ): Promise<void> {
    const invoiceConcept = await this.invoiceConceptRepository.findById(invoiceConceptId, [
      'invoice',
      'invoice.client',
    ]);
    if (!invoiceConcept) {
      throw new HttpException(
        'Número de serie de concepto no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      invoiceConcept.invoice?.client?.enterpriseId,
      'Número de serie de concepto no encontrado',
      { resource: 'invoices', action: 'read' },
    );
    if (invoiceConcept.invoice.client.enterpriseId !== expectedEnterpriseId) {
      throw new HttpException(
        'Número de serie de concepto no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  /**
   * Carga la línea referenciada y comprueba tenant, permiso y empresa de la query.
   * @param invoiceConceptSerial - Registro a persistir
   * @param action - Acción del catálogo
   * @param expectedEnterpriseId - Empresa de la query
   * @returns Línea con factura y cliente cargados
   */
  private async resolveAccessibleInvoiceConcept(
    invoiceConceptSerial: InvoiceConceptSerial,
    action: PermissionAction,
    expectedEnterpriseId: string,
  ): Promise<InvoiceConcept> {
    const invoiceConceptIds = this.collectUniqueIdentifiers(
      invoiceConceptSerial.invoiceConceptId,
      invoiceConceptSerial.invoiceConcept?.id,
    );
    if (invoiceConceptIds.length === 0) {
      throw new HttpException(
        'El número de serie debe pertenecer a un concepto de factura',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (invoiceConceptIds.length !== 1) {
      throw new HttpException(
        'Número de serie de concepto no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    const invoiceConcept = await this.invoiceConceptRepository.findById(
      invoiceConceptIds[0],
      ['invoice', 'invoice.client', 'item'],
    );
    if (!invoiceConcept) {
      throw new HttpException(
        'Número de serie de concepto no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      invoiceConcept.invoice?.client?.enterpriseId,
      'Número de serie de concepto no encontrado',
      { resource: 'invoices', action },
    );
    if (invoiceConcept.invoice.client.enterpriseId !== expectedEnterpriseId) {
      throw new HttpException(
        'Número de serie de concepto no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    return invoiceConcept;
  }

  /**
   * Impide mutar series de una factura ya emitida.
   * @param invoiceConcept - Línea con `invoice` cargado
   */
  private assertInvoiceIsDraft(invoiceConcept: InvoiceConcept): void {
    if (invoiceConcept.invoice?.status !== InvoiceStatus.DRAFT) {
      throw new HttpException(
        'No se pueden modificar los números de serie de una factura ya emitida',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Solo las líneas vinculadas a un artículo con `serialNumber` admiten series.
   * @param invoiceConcept - Línea con `item` cargado
   */
  private assertLineAllowsSerialNumbers(invoiceConcept: InvoiceConcept): void {
    if (!invoiceConcept.itemId || invoiceConcept.item?.serialNumber !== true) {
      this.logger.error(
        `La línea ${invoiceConcept.id} no admite números de serie`,
      );
      throw new HttpException(
        'Solo se pueden asignar números de serie a conceptos vinculados a un artículo que se gestiona con número de serie',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Impide crear más series que unidades de la línea.
   * @param invoiceConcept - Línea con `quantity`
   */
  private async assertSerialCountWithinQuantity(
    invoiceConcept: InvoiceConcept,
  ): Promise<void> {
    const serialCount = await this.invoiceConceptSerialRepository.countByInvoiceConceptId(
      invoiceConcept.id,
    );
    const quantity = invoiceConcept.quantity ?? 1;
    if (serialCount >= quantity) {
      this.logger.error(
        `La línea ${invoiceConcept.id} ya tiene ${serialCount} series para cantidad ${quantity}`,
      );
      throw new HttpException(
        'El número de series no puede superar la cantidad del concepto',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Comprueba tenant y permiso sobre el número de serie.
   * @param invoiceConceptSerial - Registro con relaciones de factura cargadas
   * @param action - Acción del catálogo
   */
  private assertSerialAccessible(
    invoiceConceptSerial: InvoiceConceptSerial,
    action: PermissionAction,
  ): void {
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      invoiceConceptSerial.invoiceConcept?.invoice?.client?.enterpriseId,
      'Número de serie de concepto no encontrado',
      { resource: 'invoices', action },
    );
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
