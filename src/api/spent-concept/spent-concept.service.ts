import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { DeleteResult } from 'typeorm';
import { SpentConceptRepository } from 'src/entities/spent-concept/spent-concept-repository.service';
import { SpentConcept } from 'src/entities/spent-concept/spent-concept.entity';
import { SpentRepository } from 'src/entities/spent/spent-repository.service';
import { Spent } from 'src/entities/spent/spent.entity';
import { ItemRepository } from 'src/entities/item/item-repository.service';
import { Item } from 'src/entities/item/item.entity';
import { SpentConceptSerialRepository } from 'src/entities/spent-concept-serial/spent-concept-serial-repository.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { PermissionAction } from 'src/common/helpers/enterprise-permission/permission.catalog';

/**
 * Servicio de API de líneas de gasto.
 * El tenant se resuelve a través de `spent.supplier.enterpriseId`.
 */
@Injectable()
export class SpentConceptService {
  private readonly logger = new Logger(SpentConceptService.name);

  constructor(
    private readonly spentConceptRepository: SpentConceptRepository,
    private readonly spentRepository: SpentRepository,
    private readonly itemRepository: ItemRepository,
    private readonly spentConceptSerialRepository: SpentConceptSerialRepository,
    private readonly enterpriseAccessService: EnterpriseAccessService,
  ) {}

  /**
   * Crea una línea en un gasto de la empresa de la query.
   * @param spentConcept - Datos de la línea
   * @param expectedEnterpriseId - Empresa de la query
   * @returns La línea persistida
   */
  async create(
    spentConcept: SpentConcept,
    expectedEnterpriseId: string,
  ): Promise<SpentConcept> {
    this.logger.log('Iniciando creación de línea de gasto');
    const accessibleSpent = await this.resolveAccessibleSpent(
      spentConcept,
      'write',
      expectedEnterpriseId,
    );

    const resolvedItem = await this.resolveOptionalAccessibleItem(
      spentConcept,
      accessibleSpent.supplier.enterpriseId,
    );
    const persistencePayload = await this.buildCreatePersistencePayload(
      spentConcept,
      accessibleSpent.id,
      resolvedItem,
    );

    try {
      const createdSpentConcept = await this.spentConceptRepository.create(
        persistencePayload,
      );
      this.logger.log(`Línea de gasto creada con ID: ${createdSpentConcept.id}`);
      return createdSpentConcept;
    } catch (error) {
      this.logger.error('Error al crear la línea de gasto:', error);
      throw error;
    }
  }

  /**
   * Lista líneas con paginación. El controlador fuerza el filtro `supplier.enterpriseId`.
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
  ): Promise<PaginatedResponse<SpentConcept>> {
    this.logger.log(
      `Obteniendo líneas de gasto paginadas - Página: ${page}, Tamaño: ${pageSize}`,
    );
    const result = await this.spentConceptRepository.findAll(
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
   * Obtiene una línea por identificador. Carga gasto y proveedor para resolver el tenant.
   * @param id - UUID de la línea
   * @param relations - Relaciones a incluir
   * @returns La línea encontrada
   */
  async findById(id: string, relations?: string[]): Promise<SpentConcept> {
    const relationsWithSpent = this.enterpriseAccessService.mergeRelationNames(
      relations,
      ['spent', 'spent.supplier'],
    );
    const spentConcept = await this.spentConceptRepository.findById(
      id,
      relationsWithSpent,
    );
    if (!spentConcept) {
      this.logger.log(`No se encontró ninguna línea de gasto con ID: ${id}`);
      throw new HttpException('Concepto de gasto no encontrado', HttpStatus.NOT_FOUND);
    }

    this.assertSpentConceptAccessible(spentConcept, 'read');
    return spentConcept;
  }

  /**
   * Actualiza una línea. Congela `spentId`.
   * @param id - UUID de la línea
   * @param spentConcept - Campos a actualizar
   * @returns La línea actualizada
   */
  async updateById(id: string, spentConcept: SpentConcept): Promise<SpentConcept> {
    this.logger.log(`Iniciando actualización de línea de gasto con ID: ${id}`);
    const existingSpentConcept = await this.spentConceptRepository.findById(id, [
      'spent',
      'spent.supplier',
    ]);
    if (!existingSpentConcept) {
      throw new HttpException('Concepto de gasto no encontrado', HttpStatus.NOT_FOUND);
    }
    this.assertSpentConceptAccessible(existingSpentConcept, 'write');

    const resolvedItem = await this.resolveOptionalAccessibleItem(
      spentConcept,
      existingSpentConcept.spent.supplier.enterpriseId,
    );
    const persistencePayload = this.buildUpdatePersistencePayload(
      spentConcept,
      existingSpentConcept,
      resolvedItem,
    );
    await this.assertUpdateRespectsSerials(
      existingSpentConcept,
      persistencePayload,
      resolvedItem,
    );

    try {
      const updatedSpentConcept = await this.spentConceptRepository.updateById(
        id,
        persistencePayload,
      );
      this.logger.log(`Línea de gasto ${id} actualizada`);
      return updatedSpentConcept;
    } catch (error) {
      this.logger.error(`Error al actualizar la línea de gasto ${id}:`, error);
      throw error;
    }
  }

  /**
   * Elimina una línea de gasto.
   * @param id - UUID de la línea
   * @returns Resultado del borrado
   */
  async deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Iniciando eliminación de línea de gasto con ID: ${id}`);
    const existingSpentConcept = await this.spentConceptRepository.findById(id, [
      'spent',
      'spent.supplier',
    ]);
    if (!existingSpentConcept) {
      throw new HttpException('Concepto de gasto no encontrado', HttpStatus.NOT_FOUND);
    }
    this.assertSpentConceptAccessible(existingSpentConcept, 'delete');

    try {
      const result = await this.spentConceptRepository.deleteById(id);
      this.logger.log(`Línea de gasto ${id} eliminada. Filas afectadas: ${result.affected}`);
      return result;
    } catch (error) {
      this.logger.error(`Error al eliminar la línea de gasto ${id}:`, error);
      throw error;
    }
  }

  /**
   * Carga el gasto referenciado (`spentId` y `spent.id`) y comprueba tenant y permiso.
   * @param spentConcept - Línea a persistir
   * @param action - Acción del catálogo
   * @param expectedEnterpriseId - Empresa de la query
   * @returns Gasto con `supplier` cargado
   */
  private async resolveAccessibleSpent(
    spentConcept: SpentConcept,
    action: PermissionAction,
    expectedEnterpriseId: string,
  ): Promise<Spent> {
    const spentIds = this.collectUniqueIdentifiers(
      spentConcept.spentId,
      spentConcept.spent?.id,
    );
    if (spentIds.length === 0) {
      this.logger.error('La línea de gasto debe tener un gasto');
      throw new HttpException(
        'El concepto debe pertenecer a un gasto',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (spentIds.length !== 1) {
      this.logger.warn(
        `La línea referencia gastos distintos: ${spentIds.join(',')}`,
      );
      throw new HttpException('Concepto de gasto no encontrado', HttpStatus.NOT_FOUND);
    }

    const spent = await this.spentRepository.findById(spentIds[0], ['supplier']);
    if (!spent) {
      this.logger.error(`Gasto no encontrado con ID: ${spentIds[0]}`);
      throw new HttpException('Concepto de gasto no encontrado', HttpStatus.NOT_FOUND);
    }

    this.enterpriseAccessService.assertCurrentEntityAccessible(
      spent.supplier?.enterpriseId,
      'Concepto de gasto no encontrado',
      { resource: 'spents', action },
    );
    if (spent.supplier.enterpriseId !== expectedEnterpriseId) {
      this.logger.warn(
        `El gasto ${spent.id} pertenece a ${spent.supplier.enterpriseId}, no a ${expectedEnterpriseId}`,
      );
      throw new HttpException('Concepto de gasto no encontrado', HttpStatus.NOT_FOUND);
    }
    return spent;
  }

  /**
   * Carga el artículo opcional y comprueba que pertenece a la misma empresa que el gasto.
   * @param spentConcept - Línea fusionada o de alta
   * @param spentEnterpriseId - Empresa del gasto
   * @returns Artículo validado, o null si el cuerpo no informa artículo
   */
  private async resolveOptionalAccessibleItem(
    spentConcept: SpentConcept,
    spentEnterpriseId: string,
  ): Promise<Item | null> {
    const itemIds = this.collectUniqueIdentifiers(
      spentConcept.itemId,
      spentConcept.item?.id,
    );
    if (itemIds.length === 0) {
      return null;
    }
    if (itemIds.length !== 1) {
      this.logger.warn(`La línea referencia artículos distintos: ${itemIds.join(',')}`);
      throw new HttpException('Concepto de gasto no encontrado', HttpStatus.NOT_FOUND);
    }

    const item = await this.itemRepository.findById(itemIds[0], ['itemCategory']);
    if (!item) {
      this.logger.error(`Artículo no encontrado con ID: ${itemIds[0]}`);
      throw new HttpException('Concepto de gasto no encontrado', HttpStatus.NOT_FOUND);
    }
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      item.itemCategory?.enterpriseId,
      'Concepto de gasto no encontrado',
      { resource: 'spents', action: 'write' },
    );
    if (item.itemCategory.enterpriseId !== spentEnterpriseId) {
      this.logger.warn(
        `El artículo ${item.id} pertenece a ${item.itemCategory.enterpriseId}, no a ${spentEnterpriseId}`,
      );
      throw new HttpException('Concepto de gasto no encontrado', HttpStatus.NOT_FOUND);
    }
    return item;
  }

  /**
   * Comprueba tenant y permiso sobre la línea a través de su gasto.
   * @param spentConcept - Línea con `spent.supplier` cargado
   * @param action - Acción del catálogo
   */
  private assertSpentConceptAccessible(
    spentConcept: SpentConcept,
    action: PermissionAction,
  ): void {
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      spentConcept.spent?.supplier?.enterpriseId,
      'Concepto de gasto no encontrado',
      { resource: 'spents', action },
    );
  }

  /**
   * Construye el payload de alta: FK, posición, instantánea del artículo y defaults.
   * @param spentConcept - Cuerpo recibido
   * @param spentId - Gasto validado
   * @param resolvedItem - Artículo validado o null
   * @returns Partial listo para el repositorio
   */
  private async buildCreatePersistencePayload(
    spentConcept: SpentConcept,
    spentId: string,
    resolvedItem: Item | null,
  ): Promise<Partial<SpentConcept>> {
    const position = await this.resolveCreatePosition(spentConcept.position, spentId);
    const snapshotFields = this.buildSnapshotFields(spentConcept, resolvedItem, true);
    return {
      spentId,
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
   * Construye el payload de actualización. No reescribe `spentId`.
   * @param spentConcept - Cuerpo recibido
   * @param existingSpentConcept - Línea persistida
   * @param resolvedItem - Artículo validado o null
   * @returns Partial listo para el repositorio
   */
  private buildUpdatePersistencePayload(
    spentConcept: SpentConcept,
    existingSpentConcept: SpentConcept,
    resolvedItem: Item | null,
  ): Partial<SpentConcept> {
    const snapshotFields = this.buildSnapshotFields(spentConcept, resolvedItem, false);
    const persistencePayload: Partial<SpentConcept> = {};
    this.assignIfDefined(persistencePayload, 'itemId', this.resolveUpdateItemId(
      spentConcept,
      existingSpentConcept,
      resolvedItem,
    ));
    this.assignIfDefined(persistencePayload, 'position', this.resolveOptionalIntegerField(
      spentConcept.position,
      'La posición',
    ));
    this.assignIfDefined(persistencePayload, 'name', snapshotFields.name);
    this.assignIfDefined(persistencePayload, 'basePrice', snapshotFields.basePrice);
    this.assignIfDefined(persistencePayload, 'vat', snapshotFields.vat);
    this.assignIfDefined(persistencePayload, 'irpf', snapshotFields.irpf);
    this.assignIfDefined(persistencePayload, 'quantity', snapshotFields.quantity);
    if (spentConcept.ean !== undefined) {
      persistencePayload.ean = snapshotFields.ean ?? null;
    }
    return persistencePayload;
  }

  /**
   * Resuelve el `itemId` de una actualización: omitido conserva, null desvincula.
   * @param spentConcept - Cuerpo recibido
   * @param existingSpentConcept - Línea persistida
   * @param resolvedItem - Artículo validado o null
   * @returns UUID, null o undefined para no tocar el campo
   */
  private resolveUpdateItemId(
    spentConcept: SpentConcept,
    existingSpentConcept: SpentConcept,
    resolvedItem: Item | null,
  ): string | null | undefined {
    if (resolvedItem) {
      return resolvedItem.id;
    }
    if (spentConcept.itemId === null) {
      return null;
    }
    if (spentConcept.itemId === undefined && spentConcept.item === undefined) {
      return undefined;
    }
    return existingSpentConcept.itemId;
  }

  /**
   * Calcula la posición de alta: la informada o MAX+1.
   * @param requestedPosition - Posición del cuerpo
   * @param spentId - Gasto destino
   * @returns Posición persistible
   */
  private async resolveCreatePosition(
    requestedPosition: number | undefined,
    spentId: string,
  ): Promise<number> {
    if (requestedPosition !== undefined && requestedPosition !== null) {
      return this.parseNonNegativeInteger(requestedPosition, 'La posición');
    }
    const maxPosition = await this.spentConceptRepository.findMaxPositionBySpentId(
      spentId,
    );
    return maxPosition === null ? 0 : maxPosition + 1;
  }

  /**
   * Compone nombre, precios e impuestos: instantánea del artículo si hay vínculo.
   * @param spentConcept - Cuerpo recibido
   * @param resolvedItem - Artículo validado o null
   * @param applyCreateDefaults - Si deben aplicarse defaults de alta
   * @returns Campos de instantánea
   */
  private buildSnapshotFields(
    spentConcept: SpentConcept,
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
      spentConcept.name,
      resolvedItem,
      applyCreateDefaults,
    );
    const resolvedBasePrice = this.resolveDefaultedNumericField(
      spentConcept.basePrice,
      resolvedItem?.pricePvp,
      applyCreateDefaults,
    );
    return {
      name: resolvedName,
      basePrice: resolvedBasePrice,
      vat: this.resolveDefaultedIntegerField(spentConcept.vat, 21, applyCreateDefaults),
      irpf: this.resolveDefaultedIntegerField(spentConcept.irpf, 0, applyCreateDefaults),
      quantity: this.resolveDefaultedIntegerField(
        spentConcept.quantity,
        1,
        applyCreateDefaults,
      ),
      ean: this.resolveLineEan(spentConcept.ean, resolvedItem, applyCreateDefaults),
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
  private assignIfDefined<FieldName extends keyof SpentConcept>(
    payload: Partial<SpentConcept>,
    fieldName: FieldName,
    fieldValue: SpentConcept[FieldName] | undefined,
  ): void {
    if (fieldValue === undefined) {
      return;
    }
    payload[fieldName] = fieldValue;
  }

  /**
   * Impide bajar la cantidad por debajo de las series, o cambiar a un artículo
   * sin gestión de serie si la línea ya tiene números de serie.
   * @param existingSpentConcept - Línea persistida
   * @param persistencePayload - Campos que se van a guardar
   * @param resolvedItem - Artículo del cuerpo, o null
   */
  private async assertUpdateRespectsSerials(
    existingSpentConcept: SpentConcept,
    persistencePayload: Partial<SpentConcept>,
    resolvedItem: Item | null,
  ): Promise<void> {
    const serialCount = await this.spentConceptSerialRepository.countBySpentConceptId(
      existingSpentConcept.id,
    );
    if (serialCount === 0) {
      return;
    }

    const nextQuantity = persistencePayload.quantity ?? existingSpentConcept.quantity ?? 1;
    if (serialCount > nextQuantity) {
      this.logger.error(
        `La línea ${existingSpentConcept.id} tiene ${serialCount} series y no admite cantidad ${nextQuantity}`,
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
        `La línea ${existingSpentConcept.id} tiene series y no puede perder la gestión de número de serie`,
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
