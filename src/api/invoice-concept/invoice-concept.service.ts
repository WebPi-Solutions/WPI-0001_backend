import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { DeleteResult } from 'typeorm';
import { InvoiceConceptRepository } from 'src/entities/invoice-concept/invoice-concept-repository.service';
import { InvoiceConcept } from 'src/entities/invoice-concept/invoice-concept.entity';
import { InvoiceRepository } from 'src/entities/invoice/invoice-repository.service';
import { Invoice, InvoiceStatus } from 'src/entities/invoice/invoice.entity';
import { ItemRepository } from 'src/entities/item/item-repository.service';
import { Item } from 'src/entities/item/item.entity';
import { InvoiceConceptSerialRepository } from 'src/entities/invoice-concept-serial/invoice-concept-serial-repository.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { PermissionAction } from 'src/common/helpers/enterprise-permission/permission.catalog';

/**
 * Servicio de API de líneas de factura.
 * El tenant se resuelve a través de `invoice.client.enterpriseId`.
 * Las mutaciones solo se permiten si la factura sigue en borrador.
 */
@Injectable()
export class InvoiceConceptService {
  private readonly logger = new Logger(InvoiceConceptService.name);

  constructor(
    private readonly invoiceConceptRepository: InvoiceConceptRepository,
    private readonly invoiceRepository: InvoiceRepository,
    private readonly itemRepository: ItemRepository,
    private readonly invoiceConceptSerialRepository: InvoiceConceptSerialRepository,
    private readonly enterpriseAccessService: EnterpriseAccessService,
  ) {}

  /**
   * Crea una línea en una factura de la empresa de la query.
   * @param invoiceConcept - Datos de la línea
   * @param expectedEnterpriseId - Empresa de la query
   * @returns La línea persistida
   */
  async create(
    invoiceConcept: InvoiceConcept,
    expectedEnterpriseId: string,
  ): Promise<InvoiceConcept> {
    this.logger.log('Iniciando creación de línea de factura');
    const accessibleInvoice = await this.resolveAccessibleInvoice(
      invoiceConcept,
      'write',
      expectedEnterpriseId,
    );
    this.assertInvoiceIsDraft(accessibleInvoice);

    const resolvedItem = await this.resolveOptionalAccessibleItem(
      invoiceConcept,
      accessibleInvoice.client.enterpriseId,
    );
    const persistencePayload = await this.buildCreatePersistencePayload(
      invoiceConcept,
      accessibleInvoice.id,
      resolvedItem,
    );

    try {
      const createdInvoiceConcept = await this.invoiceConceptRepository.create(
        persistencePayload,
      );
      this.logger.log(`Línea de factura creada con ID: ${createdInvoiceConcept.id}`);
      return createdInvoiceConcept;
    } catch (error) {
      this.logger.error('Error al crear la línea de factura:', error);
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
  ): Promise<PaginatedResponse<InvoiceConcept>> {
    this.logger.log(
      `Obteniendo líneas de factura paginadas - Página: ${page}, Tamaño: ${pageSize}`,
    );
    const result = await this.invoiceConceptRepository.findAll(
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
   * Obtiene una línea por identificador. Carga factura y cliente para resolver el tenant.
   * @param id - UUID de la línea
   * @param relations - Relaciones a incluir
   * @returns La línea encontrada
   */
  async findById(id: string, relations?: string[]): Promise<InvoiceConcept> {
    const relationsWithInvoice = this.enterpriseAccessService.mergeRelationNames(
      relations,
      ['invoice', 'invoice.client'],
    );
    const invoiceConcept = await this.invoiceConceptRepository.findById(
      id,
      relationsWithInvoice,
    );
    if (!invoiceConcept) {
      this.logger.log(`No se encontró ninguna línea de factura con ID: ${id}`);
      throw new HttpException('Concepto de factura no encontrado', HttpStatus.NOT_FOUND);
    }

    this.assertInvoiceConceptAccessible(invoiceConcept, 'read');
    return invoiceConcept;
  }

  /**
   * Actualiza una línea. Congela `invoiceId` y exige factura en borrador.
   * @param id - UUID de la línea
   * @param invoiceConcept - Campos a actualizar
   * @returns La línea actualizada
   */
  async updateById(id: string, invoiceConcept: InvoiceConcept): Promise<InvoiceConcept> {
    this.logger.log(`Iniciando actualización de línea de factura con ID: ${id}`);
    const existingInvoiceConcept = await this.invoiceConceptRepository.findById(id, [
      'invoice',
      'invoice.client',
    ]);
    if (!existingInvoiceConcept) {
      throw new HttpException('Concepto de factura no encontrado', HttpStatus.NOT_FOUND);
    }
    this.assertInvoiceConceptAccessible(existingInvoiceConcept, 'write');
    this.assertInvoiceIsDraft(existingInvoiceConcept.invoice);

    // El artículo se resuelve solo del cuerpo: un PATCH de nombre no debe recargar el catálogo.
    const resolvedItem = await this.resolveOptionalAccessibleItem(
      invoiceConcept,
      existingInvoiceConcept.invoice.client.enterpriseId,
    );
    const persistencePayload = this.buildUpdatePersistencePayload(
      invoiceConcept,
      existingInvoiceConcept,
      resolvedItem,
    );
    await this.assertUpdateRespectsSerials(
      existingInvoiceConcept,
      persistencePayload,
      resolvedItem,
    );

    try {
      const updatedInvoiceConcept = await this.invoiceConceptRepository.updateById(
        id,
        persistencePayload,
      );
      this.logger.log(`Línea de factura ${id} actualizada`);
      return updatedInvoiceConcept;
    } catch (error) {
      this.logger.error(`Error al actualizar la línea de factura ${id}:`, error);
      throw error;
    }
  }

  /**
   * Elimina una línea si la factura sigue en borrador.
   * @param id - UUID de la línea
   * @returns Resultado del borrado
   */
  async deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Iniciando eliminación de línea de factura con ID: ${id}`);
    const existingInvoiceConcept = await this.invoiceConceptRepository.findById(id, [
      'invoice',
      'invoice.client',
    ]);
    if (!existingInvoiceConcept) {
      throw new HttpException('Concepto de factura no encontrado', HttpStatus.NOT_FOUND);
    }
    this.assertInvoiceConceptAccessible(existingInvoiceConcept, 'delete');
    this.assertInvoiceIsDraft(existingInvoiceConcept.invoice);

    try {
      const result = await this.invoiceConceptRepository.deleteById(id);
      this.logger.log(`Línea de factura ${id} eliminada. Filas afectadas: ${result.affected}`);
      return result;
    } catch (error) {
      this.logger.error(`Error al eliminar la línea de factura ${id}:`, error);
      throw error;
    }
  }

  /**
   * Carga la factura referenciada (`invoiceId` y `invoice.id`) y comprueba tenant y permiso.
   * @param invoiceConcept - Línea a persistir
   * @param action - Acción del catálogo
   * @param expectedEnterpriseId - Empresa de la query
   * @returns Factura con `client` cargado
   */
  private async resolveAccessibleInvoice(
    invoiceConcept: InvoiceConcept,
    action: PermissionAction,
    expectedEnterpriseId: string,
  ): Promise<Invoice> {
    const invoiceIds = this.collectUniqueIdentifiers(
      invoiceConcept.invoiceId,
      invoiceConcept.invoice?.id,
    );
    if (invoiceIds.length === 0) {
      this.logger.error('La línea de factura debe tener una factura');
      throw new HttpException(
        'El concepto debe pertenecer a una factura',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (invoiceIds.length !== 1) {
      this.logger.warn(
        `La línea referencia facturas distintas: ${invoiceIds.join(',')}`,
      );
      throw new HttpException('Concepto de factura no encontrado', HttpStatus.NOT_FOUND);
    }

    const invoice = await this.invoiceRepository.findById(invoiceIds[0], ['client']);
    if (!invoice) {
      this.logger.error(`Factura no encontrada con ID: ${invoiceIds[0]}`);
      throw new HttpException('Concepto de factura no encontrado', HttpStatus.NOT_FOUND);
    }

    this.enterpriseAccessService.assertCurrentEntityAccessible(
      invoice.client?.enterpriseId,
      'Concepto de factura no encontrado',
      { resource: 'invoices', action },
    );
    if (invoice.client.enterpriseId !== expectedEnterpriseId) {
      this.logger.warn(
        `La factura ${invoice.id} pertenece a ${invoice.client.enterpriseId}, no a ${expectedEnterpriseId}`,
      );
      throw new HttpException('Concepto de factura no encontrado', HttpStatus.NOT_FOUND);
    }
    return invoice;
  }

  /**
   * Carga el artículo opcional y comprueba que pertenece a la misma empresa que la factura.
   * @param invoiceConcept - Línea fusionada o de alta
   * @param invoiceEnterpriseId - Empresa de la factura
   * @returns Artículo validado, o null si la línea es texto libre
   */
  private async resolveOptionalAccessibleItem(
    invoiceConcept: InvoiceConcept,
    invoiceEnterpriseId: string,
  ): Promise<Item | null> {
    const itemIds = this.collectUniqueIdentifiers(
      invoiceConcept.itemId,
      invoiceConcept.item?.id,
    );
    if (itemIds.length === 0) {
      return null;
    }
    if (itemIds.length !== 1) {
      this.logger.warn(`La línea referencia artículos distintos: ${itemIds.join(',')}`);
      throw new HttpException('Concepto de factura no encontrado', HttpStatus.NOT_FOUND);
    }

    const item = await this.itemRepository.findById(itemIds[0], ['itemCategory']);
    if (!item) {
      this.logger.error(`Artículo no encontrado con ID: ${itemIds[0]}`);
      throw new HttpException('Concepto de factura no encontrado', HttpStatus.NOT_FOUND);
    }
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      item.itemCategory?.enterpriseId,
      'Concepto de factura no encontrado',
      { resource: 'invoices', action: 'write' },
    );
    if (item.itemCategory.enterpriseId !== invoiceEnterpriseId) {
      this.logger.warn(
        `El artículo ${item.id} pertenece a ${item.itemCategory.enterpriseId}, no a ${invoiceEnterpriseId}`,
      );
      throw new HttpException('Concepto de factura no encontrado', HttpStatus.NOT_FOUND);
    }
    return item;
  }

  /**
   * Impide mutar líneas de una factura ya emitida.
   * @param invoice - Factura propietaria
   */
  private assertInvoiceIsDraft(invoice: Invoice): void {
    if (invoice.status !== InvoiceStatus.DRAFT) {
      this.logger.error(
        `No se pueden modificar los conceptos de la factura ${invoice.id} porque ya ha sido emitida`,
      );
      throw new HttpException(
        'No se pueden modificar los conceptos de una factura ya emitida',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Comprueba tenant y permiso sobre la línea a través de su factura.
   * @param invoiceConcept - Línea con `invoice.client` cargado
   * @param action - Acción del catálogo
   */
  private assertInvoiceConceptAccessible(
    invoiceConcept: InvoiceConcept,
    action: PermissionAction,
  ): void {
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      invoiceConcept.invoice?.client?.enterpriseId,
      'Concepto de factura no encontrado',
      { resource: 'invoices', action },
    );
  }

  /**
   * Construye el payload de alta: FK, posición, instantánea del artículo y defaults.
   * @param invoiceConcept - Cuerpo recibido
   * @param invoiceId - Factura validada
   * @param resolvedItem - Artículo validado o null
   * @returns Partial listo para el repositorio
   */
  private async buildCreatePersistencePayload(
    invoiceConcept: InvoiceConcept,
    invoiceId: string,
    resolvedItem: Item | null,
  ): Promise<Partial<InvoiceConcept>> {
    const position = await this.resolveCreatePosition(invoiceConcept.position, invoiceId);
    const snapshotFields = this.buildSnapshotFields(invoiceConcept, resolvedItem, true);
    const persistencePayload: Partial<InvoiceConcept> = {
      invoiceId,
      itemId: resolvedItem?.id ?? null,
      position,
      name: snapshotFields.name,
      basePrice: snapshotFields.basePrice,
      vat: snapshotFields.vat,
      irpf: snapshotFields.irpf,
      quantity: snapshotFields.quantity,
      supplied: snapshotFields.supplied,
      ean: snapshotFields.ean,
    };
    return persistencePayload;
  }

  /**
   * Construye el payload de actualización. No reescribe `invoiceId`.
   * @param invoiceConcept - Cuerpo recibido
   * @param existingInvoiceConcept - Línea persistida
   * @param resolvedItem - Artículo validado o null
   * @returns Partial listo para el repositorio
   */
  private buildUpdatePersistencePayload(
    invoiceConcept: InvoiceConcept,
    existingInvoiceConcept: InvoiceConcept,
    resolvedItem: Item | null,
  ): Partial<InvoiceConcept> {
    const snapshotFields = this.buildSnapshotFields(invoiceConcept, resolvedItem, false);
    const persistencePayload: Partial<InvoiceConcept> = {};
    this.assignIfDefined(persistencePayload, 'itemId', this.resolveUpdateItemId(
      invoiceConcept,
      existingInvoiceConcept,
      resolvedItem,
    ));
    this.assignIfDefined(persistencePayload, 'position', this.resolveOptionalIntegerField(
      invoiceConcept.position,
      'La posición',
    ));
    this.assignIfDefined(persistencePayload, 'name', snapshotFields.name);
    this.assignIfDefined(persistencePayload, 'basePrice', snapshotFields.basePrice);
    this.assignIfDefined(persistencePayload, 'vat', snapshotFields.vat);
    this.assignIfDefined(persistencePayload, 'irpf', snapshotFields.irpf);
    this.assignIfDefined(persistencePayload, 'quantity', snapshotFields.quantity);
    this.assignIfDefined(persistencePayload, 'supplied', snapshotFields.supplied);
    if (invoiceConcept.ean !== undefined) {
      persistencePayload.ean = snapshotFields.ean ?? null;
    }
    return persistencePayload;
  }

  /**
   * Resuelve el `itemId` de una actualización: omitido conserva, null desvincula.
   * @param invoiceConcept - Cuerpo recibido
   * @param existingInvoiceConcept - Línea persistida
   * @param resolvedItem - Artículo validado o null
   * @returns UUID, null o undefined para no tocar el campo
   */
  private resolveUpdateItemId(
    invoiceConcept: InvoiceConcept,
    existingInvoiceConcept: InvoiceConcept,
    resolvedItem: Item | null,
  ): string | null | undefined {
    if (resolvedItem) {
      return resolvedItem.id;
    }
    if (invoiceConcept.itemId === null) {
      return null;
    }
    if (invoiceConcept.itemId === undefined && invoiceConcept.item === undefined) {
      return undefined;
    }
    return existingInvoiceConcept.itemId;
  }

  /**
   * Calcula la posición de alta: la informada o MAX+1.
   * @param requestedPosition - Posición del cuerpo
   * @param invoiceId - Factura destino
   * @returns Posición persistible
   */
  private async resolveCreatePosition(
    requestedPosition: number | undefined,
    invoiceId: string,
  ): Promise<number> {
    if (requestedPosition !== undefined && requestedPosition !== null) {
      return this.parseNonNegativeInteger(requestedPosition, 'La posición');
    }
    const maxPosition = await this.invoiceConceptRepository.findMaxPositionByInvoiceId(
      invoiceId,
    );
    return maxPosition === null ? 0 : maxPosition + 1;
  }

  /**
   * Compone nombre, precios e impuestos: instantánea del artículo si hay vínculo.
   * @param invoiceConcept - Cuerpo recibido
   * @param resolvedItem - Artículo validado o null
   * @param applyCreateDefaults - Si deben aplicarse defaults de alta
   * @returns Campos de instantánea
   */
  private buildSnapshotFields(
    invoiceConcept: InvoiceConcept,
    resolvedItem: Item | null,
    applyCreateDefaults: boolean,
  ): {
    name?: string;
    basePrice?: number;
    vat?: number;
    irpf?: number;
    quantity?: number;
    supplied?: boolean;
    ean?: string | null;
  } {
    const resolvedName = this.resolveLineName(
      invoiceConcept.name,
      resolvedItem,
      applyCreateDefaults,
    );
    const resolvedBasePrice = this.resolveDefaultedNumericField(
      invoiceConcept.basePrice,
      resolvedItem?.pricePvp,
      applyCreateDefaults,
    );
    return {
      name: resolvedName,
      basePrice: resolvedBasePrice,
      vat: this.resolveDefaultedIntegerField(invoiceConcept.vat, 21, applyCreateDefaults),
      irpf: this.resolveDefaultedIntegerField(invoiceConcept.irpf, 0, applyCreateDefaults),
      quantity: this.resolveDefaultedIntegerField(
        invoiceConcept.quantity,
        1,
        applyCreateDefaults,
      ),
      supplied: this.resolveDefaultedBooleanField(
        invoiceConcept.supplied,
        applyCreateDefaults,
      ),
      ean: this.resolveLineEan(invoiceConcept.ean, resolvedItem, applyCreateDefaults),
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
   * Booleano `supplied` con default false.
   * @param fieldValue - Valor recibido
   * @param applyCreateDefaults - Si el omitido debe convertirse en false
   * @returns Booleano persistible
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
    if (typeof fieldValue !== 'boolean') {
      throw new HttpException(
        'El indicador de suplido debe ser un valor booleano',
        HttpStatus.BAD_REQUEST,
      );
    }
    return fieldValue;
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
  private assignIfDefined<FieldName extends keyof InvoiceConcept>(
    payload: Partial<InvoiceConcept>,
    fieldName: FieldName,
    fieldValue: InvoiceConcept[FieldName] | undefined,
  ): void {
    if (fieldValue === undefined) {
      return;
    }
    payload[fieldName] = fieldValue;
  }

  /**
   * Impide bajar la cantidad por debajo de las series, o desvincular un artículo
   * con gestión de serie si la línea ya tiene números de serie.
   * @param existingInvoiceConcept - Línea persistida
   * @param persistencePayload - Campos que se van a guardar
   * @param resolvedItem - Artículo del cuerpo, o null
   */
  private async assertUpdateRespectsSerials(
    existingInvoiceConcept: InvoiceConcept,
    persistencePayload: Partial<InvoiceConcept>,
    resolvedItem: Item | null,
  ): Promise<void> {
    const serialCount = await this.invoiceConceptSerialRepository.countByInvoiceConceptId(
      existingInvoiceConcept.id,
    );
    if (serialCount === 0) {
      return;
    }

    const nextQuantity = persistencePayload.quantity ?? existingInvoiceConcept.quantity ?? 1;
    if (serialCount > nextQuantity) {
      this.logger.error(
        `La línea ${existingInvoiceConcept.id} tiene ${serialCount} series y no admite cantidad ${nextQuantity}`,
      );
      throw new HttpException(
        'La cantidad no puede ser menor que el número de series asignadas',
        HttpStatus.BAD_REQUEST,
      );
    }

    const unlinksItem = persistencePayload.itemId === null;
    const disablesSerialTracking = Boolean(resolvedItem) && resolvedItem.serialNumber !== true;
    if (unlinksItem || disablesSerialTracking) {
      this.logger.error(
        `La línea ${existingInvoiceConcept.id} tiene series y no puede perder la gestión de número de serie`,
      );
      throw new HttpException(
        'No se puede quitar el artículo con número de serie mientras el concepto tenga series asignadas',
        HttpStatus.BAD_REQUEST,
      );
    }
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
