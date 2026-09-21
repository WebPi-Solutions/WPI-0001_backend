import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ItemSerialRepository } from 'src/entities/item-serial/item-serial-repository.service';
import { ItemSerial } from 'src/entities/item-serial/item-serial.entity';
import { ItemRepository } from 'src/entities/item/item-repository.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { ItemSerialStatus, isValidItemSerialStatus } from 'src/common/enums';
import { InventoryLedgerService } from 'src/common/helpers/inventory/inventory-ledger.service';

/**
 * Servicio de API de números de serie canónicos de artículo.
 * Solo lectura: las mutaciones ocurren al registrar gastos y facturas.
 */
@Injectable()
export class ItemSerialService {
  private readonly logger = new Logger(ItemSerialService.name);

  constructor(
    private readonly itemSerialRepository: ItemSerialRepository,
    private readonly itemRepository: ItemRepository,
    private readonly enterpriseAccessService: EnterpriseAccessService,
    private readonly inventoryLedgerService: InventoryLedgerService,
  ) {}

  /**
   * Lista números de serie de un artículo de la empresa de la query.
   * @param page - Página
   * @param pageSize - Tamaño de página
   * @param sort - Campo de ordenación
   * @param order - Dirección
   * @param filter - Filtros (incluye itemId)
   * @param relations - Relaciones
   * @returns Página de números de serie
   */
  async findAll(
    page: number,
    pageSize: number,
    sort: string,
    order: 'ASC' | 'DESC',
    filter: Record<string, unknown>,
    relations?: string[],
  ): Promise<PaginatedResponse<ItemSerial>> {
    this.logger.log(
      `Obteniendo números de serie de artículo - Página: ${page}, Tamaño: ${pageSize}`,
    );
    return this.itemSerialRepository.findAll(
      page,
      pageSize,
      sort,
      order,
      filter,
      relations,
    );
  }

  /**
   * Obtiene un número de serie por identificador.
   * @param id - UUID
   * @param relations - Relaciones
   * @returns El registro
   */
  async findById(id: string, relations?: string[]): Promise<ItemSerial> {
    const relationsWithItem = this.enterpriseAccessService.mergeRelationNames(
      relations,
      ['item', 'item.itemCategory'],
    );
    const itemSerial = await this.inventoryLedgerService.loadItemSerialOrThrow(id);
    this.assertItemSerialAccessible(itemSerial, 'read');
    if (relationsWithItem.length > 2) {
      const reloadedItemSerial = await this.itemSerialRepository.findById(
        id,
        relationsWithItem,
      );
      if (!reloadedItemSerial) {
        throw new HttpException(
          'Número de serie de artículo no encontrado',
          HttpStatus.NOT_FOUND,
        );
      }
      this.assertItemSerialAccessible(reloadedItemSerial, 'read');
      return reloadedItemSerial;
    }
    return itemSerial;
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
      throw new HttpException(
        'Número de serie de artículo no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      item.itemCategory?.enterpriseId,
      'Número de serie de artículo no encontrado',
      { resource: 'items', action: 'read' },
    );
    if (item.itemCategory.enterpriseId !== expectedEnterpriseId) {
      throw new HttpException(
        'Número de serie de artículo no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  /**
   * Parsea el filtro de estado de la query.
   * @param rawStatus - Valor recibido
   * @returns Estado válido o undefined
   */
  parseStatusFilter(rawStatus: string | undefined): ItemSerialStatus | undefined {
    if (!rawStatus) {
      return undefined;
    }
    const trimmedStatus = rawStatus.trim();
    if (!isValidItemSerialStatus(trimmedStatus)) {
      throw new HttpException(
        'El estado del número de serie no es válido',
        HttpStatus.BAD_REQUEST,
      );
    }
    return trimmedStatus;
  }

  /**
   * Comprueba tenant y permiso sobre la unidad.
   * @param itemSerial - Registro con artículo y categoría
   * @param action - Acción del catálogo
   */
  private assertItemSerialAccessible(
    itemSerial: ItemSerial,
    action: 'read',
  ): void {
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      itemSerial.item?.itemCategory?.enterpriseId,
      'Número de serie de artículo no encontrado',
      { resource: 'items', action },
    );
  }
}
