import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Item } from 'src/entities/item/item.entity';
import { ItemSerial } from 'src/entities/item-serial/item-serial.entity';
import { ItemSerialRepository } from 'src/entities/item-serial/item-serial-repository.service';
import { StockMovement } from 'src/entities/stock-movement/stock-movement.entity';
import {
  ItemStockBalance,
  StockMovementRepository,
} from 'src/entities/stock-movement/stock-movement-repository.service';
import { SpentConcept } from 'src/entities/spent-concept/spent-concept.entity';
import { SpentConceptRepository } from 'src/entities/spent-concept/spent-concept-repository.service';
import { SpentConceptSerialRepository } from 'src/entities/spent-concept-serial/spent-concept-serial-repository.service';
import { InvoiceConcept } from 'src/entities/invoice-concept/invoice-concept.entity';
import { InvoiceConceptRepository } from 'src/entities/invoice-concept/invoice-concept-repository.service';
import { InvoiceConceptSerialRepository } from 'src/entities/invoice-concept-serial/invoice-concept-serial-repository.service';
import {
  InvoiceStatus,
  ItemSerialStatus,
  SpentStatus,
  StockDirection,
  StockType,
} from 'src/common/enums';

/**
 * Servicio de dominio del inventario: identidad de series y kardex.
 * Convive con la capa HTTP pero vive bajo `helpers/` porque no expone rutas;
 * lo invocan los servicios de API de gasto, factura y artículo.
 */
@Injectable()
export class InventoryLedgerService {
  private readonly logger = new Logger(InventoryLedgerService.name);

  constructor(
    private readonly itemSerialRepository: ItemSerialRepository,
    private readonly stockMovementRepository: StockMovementRepository,
    private readonly spentConceptRepository: SpentConceptRepository,
    private readonly spentConceptSerialRepository: SpentConceptSerialRepository,
    private readonly invoiceConceptRepository: InvoiceConceptRepository,
    private readonly invoiceConceptSerialRepository: InvoiceConceptSerialRepository,
  ) {}

  /**
   * Indica si el gasto está cancelado y no debe mover stock.
   * @param spentStatus - Estado del gasto
   * @returns True si está cancelado
   */
  isSpentCancelled(spentStatus: string | undefined | null): boolean {
    return (spentStatus ?? '').trim().toLowerCase() === SpentStatus.CANCELLED;
  }

  /**
   * Recorta y valida un número de serie.
   * @param rawSerialNumber - Valor recibido
   * @returns Número de serie no vacío
   */
  normalizeSerialNumber(rawSerialNumber: unknown): string {
    if (typeof rawSerialNumber !== 'string') {
      throw new HttpException(
        'El número de serie debe ser una cadena de texto',
        HttpStatus.BAD_REQUEST,
      );
    }
    const trimmedSerialNumber = rawSerialNumber.trim();
    if (trimmedSerialNumber === '') {
      throw new HttpException(
        'El número de serie no puede estar vacío',
        HttpStatus.BAD_REQUEST,
      );
    }
    return trimmedSerialNumber;
  }

  /**
   * Crea la identidad de una unidad comprada y el movimiento de entrada.
   * @param item - Artículo de la línea
   * @param spentConcept - Línea de gasto
   * @param spentStatus - Estado del gasto
   * @param serialNumber - Número de serie recortado
   * @param occurredAt - Fecha del gasto
   * @returns Unidad persistida
   */
  async registerPurchaseSerial(
    item: Item,
    spentConcept: SpentConcept,
    spentStatus: string,
    serialNumber: string,
    occurredAt: Date,
  ): Promise<ItemSerial> {
    this.assertSpentAllowsInventoryMutation(spentStatus);
    this.assertItemTracksSerials(item);
    const existingItemSerial =
      await this.itemSerialRepository.findByItemIdAndSerialNumber(
        item.id,
        serialNumber,
      );
    if (existingItemSerial) {
      const conflictMessage =
        ItemSerialRepository.buildAlreadyExistsMessage(serialNumber);
      this.logger.warn(
        `${conflictMessage} (artículo ${item.id})`,
      );
      throw new HttpException(conflictMessage, HttpStatus.CONFLICT);
    }
    const createdItemSerial = await this.itemSerialRepository.create({
      itemId: item.id,
      serialNumber,
      status: ItemSerialStatus.IN_STOCK,
    });
    await this.createMovement({
      itemId: item.id,
      itemSerialId: createdItemSerial.id,
      spentConceptId: spentConcept.id,
      invoiceConceptId: null,
      quantity: 1,
      direction: StockDirection.IN,
      type: StockType.PURCHASE,
      occurredAt,
    });
    this.logger.log(
      `Unidad ${createdItemSerial.id} entrada en stock por la línea ${spentConcept.id}`,
    );
    return createdItemSerial;
  }

  /**
   * Cambia el número de serie de una unidad en stock.
   * @param itemSerial - Unidad actual
   * @param newSerialNumber - Nuevo valor recortado
   * @returns Unidad actualizada
   */
  async renamePurchaseSerial(
    itemSerial: ItemSerial,
    newSerialNumber: string,
  ): Promise<ItemSerial> {
    this.assertItemSerialMutable(itemSerial);
    if (itemSerial.serialNumber === newSerialNumber) {
      return itemSerial;
    }
    return this.itemSerialRepository.updateById(itemSerial.id, {
      serialNumber: newSerialNumber,
    });
  }

  /**
   * Anula una unidad comprada si no está reservada ni vendida.
   * Elimina sus movimientos para poder borrar la identidad.
   * @param itemSerial - Unidad a anular
   */
  async removePurchaseSerial(itemSerial: ItemSerial): Promise<void> {
    this.assertItemSerialMutable(itemSerial);
    await this.stockMovementRepository.deleteByItemSerialId(itemSerial.id);
    await this.itemSerialRepository.deleteById(itemSerial.id);
    this.logger.log(`Unidad ${itemSerial.id} eliminada del inventario`);
  }

  /**
   * Reserva una unidad en stock para una línea de factura en borrador.
   * @param item - Artículo de la línea
   * @param itemSerialId - UUID de la unidad
   * @returns Unidad reservada
   */
  async reserveSaleSerial(item: Item, itemSerialId: string): Promise<ItemSerial> {
    this.assertItemTracksSerials(item);
    const itemSerial = await this.loadItemSerialOrThrow(itemSerialId);
    this.assertItemSerialBelongsToItem(itemSerial, item.id);
    if (itemSerial.status !== ItemSerialStatus.IN_STOCK) {
      throw new HttpException(
        'El número de serie no está disponible en stock',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.itemSerialRepository.updateById(itemSerial.id, {
      status: ItemSerialStatus.RESERVED,
    });
  }

  /**
   * Libera una unidad reservada en un borrador.
   * @param itemSerial - Unidad reservada
   */
  async releaseReservedSaleSerial(itemSerial: ItemSerial): Promise<void> {
    if (itemSerial.status !== ItemSerialStatus.RESERVED) {
      this.logger.log(
        `La unidad ${itemSerial.id} no está reservada; no se libera`,
      );
      return;
    }
    await this.itemSerialRepository.updateById(itemSerial.id, {
      status: ItemSerialStatus.IN_STOCK,
    });
  }

  /**
   * Sustituye la unidad reservada de una línea de factura.
   * @param item - Artículo de la línea
   * @param previousItemSerial - Unidad actual
   * @param nextItemSerialId - UUID de la nueva unidad
   * @returns Nueva unidad reservada
   */
  async replaceReservedSaleSerial(
    item: Item,
    previousItemSerial: ItemSerial,
    nextItemSerialId: string,
  ): Promise<ItemSerial> {
    if (previousItemSerial.id === nextItemSerialId) {
      return previousItemSerial;
    }
    const reservedItemSerial = await this.reserveSaleSerial(item, nextItemSerialId);
    await this.releaseReservedSaleSerial(previousItemSerial);
    return reservedItemSerial;
  }

  /**
   * Resuelve la unidad a vender: por UUID o por número de serie en stock.
   * @param item - Artículo de la línea
   * @param itemSerialId - UUID opcional
   * @param serialNumber - Número de serie opcional
   * @returns Unidad en stock
   */
  async resolveAvailableSaleSerial(
    item: Item,
    itemSerialId: string | undefined,
    serialNumber: string | undefined,
  ): Promise<ItemSerial> {
    this.assertItemTracksSerials(item);
    const trimmedItemSerialId = itemSerialId?.trim();
    if (trimmedItemSerialId) {
      const itemSerial = await this.loadItemSerialOrThrow(trimmedItemSerialId);
      this.assertItemSerialBelongsToItem(itemSerial, item.id);
      return itemSerial;
    }
    if (serialNumber !== undefined) {
      const normalizedSerialNumber = this.normalizeSerialNumber(serialNumber);
      const itemSerial = await this.itemSerialRepository.findByItemIdAndSerialNumber(
        item.id,
        normalizedSerialNumber,
      );
      if (!itemSerial) {
        throw new HttpException(
          'El número de serie no está disponible en stock',
          HttpStatus.BAD_REQUEST,
        );
      }
      return itemSerial;
    }
    throw new HttpException(
      'Debe indicar el número de serie de artículo a vender',
      HttpStatus.BAD_REQUEST,
    );
  }

  /**
   * Confirma la salida de stock al emitir una factura.
   * @param invoiceId - UUID de la factura
   * @param occurredAt - Fecha de emisión
   */
  async confirmInvoiceIssue(invoiceId: string, occurredAt: Date): Promise<void> {
    const invoiceConcepts = await this.loadInvoiceConceptsForInventory(invoiceId);
    for (const invoiceConcept of invoiceConcepts) {
      await this.confirmInvoiceConceptIssue(invoiceConcept, occurredAt);
    }
  }

  /**
   * Revierte el stock de una factura cancelada.
   * @param invoiceId - UUID de la factura
   * @param occurredAt - Fecha de la cancelación
   */
  async reverseInvoiceCancellation(invoiceId: string, occurredAt: Date): Promise<void> {
    const invoiceConcepts = await this.loadInvoiceConceptsForInventory(invoiceId);
    for (const invoiceConcept of invoiceConcepts) {
      await this.reverseInvoiceConceptCancellation(invoiceConcept, occurredAt);
    }
  }

  /**
   * Libera las reservas de un borrador (borrado o cancelación sin emitir).
   * @param invoiceId - UUID de la factura
   */
  async releaseDraftInvoiceReservations(invoiceId: string): Promise<void> {
    const invoiceConcepts = await this.loadInvoiceConceptsForInventory(invoiceId);
    for (const invoiceConcept of invoiceConcepts) {
      await this.releaseInvoiceConceptReservations(invoiceConcept);
    }
  }

  /**
   * Libera las reservas de una línea de factura en borrador.
   * @param invoiceConceptId - UUID de la línea
   */
  async releaseInvoiceConceptReservationsById(invoiceConceptId: string): Promise<void> {
    const invoiceConcept = await this.invoiceConceptRepository.findById(
      invoiceConceptId,
      ['item', 'serials', 'serials.itemSerial'],
    );
    if (!invoiceConcept) {
      return;
    }
    await this.releaseInvoiceConceptReservations(invoiceConcept);
  }

  /**
   * Sincroniza el movimiento de cantidad de una línea de gasto sin serie.
   * @param spentConcept - Línea persistida
   * @param item - Artículo vinculado o nulo
   * @param spentStatus - Estado del gasto
   * @param occurredAt - Fecha del gasto
   */
  async syncPurchaseQuantityMovement(
    spentConcept: SpentConcept,
    item: Item | null,
    spentStatus: string,
    occurredAt: Date,
  ): Promise<void> {
    if (this.isSpentCancelled(spentStatus) || !this.itemTracksQuantityStock(item)) {
      return;
    }
    const existingMovements = await this.stockMovementRepository.findBySpentConceptId(
      spentConcept.id,
    );
    const quantityMovements = existingMovements.filter(
      (stockMovement) => !stockMovement.itemSerialId,
    );
    await this.deleteMovements(quantityMovements);
    await this.createMovement({
      itemId: item.id,
      itemSerialId: null,
      spentConceptId: spentConcept.id,
      invoiceConceptId: null,
      quantity: spentConcept.quantity ?? 1,
      direction: StockDirection.IN,
      type: StockType.PURCHASE,
      occurredAt,
    });
  }

  /**
   * Elimina el inventario asociado a una línea de gasto (series y movimientos).
   * @param spentConceptId - UUID de la línea
   */
  async purgeSpentConceptInventory(spentConceptId: string): Promise<void> {
    const spentConceptSerials =
      await this.spentConceptSerialRepository.findBySpentConceptId(
        spentConceptId,
        ['itemSerial'],
      );
    for (const spentConceptSerial of spentConceptSerials) {
      if (spentConceptSerial.itemSerial) {
        this.assertItemSerialMutable(spentConceptSerial.itemSerial);
      }
    }
    await this.stockMovementRepository.deleteBySpentConceptId(spentConceptId);
    for (const spentConceptSerial of spentConceptSerials) {
      await this.spentConceptSerialRepository.deleteById(spentConceptSerial.id);
      if (spentConceptSerial.itemSerialId) {
        await this.itemSerialRepository.deleteById(spentConceptSerial.itemSerialId);
      }
    }
  }

  /**
   * Anula el inventario de un gasto cancelado. Rechaza si hay series reservadas o vendidas.
   * @param spentId - UUID del gasto
   * @param occurredAt - Fecha de la cancelación
   */
  async cancelSpentInventory(spentId: string, occurredAt: Date): Promise<void> {
    const spentConcepts = await this.spentConceptRepository.findBySpentId(spentId, [
      'item',
      'serials',
      'serials.itemSerial',
    ]);
    this.assertSpentSerialsAreNotAllocated(spentConcepts);
    for (const spentConcept of spentConcepts) {
      await this.reverseSpentConceptInventory(spentConcept, occurredAt);
    }
  }

  /**
   * Comprueba que un gasto se puede borrar o cancelar.
   * @param spentId - UUID del gasto
   */
  async assertSpentInventoryIsIdle(spentId: string): Promise<void> {
    const spentConcepts = await this.spentConceptRepository.findBySpentId(spentId, [
      'serials',
      'serials.itemSerial',
    ]);
    this.assertSpentSerialsAreNotAllocated(spentConcepts);
  }

  /**
   * Elimina movimientos e identidades de un gasto para poder borrarlo.
   * @param spentId - UUID del gasto
   */
  async purgeSpentInventory(spentId: string): Promise<void> {
    await this.assertSpentInventoryIsIdle(spentId);
    const spentConcepts = await this.spentConceptRepository.findBySpentId(spentId);
    for (const spentConcept of spentConcepts) {
      await this.purgeSpentConceptInventory(spentConcept.id);
    }
  }

  /**
   * Adjunta saldos de kardex a una lista de artículos.
   * @param items - Artículos a enriquecer
   */
  async attachStockBalances(items: Item[]): Promise<void> {
    const itemIds = items.map((item) => item.id).filter((itemId) => Boolean(itemId));
    const balancesByItemId =
      await this.stockMovementRepository.getBalancesByItemIds(itemIds);
    for (const item of items) {
      const itemStockBalance = balancesByItemId.get(item.id) ?? {
        itemId: item.id,
        stockEntries: 0,
        stockExits: 0,
        stockOnHand: 0,
      };
      item.stockEntries = itemStockBalance.stockEntries;
      item.stockExits = itemStockBalance.stockExits;
      item.stockOnHand = itemStockBalance.stockOnHand;
    }
  }

  /**
   * Obtiene el saldo de un artículo.
   * @param itemId - UUID del artículo
   * @returns Saldos de entradas, salidas y existencias
   */
  async getItemStockBalance(itemId: string): Promise<ItemStockBalance> {
    const balancesByItemId = await this.stockMovementRepository.getBalancesByItemIds([
      itemId,
    ]);
    return (
      balancesByItemId.get(itemId) ?? {
        itemId,
        stockEntries: 0,
        stockExits: 0,
        stockOnHand: 0,
      }
    );
  }

  /**
   * Carga una unidad o lanza 404.
   * @param itemSerialId - UUID
   * @returns Unidad persistida
   */
  async loadItemSerialOrThrow(itemSerialId: string): Promise<ItemSerial> {
    const itemSerial = await this.itemSerialRepository.findById(itemSerialId, [
      'item',
      'item.itemCategory',
    ]);
    if (!itemSerial) {
      throw new HttpException(
        'Número de serie de artículo no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    return itemSerial;
  }

  /**
   * Confirma la salida de una línea al emitir.
   * @param invoiceConcept - Línea con artículo y series
   * @param occurredAt - Fecha de emisión
   */
  private async confirmInvoiceConceptIssue(
    invoiceConcept: InvoiceConcept,
    occurredAt: Date,
  ): Promise<void> {
    const item = invoiceConcept.item;
    if (!item) {
      return;
    }
    if (item.serialNumber === true) {
      const invoiceConceptSerials = invoiceConcept.serials ?? [];
      const quantity = invoiceConcept.quantity ?? 1;
      if (invoiceConceptSerials.length !== quantity) {
        throw new HttpException(
          'La cantidad del concepto debe coincidir con el número de series',
          HttpStatus.BAD_REQUEST,
        );
      }
      for (const invoiceConceptSerial of invoiceConceptSerials) {
        const itemSerial = invoiceConceptSerial.itemSerial;
        if (!itemSerial) {
          throw new HttpException(
            'El número de serie de la factura no tiene unidad de inventario',
            HttpStatus.BAD_REQUEST,
          );
        }
        if (
          itemSerial.status !== ItemSerialStatus.RESERVED &&
          itemSerial.status !== ItemSerialStatus.IN_STOCK
        ) {
          throw new HttpException(
            'El número de serie no está disponible para la venta',
            HttpStatus.BAD_REQUEST,
          );
        }
        await this.itemSerialRepository.updateById(itemSerial.id, {
          status: ItemSerialStatus.SOLD,
        });
        await this.createMovement({
          itemId: item.id,
          itemSerialId: itemSerial.id,
          spentConceptId: null,
          invoiceConceptId: invoiceConcept.id,
          quantity: 1,
          direction: StockDirection.OUT,
          type: StockType.SALE,
          occurredAt,
        });
      }
      return;
    }
    if (item.stock === true) {
      await this.createMovement({
        itemId: item.id,
        itemSerialId: null,
        spentConceptId: null,
        invoiceConceptId: invoiceConcept.id,
        quantity: invoiceConcept.quantity ?? 1,
        direction: StockDirection.OUT,
        type: StockType.SALE,
        occurredAt,
      });
    }
  }

  /**
   * Revierte la salida de una línea cancelada.
   * @param invoiceConcept - Línea con artículo y series
   * @param occurredAt - Fecha de cancelación
   */
  private async reverseInvoiceConceptCancellation(
    invoiceConcept: InvoiceConcept,
    occurredAt: Date,
  ): Promise<void> {
    const item = invoiceConcept.item;
    if (!item) {
      await this.releaseInvoiceConceptReservations(invoiceConcept);
      return;
    }
    if (item.serialNumber === true) {
      for (const invoiceConceptSerial of invoiceConcept.serials ?? []) {
        const itemSerial = invoiceConceptSerial.itemSerial;
        if (!itemSerial) {
          continue;
        }
        if (itemSerial.status === ItemSerialStatus.SOLD) {
          await this.itemSerialRepository.updateById(itemSerial.id, {
            status: ItemSerialStatus.IN_STOCK,
          });
          await this.createMovement({
            itemId: item.id,
            itemSerialId: itemSerial.id,
            spentConceptId: null,
            invoiceConceptId: invoiceConcept.id,
            quantity: 1,
            direction: StockDirection.IN,
            type: StockType.REVERSAL,
            occurredAt,
          });
        } else if (itemSerial.status === ItemSerialStatus.RESERVED) {
          await this.releaseReservedSaleSerial(itemSerial);
        }
      }
      return;
    }
    if (item.stock === true) {
      const existingMovements =
        await this.stockMovementRepository.findByInvoiceConceptId(invoiceConcept.id);
      const hasSaleOut = existingMovements.some(
        (stockMovement) =>
          stockMovement.direction === StockDirection.OUT &&
          stockMovement.type === StockType.SALE,
      );
      if (hasSaleOut) {
        await this.createMovement({
          itemId: item.id,
          itemSerialId: null,
          spentConceptId: null,
          invoiceConceptId: invoiceConcept.id,
          quantity: invoiceConcept.quantity ?? 1,
          direction: StockDirection.IN,
          type: StockType.REVERSAL,
          occurredAt,
        });
      }
    }
  }

  /**
   * Libera las reservas de una línea.
   * @param invoiceConcept - Línea con series
   */
  private async releaseInvoiceConceptReservations(
    invoiceConcept: InvoiceConcept,
  ): Promise<void> {
    for (const invoiceConceptSerial of invoiceConcept.serials ?? []) {
      if (invoiceConceptSerial.itemSerial) {
        await this.releaseReservedSaleSerial(invoiceConceptSerial.itemSerial);
      }
    }
  }

  /**
   * Revierte entradas de una línea de gasto cancelado.
   * @param spentConcept - Línea con artículo y series
   * @param occurredAt - Fecha de cancelación
   */
  private async reverseSpentConceptInventory(
    spentConcept: SpentConcept,
    occurredAt: Date,
  ): Promise<void> {
    const item = spentConcept.item;
    for (const spentConceptSerial of spentConcept.serials ?? []) {
      const itemSerial = spentConceptSerial.itemSerial;
      if (!itemSerial) {
        continue;
      }
      await this.itemSerialRepository.updateById(itemSerial.id, {
        status: ItemSerialStatus.VOIDED,
      });
      await this.createMovement({
        itemId: itemSerial.itemId,
        itemSerialId: itemSerial.id,
        spentConceptId: spentConcept.id,
        invoiceConceptId: null,
        quantity: 1,
        direction: StockDirection.OUT,
        type: StockType.REVERSAL,
        occurredAt,
      });
    }
    if (this.itemTracksQuantityStock(item)) {
      await this.createMovement({
        itemId: item.id,
        itemSerialId: null,
        spentConceptId: spentConcept.id,
        invoiceConceptId: null,
        quantity: spentConcept.quantity ?? 1,
        direction: StockDirection.OUT,
        type: StockType.REVERSAL,
        occurredAt,
      });
    }
  }

  /**
   * Carga las líneas de una factura con artículo y series.
   * @param invoiceId - UUID de la factura
   * @returns Líneas con inventario
   */
  private loadInvoiceConceptsForInventory(invoiceId: string): Promise<InvoiceConcept[]> {
    return this.invoiceConceptRepository.findByInvoiceId(invoiceId, [
      'item',
      'serials',
      'serials.itemSerial',
    ]);
  }

  /**
   * Persiste un movimiento de kardex.
   * @param stockMovement - Datos del movimiento
   * @returns Movimiento persistido
   */
  private createMovement(
    stockMovement: Partial<StockMovement>,
  ): Promise<StockMovement> {
    if (!stockMovement.quantity || stockMovement.quantity <= 0) {
      throw new HttpException(
        'La cantidad del movimiento de stock debe ser mayor que 0',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.stockMovementRepository.create(stockMovement);
  }

  /**
   * Elimina una lista de movimientos.
   * @param stockMovements - Movimientos a borrar
   */
  private async deleteMovements(stockMovements: StockMovement[]): Promise<void> {
    for (const stockMovement of stockMovements) {
      await this.stockMovementRepository.deleteById(stockMovement.id);
    }
  }

  /**
   * Impide mutar inventario de un gasto cancelado.
   * @param spentStatus - Estado del gasto
   */
  private assertSpentAllowsInventoryMutation(spentStatus: string): void {
    if (this.isSpentCancelled(spentStatus)) {
      throw new HttpException(
        'No se puede modificar el inventario de un gasto cancelado',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Exige artículo con serie y stock.
   * @param item - Artículo de la línea
   */
  private assertItemTracksSerials(item: Item | null | undefined): void {
    if (!item?.id || item.serialNumber !== true || item.stock !== true) {
      throw new HttpException(
        'Solo se pueden asignar números de serie a conceptos vinculados a un artículo que se gestiona con número de serie',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Indica si el artículo mueve stock por cantidad (sin serie).
   * @param item - Artículo vinculado
   * @returns True si aplica kardex por cantidad
   */
  private itemTracksQuantityStock(item: Item | null | undefined): item is Item {
    return Boolean(item?.id) && item.stock === true && item.serialNumber !== true;
  }

  /**
   * Impide tocar una unidad reservada o vendida.
   * @param itemSerial - Unidad persistida
   */
  private assertItemSerialMutable(itemSerial: ItemSerial): void {
    if (
      itemSerial.status === ItemSerialStatus.RESERVED ||
      itemSerial.status === ItemSerialStatus.SOLD
    ) {
      throw new HttpException(
        'No se puede modificar un número de serie reservado o vendido',
        HttpStatus.CONFLICT,
      );
    }
  }

  /**
   * Comprueba que la unidad pertenece al artículo de la línea.
   * @param itemSerial - Unidad persistida
   * @param itemId - Artículo esperado
   */
  private assertItemSerialBelongsToItem(itemSerial: ItemSerial, itemId: string): void {
    if (itemSerial.itemId !== itemId) {
      throw new HttpException(
        'El número de serie no pertenece a este artículo',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Impide cancelar o borrar un gasto con series reservadas o vendidas.
   * @param spentConcepts - Líneas del gasto
   */
  private assertSpentSerialsAreNotAllocated(spentConcepts: SpentConcept[]): void {
    for (const spentConcept of spentConcepts) {
      for (const spentConceptSerial of spentConcept.serials ?? []) {
        const itemSerialStatus = spentConceptSerial.itemSerial?.status;
        if (
          itemSerialStatus === ItemSerialStatus.RESERVED ||
          itemSerialStatus === ItemSerialStatus.SOLD
        ) {
          throw new HttpException(
            'No se puede anular el gasto porque hay números de serie reservados o vendidos',
            HttpStatus.CONFLICT,
          );
        }
      }
    }
  }
}
