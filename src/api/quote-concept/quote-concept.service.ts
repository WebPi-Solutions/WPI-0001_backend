import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { DeleteResult } from 'typeorm';
import { QuoteConceptRepository } from 'src/entities/quote-concept/quote-concept-repository.service';
import { QuoteConcept } from 'src/entities/quote-concept/quote-concept.entity';
import { QuoteRepository } from 'src/entities/quote/quote-repository.service';
import { Quote } from 'src/entities/quote/quote.entity';
import { ItemRepository } from 'src/entities/item/item-repository.service';
import { Item } from 'src/entities/item/item.entity';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { PermissionAction } from 'src/common/helpers/enterprise-permission/permission.catalog';

/**
 * Servicio de API de líneas de presupuesto.
 * El tenant se resuelve a través de `quote.client.enterpriseId`.
 */
@Injectable()
export class QuoteConceptService {
  private readonly logger = new Logger(QuoteConceptService.name);

  constructor(
    private readonly quoteConceptRepository: QuoteConceptRepository,
    private readonly quoteRepository: QuoteRepository,
    private readonly itemRepository: ItemRepository,
    private readonly enterpriseAccessService: EnterpriseAccessService,
  ) {}

  /**
   * Crea una línea en un presupuesto de la empresa de la query.
   * @param quoteConcept - Datos de la línea
   * @param expectedEnterpriseId - Empresa de la query
   * @returns La línea persistida
   */
  async create(
    quoteConcept: QuoteConcept,
    expectedEnterpriseId: string,
  ): Promise<QuoteConcept> {
    this.logger.log('Iniciando creación de línea de presupuesto');
    const accessibleQuote = await this.resolveAccessibleQuote(
      quoteConcept,
      'write',
      expectedEnterpriseId,
    );
    const resolvedItem = await this.resolveOptionalAccessibleItem(
      quoteConcept,
      accessibleQuote.client.enterpriseId,
    );
    const persistencePayload = await this.buildCreatePersistencePayload(
      quoteConcept,
      accessibleQuote.id,
      resolvedItem,
    );

    try {
      const createdQuoteConcept = await this.quoteConceptRepository.create(persistencePayload);
      this.logger.log(`Línea de presupuesto creada con ID: ${createdQuoteConcept.id}`);
      return createdQuoteConcept;
    } catch (error) {
      this.logger.error('Error al crear la línea de presupuesto:', error);
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
  ): Promise<PaginatedResponse<QuoteConcept>> {
    this.logger.log(
      `Obteniendo líneas de presupuesto paginadas - Página: ${page}, Tamaño: ${pageSize}`,
    );
    const result = await this.quoteConceptRepository.findAll(
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
   * Obtiene una línea por identificador. Carga presupuesto y cliente para resolver el tenant.
   * @param id - UUID de la línea
   * @param relations - Relaciones a incluir
   * @returns La línea encontrada
   */
  async findById(id: string, relations?: string[]): Promise<QuoteConcept> {
    const relationsWithQuote = this.enterpriseAccessService.mergeRelationNames(
      relations,
      ['quote', 'quote.client'],
    );
    const quoteConcept = await this.quoteConceptRepository.findById(id, relationsWithQuote);
    if (!quoteConcept) {
      this.logger.log(`No se encontró ninguna línea de presupuesto con ID: ${id}`);
      throw new HttpException('Concepto de presupuesto no encontrado', HttpStatus.NOT_FOUND);
    }

    this.assertQuoteConceptAccessible(quoteConcept, 'read');
    return quoteConcept;
  }

  /**
   * Actualiza una línea y congela `quoteId`.
   * @param id - UUID de la línea
   * @param quoteConcept - Campos a actualizar
   * @returns La línea actualizada
   */
  async updateById(id: string, quoteConcept: QuoteConcept): Promise<QuoteConcept> {
    this.logger.log(`Iniciando actualización de línea de presupuesto con ID: ${id}`);
    const existingQuoteConcept = await this.quoteConceptRepository.findById(id, [
      'quote',
      'quote.client',
    ]);
    if (!existingQuoteConcept) {
      throw new HttpException('Concepto de presupuesto no encontrado', HttpStatus.NOT_FOUND);
    }
    this.assertQuoteConceptAccessible(existingQuoteConcept, 'write');
    const resolvedItem = await this.resolveOptionalAccessibleItem(
      quoteConcept,
      existingQuoteConcept.quote.client.enterpriseId,
    );
    const persistencePayload = this.buildUpdatePersistencePayload(
      quoteConcept,
      existingQuoteConcept,
      resolvedItem,
    );

    try {
      const updatedQuoteConcept = await this.quoteConceptRepository.updateById(
        id,
        persistencePayload,
      );
      this.logger.log(`Línea de presupuesto ${id} actualizada`);
      return updatedQuoteConcept;
    } catch (error) {
      this.logger.error(`Error al actualizar la línea de presupuesto ${id}:`, error);
      throw error;
    }
  }

  /**
   * Elimina una línea de presupuesto.
   * @param id - UUID de la línea
   * @returns Resultado del borrado
   */
  async deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Iniciando eliminación de línea de presupuesto con ID: ${id}`);
    const existingQuoteConcept = await this.quoteConceptRepository.findById(id, [
      'quote',
      'quote.client',
    ]);
    if (!existingQuoteConcept) {
      throw new HttpException('Concepto de presupuesto no encontrado', HttpStatus.NOT_FOUND);
    }
    this.assertQuoteConceptAccessible(existingQuoteConcept, 'delete');
    try {
      const result = await this.quoteConceptRepository.deleteById(id);
      this.logger.log(`Línea de presupuesto ${id} eliminada. Filas afectadas: ${result.affected}`);
      return result;
    } catch (error) {
      this.logger.error(`Error al eliminar la línea de presupuesto ${id}:`, error);
      throw error;
    }
  }

  /**
   * Carga el presupuesto referenciado (`quoteId` y `quote.id`) y comprueba tenant y permiso.
   * @param quoteConcept - Línea a persistir
   * @param action - Acción del catálogo
   * @param expectedEnterpriseId - Empresa de la query
   * @returns Presupuesto con `client` cargado
   */
  private async resolveAccessibleQuote(
    quoteConcept: QuoteConcept,
    action: PermissionAction,
    expectedEnterpriseId: string,
  ): Promise<Quote> {
    const quoteIds = this.collectUniqueIdentifiers(
      quoteConcept.quoteId,
      quoteConcept.quote?.id,
    );
    if (quoteIds.length === 0) {
      this.logger.error('La línea de presupuesto debe tener un presupuesto');
      throw new HttpException(
        'El concepto debe pertenecer a un presupuesto',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (quoteIds.length !== 1) {
      this.logger.warn(`La línea referencia presupuestos distintos: ${quoteIds.join(',')}`);
      throw new HttpException('Concepto de presupuesto no encontrado', HttpStatus.NOT_FOUND);
    }

    const quote = await this.quoteRepository.findById(quoteIds[0], ['client']);
    if (!quote) {
      this.logger.error(`Presupuesto no encontrado con ID: ${quoteIds[0]}`);
      throw new HttpException('Concepto de presupuesto no encontrado', HttpStatus.NOT_FOUND);
    }

    this.enterpriseAccessService.assertCurrentEntityAccessible(
      quote.client?.enterpriseId,
      'Concepto de presupuesto no encontrado',
      { resource: 'quotes', action },
    );
    if (quote.client.enterpriseId !== expectedEnterpriseId) {
      this.logger.warn(
        `El presupuesto ${quote.id} pertenece a ${quote.client.enterpriseId}, no a ${expectedEnterpriseId}`,
      );
      throw new HttpException('Concepto de presupuesto no encontrado', HttpStatus.NOT_FOUND);
    }
    return quote;
  }

  /**
   * Carga el artículo opcional y comprueba que pertenece a la misma empresa que el presupuesto.
   * @param quoteConcept - Línea fusionada o de alta
   * @param quoteEnterpriseId - Empresa del presupuesto
   * @returns Artículo validado, o null si la línea es texto libre
   */
  private async resolveOptionalAccessibleItem(
    quoteConcept: QuoteConcept,
    quoteEnterpriseId: string,
  ): Promise<Item | null> {
    const itemIds = this.collectUniqueIdentifiers(
      quoteConcept.itemId,
      quoteConcept.item?.id,
    );
    if (itemIds.length === 0) {
      return null;
    }
    if (itemIds.length !== 1) {
      this.logger.warn(`La línea referencia artículos distintos: ${itemIds.join(',')}`);
      throw new HttpException('Concepto de presupuesto no encontrado', HttpStatus.NOT_FOUND);
    }

    const item = await this.itemRepository.findById(itemIds[0], ['itemCategory']);
    if (!item) {
      this.logger.error(`Artículo no encontrado con ID: ${itemIds[0]}`);
      throw new HttpException('Concepto de presupuesto no encontrado', HttpStatus.NOT_FOUND);
    }
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      item.itemCategory?.enterpriseId,
      'Concepto de presupuesto no encontrado',
      { resource: 'quotes', action: 'write' },
    );
    if (item.itemCategory.enterpriseId !== quoteEnterpriseId) {
      this.logger.warn(
        `El artículo ${item.id} pertenece a ${item.itemCategory.enterpriseId}, no a ${quoteEnterpriseId}`,
      );
      throw new HttpException('Concepto de presupuesto no encontrado', HttpStatus.NOT_FOUND);
    }
    return item;
  }

  /**
   * Comprueba tenant y permiso sobre la línea a través de su presupuesto.
   * @param quoteConcept - Línea con `quote.client` cargado
   * @param action - Acción del catálogo
   */
  private assertQuoteConceptAccessible(
    quoteConcept: QuoteConcept,
    action: PermissionAction,
  ): void {
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      quoteConcept.quote?.client?.enterpriseId,
      'Concepto de presupuesto no encontrado',
      { resource: 'quotes', action },
    );
  }

  /**
   * Construye el payload de alta: FK, posición, instantánea del artículo y defaults.
   * @param quoteConcept - Cuerpo recibido
   * @param quoteId - Presupuesto validado
   * @param resolvedItem - Artículo validado o null
   * @returns Partial listo para el repositorio
   */
  private async buildCreatePersistencePayload(
    quoteConcept: QuoteConcept,
    quoteId: string,
    resolvedItem: Item | null,
  ): Promise<Partial<QuoteConcept>> {
    const position = await this.resolveCreatePosition(quoteConcept.position, quoteId);
    const snapshotFields = this.buildSnapshotFields(quoteConcept, resolvedItem, true);
    return {
      quoteId,
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
   * Construye el payload de actualización. No reescribe `quoteId`.
   * @param quoteConcept - Cuerpo recibido
   * @param existingQuoteConcept - Línea persistida
   * @param resolvedItem - Artículo validado o null
   * @returns Partial listo para el repositorio
   */
  private buildUpdatePersistencePayload(
    quoteConcept: QuoteConcept,
    existingQuoteConcept: QuoteConcept,
    resolvedItem: Item | null,
  ): Partial<QuoteConcept> {
    const snapshotFields = this.buildSnapshotFields(quoteConcept, resolvedItem, false);
    const persistencePayload: Partial<QuoteConcept> = {};
    this.assignIfDefined(persistencePayload, 'itemId', this.resolveUpdateItemId(
      quoteConcept,
      existingQuoteConcept,
      resolvedItem,
    ));
    this.assignIfDefined(persistencePayload, 'position', this.resolveOptionalIntegerField(
      quoteConcept.position,
      'La posición',
    ));
    this.assignIfDefined(persistencePayload, 'name', snapshotFields.name);
    this.assignIfDefined(persistencePayload, 'basePrice', snapshotFields.basePrice);
    this.assignIfDefined(persistencePayload, 'vat', snapshotFields.vat);
    this.assignIfDefined(persistencePayload, 'irpf', snapshotFields.irpf);
    this.assignIfDefined(persistencePayload, 'quantity', snapshotFields.quantity);
    if (quoteConcept.ean !== undefined) {
      persistencePayload.ean = snapshotFields.ean ?? null;
    }
    return persistencePayload;
  }

  /**
   * Resuelve el `itemId` de una actualización: omitido conserva, null desvincula.
   * @param quoteConcept - Cuerpo recibido
   * @param existingQuoteConcept - Línea persistida
   * @param resolvedItem - Artículo validado o null
   * @returns UUID, null o undefined para no tocar el campo
   */
  private resolveUpdateItemId(
    quoteConcept: QuoteConcept,
    existingQuoteConcept: QuoteConcept,
    resolvedItem: Item | null,
  ): string | null | undefined {
    if (resolvedItem) {
      return resolvedItem.id;
    }
    if (quoteConcept.itemId === null) {
      return null;
    }
    if (quoteConcept.itemId === undefined && quoteConcept.item === undefined) {
      return undefined;
    }
    return existingQuoteConcept.itemId;
  }

  /**
   * Calcula la posición de alta: la informada o MAX+1.
   * @param requestedPosition - Posición del cuerpo
   * @param quoteId - Presupuesto destino
   * @returns Posición persistible
   */
  private async resolveCreatePosition(
    requestedPosition: number | undefined,
    quoteId: string,
  ): Promise<number> {
    if (requestedPosition !== undefined && requestedPosition !== null) {
      return this.parseNonNegativeInteger(requestedPosition, 'La posición');
    }
    const maxPosition = await this.quoteConceptRepository.findMaxPositionByQuoteId(quoteId);
    return maxPosition === null ? 0 : maxPosition + 1;
  }

  /**
   * Compone nombre, precios e impuestos: instantánea del artículo si hay vínculo.
   * @param quoteConcept - Cuerpo recibido
   * @param resolvedItem - Artículo validado o null
   * @param applyCreateDefaults - Si deben aplicarse defaults de alta
   * @returns Campos de instantánea
   */
  private buildSnapshotFields(
    quoteConcept: QuoteConcept,
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
      quoteConcept.name,
      resolvedItem,
      applyCreateDefaults,
    );
    const resolvedBasePrice = this.resolveDefaultedNumericField(
      quoteConcept.basePrice,
      resolvedItem?.pricePvp,
      applyCreateDefaults,
    );
    return {
      name: resolvedName,
      basePrice: resolvedBasePrice,
      vat: this.resolveDefaultedIntegerField(quoteConcept.vat, 21, applyCreateDefaults),
      irpf: this.resolveDefaultedIntegerField(quoteConcept.irpf, 0, applyCreateDefaults),
      quantity: this.resolveDefaultedIntegerField(
        quoteConcept.quantity,
        1,
        applyCreateDefaults,
      ),
      ean: this.resolveLineEan(quoteConcept.ean, resolvedItem, applyCreateDefaults),
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
  private assignIfDefined<FieldName extends keyof QuoteConcept>(
    payload: Partial<QuoteConcept>,
    fieldName: FieldName,
    fieldValue: QuoteConcept[FieldName] | undefined,
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
