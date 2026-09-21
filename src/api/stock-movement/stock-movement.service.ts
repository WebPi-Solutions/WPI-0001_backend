import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { StockMovementRepository } from 'src/entities/stock-movement/stock-movement-repository.service';
import { StockMovement } from 'src/entities/stock-movement/stock-movement.entity';
import { ItemRepository } from 'src/entities/item/item-repository.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';

/**
 * Servicio de API del kardex. Solo lectura: las escrituras las hace el ledger.
 */
@Injectable()
export class StockMovementService {
  private readonly logger = new Logger(StockMovementService.name);

  constructor(
    private readonly stockMovementRepository: StockMovementRepository,
    private readonly itemRepository: ItemRepository,
    private readonly enterpriseAccessService: EnterpriseAccessService,
  ) {}

  /**
   * Lista movimientos de un artículo de la empresa de la query.
   * @param page - Página
   * @param pageSize - Tamaño de página
   * @param sort - Campo de ordenación
   * @param order - Dirección
   * @param filter - Filtros (incluye itemId)
   * @param relations - Relaciones
   * @returns Página de movimientos
   */
  async findAll(
    page: number,
    pageSize: number,
    sort: string,
    order: 'ASC' | 'DESC',
    filter: Record<string, unknown>,
    relations?: string[],
  ): Promise<PaginatedResponse<StockMovement>> {
    this.logger.log(
      `Obteniendo movimientos de kardex - Página: ${page}, Tamaño: ${pageSize}`,
    );
    return this.stockMovementRepository.findAll(
      page,
      pageSize,
      sort,
      order,
      filter,
      relations,
    );
  }

  /**
   * Obtiene un movimiento por identificador.
   * @param id - UUID
   * @param relations - Relaciones
   * @returns El registro
   */
  async findById(id: string, relations?: string[]): Promise<StockMovement> {
    const relationsWithItem = this.enterpriseAccessService.mergeRelationNames(
      relations,
      ['item', 'item.itemCategory', 'itemSerial'],
    );
    const stockMovement = await this.stockMovementRepository.findById(
      id,
      relationsWithItem,
    );
    if (!stockMovement) {
      throw new HttpException(
        'Movimiento de stock no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    this.assertStockMovementAccessible(stockMovement);
    return stockMovement;
  }

  /**
   * Comprueba que el artículo del listado existe y pertenece a la empresa.
   * @param itemId - UUID del artículo
   * @param expectedEnterpriseId - Empresa de la query
   */
  async assertItemAccessibleForList(
    itemId: string,
    expectedEnterpriseId: string,
  ): Promise<void> {
    const item = await this.itemRepository.findById(itemId, ['itemCategory']);
    if (!item) {
      throw new HttpException('Movimiento de stock no encontrado', HttpStatus.NOT_FOUND);
    }
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      item.itemCategory?.enterpriseId,
      'Movimiento de stock no encontrado',
      { resource: 'items', action: 'read' },
    );
    if (item.itemCategory.enterpriseId !== expectedEnterpriseId) {
      throw new HttpException('Movimiento de stock no encontrado', HttpStatus.NOT_FOUND);
    }
  }

  /**
   * Comprueba tenant y permiso de lectura sobre el movimiento.
   * @param stockMovement - Registro con artículo y categoría
   */
  private assertStockMovementAccessible(stockMovement: StockMovement): void {
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      stockMovement.item?.itemCategory?.enterpriseId,
      'Movimiento de stock no encontrado',
      { resource: 'items', action: 'read' },
    );
  }
}
