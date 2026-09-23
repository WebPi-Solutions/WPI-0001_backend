import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { ItemSerialStatus, StockDirection, StockType } from 'src/common/enums';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { InventoryLedgerService } from 'src/common/helpers/inventory/inventory-ledger.service';
import { Item } from 'src/entities/item/item.entity';
import { ItemRepository } from 'src/entities/item/item-repository.service';
import { ItemSerial } from 'src/entities/item-serial/item-serial.entity';
import { ItemSerialRepository } from 'src/entities/item-serial/item-serial-repository.service';
import { Spent } from 'src/entities/spent/spent.entity';
import { SpentRepository } from 'src/entities/spent/spent-repository.service';
import { SpentConcept } from 'src/entities/spent-concept/spent-concept.entity';
import { SpentConceptRepository } from 'src/entities/spent-concept/spent-concept-repository.service';
import { SpentConceptSerial } from 'src/entities/spent-concept-serial/spent-concept-serial.entity';
import { StockMovement } from 'src/entities/stock-movement/stock-movement.entity';

/**
 * Línea ya validada, lista para persistir dentro de la transacción.
 */
interface NormalizedSpentGraphLine {
  /** UUID persistido, si la línea ya existía */
  id?: string;
  /** Artículo de catálogo validado, o null en alta libre */
  item: Item | null;
  /** Posición 0-based */
  position: number;
  /** Nombre congelado */
  name: string;
  /** Precio base unitario */
  basePrice: number;
  /** IVA */
  vat: number;
  /** IRPF */
  irpf: number;
  /** Porcentaje declarado */
  percentage: number;
  /** Cantidad */
  quantity: number;
  /** EAN congelado */
  ean: string | null;
  /** Números de serie recortados, en orden */
  serialNumbers: string[];
}

/**
 * Persiste cabecera, líneas, identidades de serie y kardex de un gasto
 * en una sola transacción, tras validar el grafo completo.
 */
@Injectable()
export class SpentGraphPersistenceService {
  private readonly logger = new Logger(SpentGraphPersistenceService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly spentRepository: SpentRepository,
    private readonly spentConceptRepository: SpentConceptRepository,
    private readonly itemRepository: ItemRepository,
    private readonly itemSerialRepository: ItemSerialRepository,
    private readonly enterpriseAccessService: EnterpriseAccessService,
    private readonly inventoryLedgerService: InventoryLedgerService,
  ) {}

  /**
   * Crea el gasto y, si hay líneas, todo su inventario en la misma transacción.
   * Si cualquier escritura falla, Postgres deshace el gasto y no quedan datos huérfanos.
   *
   * @param spentHeader - Cabecera ya validada de tenant
   * @param spentConcepts - Líneas del cuerpo, o undefined si solo se crea la cabecera
   * @param enterpriseId - Empresa del proveedor
   * @returns Gasto recargado con líneas y series
   */
  async createSpentGraph(
    spentHeader: Spent,
    spentConcepts: SpentConcept[] | undefined,
    enterpriseId: string,
  ): Promise<Spent> {
    const normalizedLines = await this.validateLines(
      spentConcepts ?? [],
      enterpriseId,
      null,
    );
    this.logger.log(
      `Persistiendo gasto atómico "${spentHeader.name}" con ${normalizedLines.length} líneas`,
    );

    const createdSpentId = await this.runInTransaction(async (entityManager) => {
      const createdSpent = await entityManager.save(
        Spent,
        this.buildSpentHeaderPayload(spentHeader, false),
      );
      await this.insertLines(
        entityManager,
        createdSpent.id,
        createdSpent.status,
        this.resolveOccurredAt(createdSpent),
        normalizedLines,
      );
      return createdSpent.id;
    });

    return this.reloadSpentGraph(createdSpentId);
  }

  /**
   * Actualiza cabecera y sustituye el grafo de líneas en una transacción.
   *
   * @param existingSpent - Gasto persistido con proveedor
   * @param spentHeader - Campos de cabecera a fusionar
   * @param spentConcepts - Grafo deseado de líneas
   * @param enterpriseId - Empresa del proveedor
   * @returns Gasto recargado
   */
  async updateSpentGraph(
    existingSpent: Spent,
    spentHeader: Spent,
    spentConcepts: SpentConcept[],
    enterpriseId: string,
  ): Promise<Spent> {
    const existingLines = await this.spentConceptRepository.findBySpentId(
      existingSpent.id,
      ['item', 'serials', 'serials.itemSerial'],
    );
    const normalizedLines = await this.validateLines(
      spentConcepts,
      enterpriseId,
      existingSpent.id,
    );
    this.assertExistingSerialsRemainMutable(existingLines, normalizedLines);

    const nextStatus = spentHeader.status ?? existingSpent.status;
    const occurredAt = this.resolveOccurredAt({
      ...existingSpent,
      ...spentHeader,
    } as Spent);

    this.logger.log(
      `Actualizando gasto atómico ${existingSpent.id} con ${normalizedLines.length} líneas`,
    );

    await this.runInTransaction(async (entityManager) => {
      await entityManager.save(Spent, {
        ...this.buildSpentHeaderPayload(
          { ...existingSpent, ...spentHeader } as Spent,
          true,
        ),
        id: existingSpent.id,
      });
      await this.syncExistingLines(
        entityManager,
        existingSpent.id,
        nextStatus,
        occurredAt,
        existingLines,
        normalizedLines,
      );
    });

    return this.reloadSpentGraph(existingSpent.id);
  }

  /**
   * Valida todas las líneas y series antes de abrir la transacción.
   *
   * @param spentConcepts - Líneas del cuerpo
   * @param enterpriseId - Empresa del proveedor
   * @param existingSpentId - UUID del gasto en edición, o null en alta
   * @returns Líneas normalizadas
   */
  private async validateLines(
    spentConcepts: SpentConcept[],
    enterpriseId: string,
    existingSpentId: string | null,
  ): Promise<NormalizedSpentGraphLine[]> {
    const ownedSerialNumbersByItemId =
      await this.collectOwnedSerialNumbersByItemId(existingSpentId);
    const payloadSerialNumbersByItemId = new Map<string, Set<string>>();
    const collidingCatalogSerialNumbers: string[] = [];
    const normalizedLines: NormalizedSpentGraphLine[] = [];

    for (const [lineIndex, spentConcept] of spentConcepts.entries()) {
      const normalizedLine = await this.normalizeLine(
        spentConcept,
        lineIndex,
        enterpriseId,
      );
      const itemId = normalizedLine.item?.id;
      if (itemId && normalizedLine.serialNumbers.length > 0) {
        const payloadSerialNumbers =
          payloadSerialNumbersByItemId.get(itemId) ?? new Set<string>();
        const ownedSerialNumbers = ownedSerialNumbersByItemId.get(itemId) ?? new Set<string>();
        for (const serialNumber of normalizedLine.serialNumbers) {
          if (payloadSerialNumbers.has(serialNumber)) {
            throw new HttpException(
              `El número de serie ${serialNumber} ya está asignado a otro concepto de este artículo`,
              HttpStatus.BAD_REQUEST,
            );
          }
          payloadSerialNumbers.add(serialNumber);
          const existingItemSerial =
            await this.itemSerialRepository.findByItemIdAndSerialNumber(
              itemId,
              serialNumber,
            );
          if (existingItemSerial && !ownedSerialNumbers.has(serialNumber)) {
            collidingCatalogSerialNumbers.push(serialNumber);
          }
        }
        payloadSerialNumbersByItemId.set(itemId, payloadSerialNumbers);
      }
      normalizedLines.push(normalizedLine);
    }

    if (collidingCatalogSerialNumbers.length > 0) {
      throw new HttpException(
        this.buildCatalogCollisionMessage(collidingCatalogSerialNumbers),
        HttpStatus.CONFLICT,
      );
    }

    return normalizedLines;
  }

  /**
   * Normaliza una línea: artículo de la empresa, cantidades y series obligatorias.
   *
   * @param spentConcept - Línea del cuerpo
   * @param lineIndex - Índice en el array
   * @param enterpriseId - Empresa del proveedor
   * @returns Línea validada
   */
  private async normalizeLine(
    spentConcept: SpentConcept,
    lineIndex: number,
    enterpriseId: string,
  ): Promise<NormalizedSpentGraphLine> {
    const name = this.resolveRequiredName(spentConcept.name, lineIndex);
    const quantity = this.parsePositiveInteger(
      spentConcept.quantity ?? 1,
      'La cantidad',
    );
    const resolvedItem = await this.resolveAccessibleItem(
      spentConcept,
      enterpriseId,
    );
    const serialNumbers = this.collectSerialNumbers(spentConcept);
    this.assertSerialsMatchItem(resolvedItem, serialNumbers, quantity);

    return {
      id: spentConcept.id?.trim() || undefined,
      item: resolvedItem,
      position: this.parseNonNegativeInteger(
        spentConcept.position ?? lineIndex,
        'La posición',
      ),
      name,
      basePrice: this.parseFiniteNumber(spentConcept.basePrice ?? 0, 'El precio base'),
      vat: this.parseNonNegativeInteger(spentConcept.vat ?? 21, 'El IVA'),
      irpf: this.parseNonNegativeInteger(spentConcept.irpf ?? 0, 'El IRPF'),
      percentage: Math.min(
        100,
        this.parseNonNegativeInteger(spentConcept.percentage ?? 100, 'El porcentaje'),
      ),
      quantity,
      ean: this.normalizeOptionalEan(spentConcept.ean, resolvedItem),
      serialNumbers,
    };
  }

  /**
   * Carga el artículo si la línea va vinculada al catálogo y comprueba empresa y permiso.
   *
   * @param spentConcept - Línea del cuerpo
   * @param enterpriseId - Empresa del proveedor
   * @returns Artículo validado o null
   */
  private async resolveAccessibleItem(
    spentConcept: SpentConcept,
    enterpriseId: string,
  ): Promise<Item | null> {
    const itemId = spentConcept.itemId?.trim() || spentConcept.item?.id?.trim();
    if (!itemId) {
      return null;
    }

    const item = await this.itemRepository.findById(itemId, ['itemCategory']);
    if (!item) {
      this.logger.error(`Artículo no encontrado con ID: ${itemId}`);
      throw new HttpException('Concepto de gasto no encontrado', HttpStatus.NOT_FOUND);
    }
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      item.itemCategory?.enterpriseId,
      'Concepto de gasto no encontrado',
      { resource: 'spents', action: 'write' },
    );
    if (item.itemCategory.enterpriseId !== enterpriseId) {
      this.logger.warn(
        `El artículo ${item.id} pertenece a ${item.itemCategory.enterpriseId}, no a ${enterpriseId}`,
      );
      throw new HttpException('Concepto de gasto no encontrado', HttpStatus.NOT_FOUND);
    }
    return item;
  }

  /**
   * Exige un número de serie por unidad si el artículo los gestiona; los prohíbe si no.
   *
   * @param item - Artículo validado
   * @param serialNumbers - Series informadas
   * @param quantity - Unidades de la línea
   */
  private assertSerialsMatchItem(
    item: Item | null,
    serialNumbers: string[],
    quantity: number,
  ): void {
    const tracksSerialNumbers = item?.serialNumber === true && item.stock === true;
    if (!tracksSerialNumbers) {
      if (serialNumbers.length > 0) {
        throw new HttpException(
          'Solo se pueden asignar números de serie a conceptos vinculados a un artículo que se gestiona con número de serie',
          HttpStatus.BAD_REQUEST,
        );
      }
      return;
    }
    if (serialNumbers.length !== quantity) {
      throw new HttpException(
        'Debe informar un número de serie por cada unidad',
        HttpStatus.BAD_REQUEST,
      );
    }
    const uniqueSerialNumbers = new Set(serialNumbers);
    if (uniqueSerialNumbers.size !== serialNumbers.length) {
      throw new HttpException(
        'Los números de serie de un mismo concepto no pueden repetirse',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Inserta las líneas nuevas y su inventario.
   *
   * @param entityManager - Manager de la transacción
   * @param spentId - UUID del gasto
   * @param spentStatus - Estado del gasto
   * @param occurredAt - Fecha del movimiento
   * @param normalizedLines - Líneas validadas
   */
  private async insertLines(
    entityManager: EntityManager,
    spentId: string,
    spentStatus: string,
    occurredAt: Date,
    normalizedLines: NormalizedSpentGraphLine[],
  ): Promise<void> {
    for (const normalizedLine of normalizedLines) {
      const createdSpentConcept = await entityManager.save(
        SpentConcept,
        this.buildSpentConceptScalarPayload(spentId, normalizedLine),
      );
      await this.persistLineInventory(
        entityManager,
        createdSpentConcept,
        normalizedLine,
        spentStatus,
        occurredAt,
      );
    }
  }

  /**
   * Sincroniza líneas existentes: borra las quitadas, actualiza las restantes y crea las nuevas.
   *
   * @param entityManager - Manager de la transacción
   * @param spentId - UUID del gasto
   * @param spentStatus - Estado resultante
   * @param occurredAt - Fecha del movimiento
   * @param existingLines - Líneas persistidas
   * @param normalizedLines - Grafo deseado
   */
  private async syncExistingLines(
    entityManager: EntityManager,
    spentId: string,
    spentStatus: string,
    occurredAt: Date,
    existingLines: SpentConcept[],
    normalizedLines: NormalizedSpentGraphLine[],
  ): Promise<void> {
    const existingLinesById = new Map(
      existingLines.map((spentConcept) => [spentConcept.id, spentConcept]),
    );
    const desiredIds = new Set(
      normalizedLines
        .map((normalizedLine) => normalizedLine.id)
        .filter((spentConceptId): spentConceptId is string => Boolean(spentConceptId)),
    );

    for (const existingLine of existingLines) {
      if (!desiredIds.has(existingLine.id)) {
        await this.deleteLineGraph(entityManager, existingLine);
      }
    }

    for (const normalizedLine of normalizedLines) {
      if (!normalizedLine.id) {
        await this.insertLines(entityManager, spentId, spentStatus, occurredAt, [
          normalizedLine,
        ]);
        continue;
      }
      const existingLine = existingLinesById.get(normalizedLine.id);
      if (!existingLine || existingLine.spentId !== spentId) {
        throw new HttpException('Concepto de gasto no encontrado', HttpStatus.NOT_FOUND);
      }
      const updatedSpentConcept = await entityManager.save(
        SpentConcept,
        this.buildSpentConceptScalarPayload(spentId, normalizedLine, existingLine.id),
      );
      if (this.inventoryLedgerService.isSpentCancelled(spentStatus)) {
        continue;
      }
      await this.replaceLineInventory(
        entityManager,
        existingLine,
        updatedSpentConcept,
        normalizedLine,
        spentStatus,
        occurredAt,
      );
    }
  }

  /**
   * Crea identidades de serie y/o el movimiento de cantidad de una línea nueva.
   *
   * @param entityManager - Manager de la transacción
   * @param spentConcept - Línea persistida
   * @param normalizedLine - Línea validada
   * @param spentStatus - Estado del gasto
   * @param occurredAt - Fecha del movimiento
   */
  private async persistLineInventory(
    entityManager: EntityManager,
    spentConcept: SpentConcept,
    normalizedLine: NormalizedSpentGraphLine,
    spentStatus: string,
    occurredAt: Date,
  ): Promise<void> {
    if (this.inventoryLedgerService.isSpentCancelled(spentStatus)) {
      return;
    }
    if (normalizedLine.item?.serialNumber === true && normalizedLine.item.stock === true) {
      for (const serialNumber of normalizedLine.serialNumbers) {
        await this.insertPurchaseSerial(
          entityManager,
          normalizedLine.item,
          spentConcept,
          serialNumber,
          occurredAt,
        );
      }
      return;
    }
    if (normalizedLine.item?.stock === true && normalizedLine.item.serialNumber !== true) {
      await entityManager.save(StockMovement, {
        itemId: normalizedLine.item.id,
        itemSerialId: null,
        spentConceptId: spentConcept.id,
        invoiceConceptId: null,
        quantity: normalizedLine.quantity,
        direction: StockDirection.IN,
        type: StockType.PURCHASE,
        occurredAt,
      });
    }
  }

  /**
   * Sincroniza el inventario de una línea actualizada sin recrear series que no cambian.
   *
   * @param entityManager - Manager de la transacción
   * @param existingLine - Línea previa con series
   * @param updatedSpentConcept - Línea ya guardada
   * @param normalizedLine - Grafo deseado
   * @param spentStatus - Estado del gasto
   * @param occurredAt - Fecha del movimiento
   */
  private async replaceLineInventory(
    entityManager: EntityManager,
    existingLine: SpentConcept,
    updatedSpentConcept: SpentConcept,
    normalizedLine: NormalizedSpentGraphLine,
    spentStatus: string,
    occurredAt: Date,
  ): Promise<void> {
    const sameItem =
      (existingLine.itemId ?? null) === (normalizedLine.item?.id ?? null);
    const tracksSerialNumbers =
      normalizedLine.item?.serialNumber === true && normalizedLine.item.stock === true;
    if (tracksSerialNumbers && sameItem) {
      await this.diffPurchaseSerials(
        entityManager,
        existingLine,
        updatedSpentConcept,
        normalizedLine,
        occurredAt,
      );
      return;
    }
    await this.deleteLineInventory(entityManager, existingLine);
    await this.persistLineInventory(
      entityManager,
      updatedSpentConcept,
      normalizedLine,
      spentStatus,
      occurredAt,
    );
  }

  /**
   * Añade o quita solo las series que cambian en una línea ya persistida.
   *
   * @param entityManager - Manager de la transacción
   * @param existingLine - Línea previa
   * @param updatedSpentConcept - Línea guardada
   * @param normalizedLine - Grafo deseado
   * @param occurredAt - Fecha del movimiento
   */
  private async diffPurchaseSerials(
    entityManager: EntityManager,
    existingLine: SpentConcept,
    updatedSpentConcept: SpentConcept,
    normalizedLine: NormalizedSpentGraphLine,
    occurredAt: Date,
  ): Promise<void> {
    const desiredSerialNumbers = new Set(normalizedLine.serialNumbers);
    const existingSerialsByNumber = new Map(
      (existingLine.serials ?? []).map((spentConceptSerial) => [
        spentConceptSerial.serialNumber?.trim() ?? '',
        spentConceptSerial,
      ]),
    );

    for (const spentConceptSerial of existingLine.serials ?? []) {
      const serialNumber = spentConceptSerial.serialNumber?.trim() ?? '';
      if (!desiredSerialNumbers.has(serialNumber)) {
        await this.deleteOnePurchaseSerial(entityManager, spentConceptSerial);
      }
    }

    for (const serialNumber of normalizedLine.serialNumbers) {
      if (!existingSerialsByNumber.has(serialNumber)) {
        await this.insertPurchaseSerial(
          entityManager,
          normalizedLine.item as Item,
          updatedSpentConcept,
          serialNumber,
          occurredAt,
        );
      }
    }
  }

  /**
   * Elimina una unidad comprada, su movimiento y su instantánea de línea.
   *
   * @param entityManager - Manager de la transacción
   * @param spentConceptSerial - Instantánea a borrar
   */
  private async deleteOnePurchaseSerial(
    entityManager: EntityManager,
    spentConceptSerial: SpentConceptSerial,
  ): Promise<void> {
    if (spentConceptSerial.itemSerialId) {
      await entityManager.delete(StockMovement, {
        itemSerialId: spentConceptSerial.itemSerialId,
      });
    }
    await entityManager.delete(SpentConceptSerial, { id: spentConceptSerial.id });
    if (spentConceptSerial.itemSerialId) {
      await entityManager.delete(ItemSerial, { id: spentConceptSerial.itemSerialId });
    }
  }

  /**
   * Crea la identidad de una unidad comprada y su movimiento de entrada.
   *
   * @param entityManager - Manager de la transacción
   * @param item - Artículo serializado
   * @param spentConcept - Línea persistida
   * @param serialNumber - Número de serie recortado
   * @param occurredAt - Fecha del movimiento
   */
  private async insertPurchaseSerial(
    entityManager: EntityManager,
    item: Item,
    spentConcept: SpentConcept,
    serialNumber: string,
    occurredAt: Date,
  ): Promise<void> {
    const createdItemSerial = await entityManager.save(ItemSerial, {
      itemId: item.id,
      serialNumber,
      status: ItemSerialStatus.IN_STOCK,
    });
    await entityManager.save(StockMovement, {
      itemId: item.id,
      itemSerialId: createdItemSerial.id,
      spentConceptId: spentConcept.id,
      invoiceConceptId: null,
      quantity: 1,
      direction: StockDirection.IN,
      type: StockType.PURCHASE,
      occurredAt,
    });
    await entityManager.save(SpentConceptSerial, {
      spentConceptId: spentConcept.id,
      itemSerialId: createdItemSerial.id,
      serialNumber: createdItemSerial.serialNumber,
    });
  }

  /**
   * Elimina una línea y todo su inventario.
   *
   * @param entityManager - Manager de la transacción
   * @param existingLine - Línea a borrar
   */
  private async deleteLineGraph(
    entityManager: EntityManager,
    existingLine: SpentConcept,
  ): Promise<void> {
    await this.deleteLineInventory(entityManager, existingLine);
    await entityManager.delete(SpentConcept, { id: existingLine.id });
  }

  /**
   * Borra movimientos, instantáneas de serie e identidades de una línea.
   *
   * @param entityManager - Manager de la transacción
   * @param existingLine - Línea con series cargadas
   */
  private async deleteLineInventory(
    entityManager: EntityManager,
    existingLine: SpentConcept,
  ): Promise<void> {
    await entityManager.delete(StockMovement, { spentConceptId: existingLine.id });
    const itemSerialIds = (existingLine.serials ?? [])
      .map((spentConceptSerial) => spentConceptSerial.itemSerialId)
      .filter((itemSerialId): itemSerialId is string => Boolean(itemSerialId));
    await entityManager.delete(SpentConceptSerial, { spentConceptId: existingLine.id });
    if (itemSerialIds.length > 0) {
      await entityManager.delete(ItemSerial, { id: In(itemSerialIds) });
    }
  }

  /**
   * Impide borrar series ya reservadas o vendidas.
   *
   * @param existingLines - Líneas persistidas
   * @param normalizedLines - Grafo deseado
   */
  private assertExistingSerialsRemainMutable(
    existingLines: SpentConcept[],
    normalizedLines: NormalizedSpentGraphLine[],
  ): void {
    const desiredLineById = new Map(
      normalizedLines
        .filter((normalizedLine) => Boolean(normalizedLine.id))
        .map((normalizedLine) => [normalizedLine.id as string, normalizedLine]),
    );
    for (const existingLine of existingLines) {
      const desiredLine = desiredLineById.get(existingLine.id);
      for (const spentConceptSerial of existingLine.serials ?? []) {
        const itemSerialStatus = spentConceptSerial.itemSerial?.status;
        if (
          itemSerialStatus !== ItemSerialStatus.RESERVED &&
          itemSerialStatus !== ItemSerialStatus.SOLD
        ) {
          continue;
        }
        const serialNumber = spentConceptSerial.serialNumber?.trim() ?? '';
        const existingItemId = existingLine.itemId ?? null;
        const desiredItemId = desiredLine?.item ? desiredLine.item.id : null;
        const itemChanged = existingItemId !== desiredItemId;
        if (
          !desiredLine ||
          itemChanged ||
          !desiredLine.serialNumbers.includes(serialNumber)
        ) {
          throw new HttpException(
            'No se puede modificar un número de serie reservado o vendido',
            HttpStatus.CONFLICT,
          );
        }
      }
    }
  }

  /**
   * Ejecuta el callback en una transacción y traduce 23505 a 409.
   *
   * @param transactionCallback - Escrituras del grafo
   * @returns Resultado del callback
   */
  private async runInTransaction<T>(
    transactionCallback: (entityManager: EntityManager) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.dataSource.transaction(transactionCallback);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const driverError = error as {
        code?: string;
        constraint?: string;
        driverError?: { code?: string; constraint?: string };
      };
      const postgresCode = driverError.code ?? driverError.driverError?.code;
      if (postgresCode === '23505') {
        const constraintName =
          driverError.constraint ?? driverError.driverError?.constraint ?? '';
        this.logger.warn(
          `Conflicto de unicidad al persistir el grafo del gasto (${constraintName})`,
        );
        if (constraintName.includes('item_serials')) {
          throw new HttpException(
            ItemSerialRepository.buildAlreadyExistsMessage(),
            HttpStatus.CONFLICT,
          );
        }
        throw new HttpException(
          'No se pudo guardar el gasto por un conflicto de datos duplicados',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  /**
   * Números de serie ya registrados por este gasto, indexados por artículo.
   *
   * @param existingSpentId - UUID del gasto, o null en alta
   * @returns Conjuntos de series propias
   */
  private async collectOwnedSerialNumbersByItemId(
    existingSpentId: string | null,
  ): Promise<Map<string, Set<string>>> {
    const ownedSerialNumbersByItemId = new Map<string, Set<string>>();
    if (!existingSpentId) {
      return ownedSerialNumbersByItemId;
    }
    const existingLines = await this.spentConceptRepository.findBySpentId(
      existingSpentId,
      ['serials'],
    );
    for (const existingLine of existingLines) {
      const itemId = existingLine.itemId?.trim();
      if (!itemId) {
        continue;
      }
      const serialNumbers = ownedSerialNumbersByItemId.get(itemId) ?? new Set<string>();
      for (const spentConceptSerial of existingLine.serials ?? []) {
        const serialNumber = spentConceptSerial.serialNumber?.trim();
        if (serialNumber) {
          serialNumbers.add(serialNumber);
        }
      }
      ownedSerialNumbersByItemId.set(itemId, serialNumbers);
    }
    return ownedSerialNumbersByItemId;
  }

  /**
   * Recarga el gasto con líneas y series tras el commit.
   *
   * @param spentId - UUID persistido
   * @returns Gasto completo
   */
  private async reloadSpentGraph(spentId: string): Promise<Spent> {
    const spent = await this.spentRepository.findById(spentId, [
      'supplier',
      'spentConcepts',
      'spentConcepts.serials',
    ]);
    if (!spent) {
      throw new HttpException('Gasto no encontrado', HttpStatus.NOT_FOUND);
    }
    return spent;
  }

  /**
   * Campos de cabecera persistibles, sin relaciones.
   *
   * @param spent - Gasto de entrada
   * @param includeId - Si debe conservar el UUID
   * @returns Payload de `spents`
   */
  private buildSpentHeaderPayload(spent: Spent, includeId: boolean): Partial<Spent> {
    const supplierId = spent.supplierId?.trim() || spent.supplier?.id?.trim();
    if (!supplierId) {
      throw new HttpException('El gasto debe tener un proveedor', HttpStatus.BAD_REQUEST);
    }
    const payload: Partial<Spent> = {
      supplierId,
      code: spent.code ?? null,
      name: spent.name,
      issuedDate: spent.issuedDate,
      collectionDate: spent.collectionDate,
      declarationDate: spent.declarationDate,
      status: spent.status,
      file: Boolean(spent.file),
    };
    if (includeId && spent.id) {
      payload.id = spent.id;
    }
    return payload;
  }

  /**
   * Campos de línea persistibles, sin relaciones.
   *
   * @param spentId - UUID del gasto
   * @param normalizedLine - Línea validada
   * @param existingId - UUID persistido, si la línea ya existía
   * @returns Payload de `spent_concepts`
   */
  private buildSpentConceptScalarPayload(
    spentId: string,
    normalizedLine: NormalizedSpentGraphLine,
    existingId?: string,
  ): Partial<SpentConcept> {
    const payload: Partial<SpentConcept> = {
      spentId,
      itemId: normalizedLine.item?.id ?? null,
      position: normalizedLine.position,
      name: normalizedLine.name,
      basePrice: normalizedLine.basePrice,
      vat: normalizedLine.vat,
      irpf: normalizedLine.irpf,
      percentage: normalizedLine.percentage,
      quantity: normalizedLine.quantity,
      ean: normalizedLine.ean,
    };
    if (existingId) {
      payload.id = existingId;
    }
    return payload;
  }

  /**
   * Fecha del movimiento: emisión del gasto o ahora.
   *
   * @param spent - Cabecera
   * @returns Fecha usable
   */
  private resolveOccurredAt(spent: Spent): Date {
    if (spent.issuedDate) {
      return new Date(spent.issuedDate);
    }
    return new Date();
  }

  /**
   * Extrae y recorta los números de serie del cuerpo de la línea.
   *
   * @param spentConcept - Línea del cuerpo
   * @returns Series no vacías
   */
  private collectSerialNumbers(spentConcept: SpentConcept): string[] {
    return (spentConcept.serials ?? [])
      .map((spentConceptSerial) => {
        try {
          return this.inventoryLedgerService.normalizeSerialNumber(
            spentConceptSerial.serialNumber,
          );
        } catch (error) {
          if (error instanceof HttpException) {
            throw error;
          }
          throw new HttpException(
            'El número de serie no puede estar vacío',
            HttpStatus.BAD_REQUEST,
          );
        }
      })
      .filter((serialNumber) => serialNumber.length > 0);
  }

  /**
   * Nombre de línea obligatorio.
   *
   * @param rawName - Valor recibido
   * @param lineIndex - Índice para el log
   * @returns Nombre recortado
   */
  private resolveRequiredName(rawName: unknown, lineIndex: number): string {
    if (typeof rawName !== 'string' || rawName.trim() === '') {
      this.logger.error(`La línea ${lineIndex} no tiene nombre`);
      throw new HttpException(
        'El concepto debe tener un nombre',
        HttpStatus.BAD_REQUEST,
      );
    }
    return rawName.trim();
  }

  /**
   * EAN de la línea o del artículo.
   *
   * @param rawEan - EAN del cuerpo
   * @param item - Artículo validado
   * @returns EAN recortado o null
   */
  private normalizeOptionalEan(
    rawEan: string | null | undefined,
    item: Item | null,
  ): string | null {
    if (rawEan !== undefined && rawEan !== null) {
      const trimmedEan = rawEan.trim();
      return trimmedEan === '' ? null : trimmedEan;
    }
    return item?.ean ?? null;
  }

  /**
   * Mensaje 409 listando todos los números de serie que ya existen.
   *
   * @param serialNumbers - Valores en conflicto
   * @returns Texto para la API
   */
  private buildCatalogCollisionMessage(serialNumbers: string[]): string {
    const uniqueSerialNumbers = [...new Set(serialNumbers)];
    if (uniqueSerialNumbers.length === 1) {
      return ItemSerialRepository.buildAlreadyExistsMessage(uniqueSerialNumbers[0]);
    }
    return `Los números de serie ${uniqueSerialNumbers.join(', ')} ya existen para este artículo`;
  }

  /**
   * Interpreta un entero ≥ 1.
   *
   * @param rawValue - Valor recibido
   * @param fieldLabel - Etiqueta de error
   * @returns Entero
   */
  private parsePositiveInteger(rawValue: unknown, fieldLabel: string): number {
    const parsedInteger = this.parseNonNegativeInteger(rawValue, fieldLabel);
    if (parsedInteger < 1) {
      throw new HttpException(
        `${fieldLabel} debe ser un número entero mayor o igual que 1`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return parsedInteger;
  }

  /**
   * Interpreta un entero ≥ 0.
   *
   * @param rawValue - Valor recibido
   * @param fieldLabel - Etiqueta de error
   * @returns Entero
   */
  private parseNonNegativeInteger(rawValue: unknown, fieldLabel: string): number {
    const numericValue = this.parseFiniteNumber(rawValue, fieldLabel);
    if (numericValue < 0) {
      throw new HttpException(
        `${fieldLabel} debe ser un número entero mayor o igual que 0`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return Math.round(numericValue);
  }

  /**
   * Interpreta un número finito.
   *
   * @param rawValue - Valor recibido
   * @param fieldLabel - Etiqueta de error
   * @returns Número
   */
  private parseFiniteNumber(rawValue: unknown, fieldLabel: string): number {
    const numericValue =
      typeof rawValue === 'number'
        ? rawValue
        : typeof rawValue === 'string' && rawValue.trim() !== ''
          ? Number(rawValue)
          : Number.NaN;
    if (!Number.isFinite(numericValue)) {
      throw new HttpException(
        `${fieldLabel} debe ser un número válido`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return numericValue;
  }
}
