import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { DeleteResult } from 'typeorm';
import { SpentConceptSerialRepository } from 'src/entities/spent-concept-serial/spent-concept-serial-repository.service';
import { SpentConceptSerial } from 'src/entities/spent-concept-serial/spent-concept-serial.entity';
import { SpentConceptRepository } from 'src/entities/spent-concept/spent-concept-repository.service';
import { SpentConcept } from 'src/entities/spent-concept/spent-concept.entity';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { PermissionAction } from 'src/common/helpers/enterprise-permission/permission.catalog';
import { InventoryLedgerService } from 'src/common/helpers/inventory/inventory-ledger.service';

/**
 * Servicio de API de números de serie de línea de gasto.
 * El tenant se resuelve a través de la línea → gasto → proveedor.
 * El alta crea la identidad canónica y el movimiento de entrada.
 */
@Injectable()
export class SpentConceptSerialService {
  private readonly logger = new Logger(SpentConceptSerialService.name);

  constructor(
    private readonly spentConceptSerialRepository: SpentConceptSerialRepository,
    private readonly spentConceptRepository: SpentConceptRepository,
    private readonly enterpriseAccessService: EnterpriseAccessService,
    private readonly inventoryLedgerService: InventoryLedgerService,
  ) {}

  /**
   * Crea un número de serie en una línea de la empresa de la query.
   * @param spentConceptSerial - Datos del número de serie
   * @param expectedEnterpriseId - Empresa de la query
   * @returns El registro persistido
   */
  async create(
    spentConceptSerial: SpentConceptSerial,
    expectedEnterpriseId: string,
  ): Promise<SpentConceptSerial> {
    this.logger.log('Iniciando creación de número de serie de línea');
    const accessibleSpentConcept = await this.resolveAccessibleSpentConcept(
      spentConceptSerial,
      'write',
      expectedEnterpriseId,
    );
    this.assertLineAllowsSerialNumbers(accessibleSpentConcept);
    await this.assertSerialCountWithinQuantity(accessibleSpentConcept);

    const normalizedSerialNumber = this.inventoryLedgerService.normalizeSerialNumber(
      spentConceptSerial.serialNumber,
    );
    const createdItemSerial = await this.inventoryLedgerService.registerPurchaseSerial(
      accessibleSpentConcept.item,
      accessibleSpentConcept,
      accessibleSpentConcept.spent.status,
      normalizedSerialNumber,
      this.resolveSpentOccurredAt(accessibleSpentConcept),
    );

    const persistencePayload: Partial<SpentConceptSerial> = {
      spentConceptId: accessibleSpentConcept.id,
      itemSerialId: createdItemSerial.id,
      serialNumber: createdItemSerial.serialNumber,
    };

    try {
      const createdSerial = await this.spentConceptSerialRepository.create(
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
   * Lista números de serie. El controlador fuerza `spentConceptId` y el tenant.
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
  ): Promise<PaginatedResponse<SpentConceptSerial>> {
    this.logger.log(
      `Obteniendo números de serie de línea - Página: ${page}, Tamaño: ${pageSize}`,
    );
    const result = await this.spentConceptSerialRepository.findAll(
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
  async findById(id: string, relations?: string[]): Promise<SpentConceptSerial> {
    const relationsWithConcept = this.enterpriseAccessService.mergeRelationNames(
      relations,
      ['spentConcept', 'spentConcept.spent', 'spentConcept.spent.supplier'],
    );
    const spentConceptSerial = await this.spentConceptSerialRepository.findById(
      id,
      relationsWithConcept,
    );
    if (!spentConceptSerial) {
      this.logger.log(`No se encontró ningún número de serie de línea con ID: ${id}`);
      throw new HttpException(
        'Número de serie de concepto no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    this.assertSerialAccessible(spentConceptSerial, 'read');
    return spentConceptSerial;
  }

  /**
   * Actualiza un número de serie. Congela `spentConceptId`.
   * @param id - UUID
   * @param spentConceptSerial - Campos a actualizar
   * @returns El registro actualizado
   */
  async updateById(
    id: string,
    spentConceptSerial: SpentConceptSerial,
  ): Promise<SpentConceptSerial> {
    this.logger.log(`Iniciando actualización de número de serie de línea con ID: ${id}`);
    const existingSerial = await this.spentConceptSerialRepository.findById(id, [
      'spentConcept',
      'spentConcept.spent',
      'spentConcept.spent.supplier',
      'itemSerial',
    ]);
    if (!existingSerial) {
      throw new HttpException(
        'Número de serie de concepto no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    this.assertSerialAccessible(existingSerial, 'write');
    if (this.inventoryLedgerService.isSpentCancelled(existingSerial.spentConcept?.spent?.status)) {
      throw new HttpException(
        'No se puede modificar el inventario de un gasto cancelado',
        HttpStatus.BAD_REQUEST,
      );
    }

    const persistencePayload: Partial<SpentConceptSerial> = {};
    if (spentConceptSerial.serialNumber !== undefined) {
      const normalizedSerialNumber = this.inventoryLedgerService.normalizeSerialNumber(
        spentConceptSerial.serialNumber,
      );
      const updatedItemSerial = await this.inventoryLedgerService.renamePurchaseSerial(
        existingSerial.itemSerial,
        normalizedSerialNumber,
      );
      persistencePayload.serialNumber = updatedItemSerial.serialNumber;
    }

    try {
      const updatedSerial = await this.spentConceptSerialRepository.updateById(
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
   * Elimina un número de serie.
   * @param id - UUID
   * @returns Resultado del borrado
   */
  async deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Iniciando eliminación de número de serie de línea con ID: ${id}`);
    const existingSerial = await this.spentConceptSerialRepository.findById(id, [
      'spentConcept',
      'spentConcept.spent',
      'spentConcept.spent.supplier',
      'itemSerial',
    ]);
    if (!existingSerial) {
      throw new HttpException(
        'Número de serie de concepto no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    this.assertSerialAccessible(existingSerial, 'delete');
    if (this.inventoryLedgerService.isSpentCancelled(existingSerial.spentConcept?.spent?.status)) {
      throw new HttpException(
        'No se puede modificar el inventario de un gasto cancelado',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const result = await this.spentConceptSerialRepository.deleteById(id);
      if (existingSerial.itemSerial) {
        await this.inventoryLedgerService.removePurchaseSerial(existingSerial.itemSerial);
      }
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
   * @param spentConceptId - UUID de la línea
   * @param expectedEnterpriseId - Empresa de la query
   */
  async assertSpentConceptAccessibleForList(
    spentConceptId: string,
    expectedEnterpriseId: string,
  ): Promise<void> {
    const spentConcept = await this.spentConceptRepository.findById(spentConceptId, [
      'spent',
      'spent.supplier',
    ]);
    if (!spentConcept) {
      throw new HttpException(
        'Número de serie de concepto no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      spentConcept.spent?.supplier?.enterpriseId,
      'Número de serie de concepto no encontrado',
      { resource: 'spents', action: 'read' },
    );
    if (spentConcept.spent.supplier.enterpriseId !== expectedEnterpriseId) {
      throw new HttpException(
        'Número de serie de concepto no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  /**
   * Carga la línea referenciada y comprueba tenant, permiso y empresa de la query.
   * @param spentConceptSerial - Registro a persistir
   * @param action - Acción del catálogo
   * @param expectedEnterpriseId - Empresa de la query
   * @returns Línea con gasto y proveedor cargados
   */
  private async resolveAccessibleSpentConcept(
    spentConceptSerial: SpentConceptSerial,
    action: PermissionAction,
    expectedEnterpriseId: string,
  ): Promise<SpentConcept> {
    const spentConceptIds = this.collectUniqueIdentifiers(
      spentConceptSerial.spentConceptId,
      spentConceptSerial.spentConcept?.id,
    );
    if (spentConceptIds.length === 0) {
      throw new HttpException(
        'El número de serie debe pertenecer a un concepto de gasto',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (spentConceptIds.length !== 1) {
      throw new HttpException(
        'Número de serie de concepto no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    const spentConcept = await this.spentConceptRepository.findById(
      spentConceptIds[0],
      ['spent', 'spent.supplier', 'item'],
    );
    if (!spentConcept) {
      throw new HttpException(
        'Número de serie de concepto no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      spentConcept.spent?.supplier?.enterpriseId,
      'Número de serie de concepto no encontrado',
      { resource: 'spents', action },
    );
    if (spentConcept.spent.supplier.enterpriseId !== expectedEnterpriseId) {
      throw new HttpException(
        'Número de serie de concepto no encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    return spentConcept;
  }

  /**
   * Solo las líneas vinculadas a un artículo con `serialNumber` admiten series.
   * @param spentConcept - Línea con `item` cargado
   */
  private assertLineAllowsSerialNumbers(spentConcept: SpentConcept): void {
    if (!spentConcept.itemId || spentConcept.item?.serialNumber !== true) {
      this.logger.error(
        `La línea ${spentConcept.id} no admite números de serie`,
      );
      throw new HttpException(
        'Solo se pueden asignar números de serie a conceptos vinculados a un artículo que se gestiona con número de serie',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Impide crear más series que unidades de la línea.
   * @param spentConcept - Línea con `quantity`
   */
  private async assertSerialCountWithinQuantity(
    spentConcept: SpentConcept,
  ): Promise<void> {
    const serialCount = await this.spentConceptSerialRepository.countBySpentConceptId(
      spentConcept.id,
    );
    const quantity = spentConcept.quantity ?? 1;
    if (serialCount >= quantity) {
      this.logger.error(
        `La línea ${spentConcept.id} ya tiene ${serialCount} series para cantidad ${quantity}`,
      );
      throw new HttpException(
        'El número de series no puede superar la cantidad del concepto',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Comprueba tenant y permiso sobre el número de serie.
   * @param spentConceptSerial - Registro con relaciones de gasto cargadas
   * @param action - Acción del catálogo
   */
  private assertSerialAccessible(
    spentConceptSerial: SpentConceptSerial,
    action: PermissionAction,
  ): void {
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      spentConceptSerial.spentConcept?.spent?.supplier?.enterpriseId,
      'Número de serie de concepto no encontrado',
      { resource: 'spents', action },
    );
  }

  /**
   * Fecha del movimiento de compra: emisión del gasto o ahora.
   * @param spentConcept - Línea con gasto cargado
   * @returns Fecha del movimiento
   */
  private resolveSpentOccurredAt(spentConcept: SpentConcept): Date {
    const issuedDate = spentConcept.spent?.issuedDate;
    if (issuedDate) {
      return new Date(issuedDate);
    }
    return new Date();
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
