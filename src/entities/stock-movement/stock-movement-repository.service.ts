import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeleteResult, Repository } from 'typeorm';
import { QueryBuilderService, QueryFilterOptions } from 'src/common/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { StockDirection } from 'src/common/enums';
import { StockMovement } from './stock-movement.entity';

/**
 * Saldos de kardex agregados por artículo.
 */
export interface ItemStockBalance {
  /**
   * UUID del artículo
   */
  itemId: string;
  /**
   * Suma de cantidades de entrada
   */
  stockEntries: number;
  /**
   * Suma de cantidades de salida
   */
  stockExits: number;
  /**
   * Existencias (entradas menos salidas)
   */
  stockOnHand: number;
}

/**
 * Repositorio de acceso a datos para el kardex (`stock_movements`).
 */
@Injectable()
export class StockMovementRepository {
  private readonly logger = new Logger(StockMovementRepository.name);

  constructor(
    @InjectRepository(StockMovement)
    private readonly stockMovementRepository: Repository<StockMovement>,
  ) {}

  /**
   * Crea un movimiento de kardex
   * @param entity - Datos del movimiento
   * @returns Registro persistido
   */
  create(entity: Partial<StockMovement>): Promise<StockMovement> {
    this.logger.log(
      `Creando movimiento ${entity.direction} de ${entity.quantity} para el artículo ${entity.itemId}`,
    );
    return this.stockMovementRepository.save(entity);
  }

  /**
   * Listado paginado de movimientos
   * @param page - Página
   * @param pageSize - Tamaño de página
   * @param sort - Campo de ordenación
   * @param order - ASC o DESC
   * @param filter - Filtros
   * @param relations - Relaciones
   * @returns Página de resultados
   */
  findAll(
    page: number = 1,
    pageSize: number = 10,
    sort: string = 'occurredAt',
    order: 'DESC' | 'ASC' = 'DESC',
    filter: Record<string, unknown> = {},
    relations?: string[],
  ): Promise<PaginatedResponse<StockMovement>> {
    const options: QueryFilterOptions = {
      page,
      pageSize,
      sort,
      order,
      filter,
      relations: (relations ?? []).map((relation) => ({
        property: relation,
        alias: relation,
        isLeftJoinAndSelect: true,
      })),
    };

    return QueryBuilderService.getPaginatedResults(
      this.stockMovementRepository,
      'stockMovement',
      options,
    );
  }

  /**
   * Busca un movimiento por identificador
   * @param id - UUID
   * @param relations - Relaciones opcionales
   * @returns Registro o null
   */
  findById(id: string, relations?: string[]): Promise<StockMovement | null> {
    this.logger.log(`Buscando movimiento de kardex por id: ${id}`);
    return this.stockMovementRepository.findOne({ where: { id }, relations });
  }

  /**
   * Lista los movimientos de una línea de gasto.
   * @param spentConceptId - UUID de la línea
   * @returns Movimientos encontrados
   */
  findBySpentConceptId(spentConceptId: string): Promise<StockMovement[]> {
    this.logger.log(`Listando movimientos de la línea de gasto ${spentConceptId}`);
    return this.stockMovementRepository.find({ where: { spentConceptId } });
  }

  /**
   * Lista los movimientos de una línea de factura.
   * @param invoiceConceptId - UUID de la línea
   * @returns Movimientos encontrados
   */
  findByInvoiceConceptId(invoiceConceptId: string): Promise<StockMovement[]> {
    this.logger.log(`Listando movimientos de la línea de factura ${invoiceConceptId}`);
    return this.stockMovementRepository.find({ where: { invoiceConceptId } });
  }

  /**
   * Lista los movimientos de una unidad serializada.
   * @param itemSerialId - UUID del número de serie
   * @returns Movimientos encontrados
   */
  findByItemSerialId(itemSerialId: string): Promise<StockMovement[]> {
    this.logger.log(`Listando movimientos del número de serie ${itemSerialId}`);
    return this.stockMovementRepository.find({ where: { itemSerialId } });
  }

  /**
   * Agrega entradas, salidas y existencias por artículo.
   * @param itemIds - UUIDs de artículos
   * @returns Saldos indexados por artículo
   */
  async getBalancesByItemIds(itemIds: string[]): Promise<Map<string, ItemStockBalance>> {
    const uniqueItemIds = [...new Set(itemIds.filter((itemId) => Boolean(itemId)))];
    const balancesByItemId = new Map<string, ItemStockBalance>();
    for (const itemId of uniqueItemIds) {
      balancesByItemId.set(itemId, {
        itemId,
        stockEntries: 0,
        stockExits: 0,
        stockOnHand: 0,
      });
    }
    if (uniqueItemIds.length === 0) {
      return balancesByItemId;
    }

    this.logger.log(`Agregando kardex de ${uniqueItemIds.length} artículos`);
    const aggregatedRows: Array<{
      itemId: string;
      stockEntries: string | number;
      stockExits: string | number;
    }> = await this.stockMovementRepository
      .createQueryBuilder('stockMovement')
      .select('stockMovement.item_id', 'itemId')
      .addSelect(
        `COALESCE(SUM(CASE WHEN stockMovement.direction = :inDirection THEN stockMovement.quantity ELSE 0 END), 0)`,
        'stockEntries',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN stockMovement.direction = :outDirection THEN stockMovement.quantity ELSE 0 END), 0)`,
        'stockExits',
      )
      .where('stockMovement.item_id IN (:...itemIds)', { itemIds: uniqueItemIds })
      .setParameters({
        inDirection: StockDirection.IN,
        outDirection: StockDirection.OUT,
      })
      .groupBy('stockMovement.item_id')
      .getRawMany();

    for (const aggregatedRow of aggregatedRows) {
      const stockEntries = Number(aggregatedRow.stockEntries) || 0;
      const stockExits = Number(aggregatedRow.stockExits) || 0;
      balancesByItemId.set(aggregatedRow.itemId, {
        itemId: aggregatedRow.itemId,
        stockEntries,
        stockExits,
        stockOnHand: stockEntries - stockExits,
      });
    }
    return balancesByItemId;
  }

  /**
   * Elimina los movimientos de una línea de gasto.
   * @param spentConceptId - UUID de la línea
   * @returns Resultado del borrado
   */
  deleteBySpentConceptId(spentConceptId: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando movimientos de la línea de gasto ${spentConceptId}`);
    return this.stockMovementRepository.delete({ spentConceptId });
  }

  /**
   * Elimina los movimientos de una línea de factura.
   * @param invoiceConceptId - UUID de la línea
   * @returns Resultado del borrado
   */
  deleteByInvoiceConceptId(invoiceConceptId: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando movimientos de la línea de factura ${invoiceConceptId}`);
    return this.stockMovementRepository.delete({ invoiceConceptId });
  }

  /**
   * Elimina los movimientos de una unidad serializada.
   * @param itemSerialId - UUID del número de serie
   * @returns Resultado del borrado
   */
  deleteByItemSerialId(itemSerialId: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando movimientos del número de serie ${itemSerialId}`);
    return this.stockMovementRepository.delete({ itemSerialId });
  }

  /**
   * Elimina un movimiento por identificador
   * @param id - UUID
   * @returns Resultado del borrado
   */
  deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando movimiento de kardex id: ${id}`);
    return this.stockMovementRepository.delete(id);
  }
}
