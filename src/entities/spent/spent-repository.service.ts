import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Spent } from './spent.entity';
import { DeleteResult, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryBuilderService, QueryFilterOptions, QueryRelation } from 'src/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { SpentSubtotalsByStatusDto, SpentStatusMetricsDto } from 'src/api/metrics/dto/spent-subtotals-by-status.dto';

@Injectable()
export class SpentRepository {
  private readonly logger = new Logger(SpentRepository.name);

  constructor(@InjectRepository(Spent) private spentRepository: Repository<Spent>){}

  /**
   * Crea un nuevo gasto
   * @param spent - El gasto a crear
   * @returns El gasto creado
   */
  create(spent: Spent): Promise<Spent> {
    return this.spentRepository.save(spent);
  }

  /**
   * Obtiene todos los gastos con paginación, filtros y ordenación
   * @param page - Número de página
   * @param pageSize - Tamaño de página
   * @param sort - Campo por el que ordenar
   * @param order - Dirección de ordenación
   * @param filter - Filtros a aplicar
   * @param relations - Las relaciones a incluir
   * @returns Respuesta paginada con los gastos
   */
  findAll(
    page: number = 1,
    pageSize: number = 10,
    sort: string = 'issuedDate',
    order: 'ASC' | 'DESC' = 'DESC',
    filter: Record<string, any> = {},
    relations?: string[]
  ): Promise<PaginatedResponse<Spent>> {

    // Configurar opciones para el QueryBuilderService
    const options: QueryFilterOptions = {
      page,
      pageSize,
      sort,
      order,
      filter,
      relations: (relations || []).map(relation => ({
        property: relation,
        alias: relation,
        isLeftJoinAndSelect: true
      }))
    };

    // Usar el servicio genérico para construir la consulta
    return QueryBuilderService.getPaginatedResults(
      this.spentRepository,
      'spent',
      options
    );
  }

  /**
   * Obtiene un gasto por su ID
   * @param id - El ID del gasto a buscar
   * @param relations - Las relaciones a incluir
   * @returns El gasto si se encuentra, de lo contrario null
   */
  findById(id: string, relations?: string[]): Promise<Spent> {
    return this.spentRepository.findOne({ where: { id }, relations });
  }

  /**
   * Actualiza un gasto existente por su ID
   * @param id - El ID del gasto a actualizar
   * @param spent - El gasto con datos actualizados
   * @returns El gasto actualizado
   */
  async updateById(id: string, spent: Spent): Promise<Spent> {
    // Obtiene el gasto a actualizar
    const spentToUpdate = await this.spentRepository.findOne({ where: { id } });

    // Si el gasto no existe, se lanza un error
    if (!spentToUpdate) {
      throw new HttpException('Gasto no encontrado', HttpStatus.NOT_FOUND);
    }

    // Actualiza el gasto
    await this.spentRepository.save({ ...spentToUpdate, ...spent });

    // Devuelve el gasto actualizado con las relaciones incluidas
    return this.findById(id);
  }

  /**
   * Elimina un gasto por su ID
   * @param id - El ID del gasto a eliminar
   * @returns El resultado de la operación de eliminación
   */
  deleteById(id: string): Promise<DeleteResult> {
    return this.spentRepository.delete(id);
  }

  /**
   * Obtiene la ruta del archivo del gasto en Dropbox por su empresa y gasto
   * @param enterpriseId - ID de la empresa
   * @param spentId - ID del gasto
   * @returns La ruta del archivo del gasto en Dropbox
   */
  getSpentFilePath(enterpriseId: string, spentId: string): string {
    return `${process.env.DROPBOX_SPENT_FILE_PATH.replace(':enterpriseId', enterpriseId).replace(':spentId', spentId)}.pdf`;
  }

  /**
   * Obtiene gastos con sus conceptos en un rango de fechas para cálculo de métricas
   * Utiliza la fecha de declaración (declarationDate) en lugar de la fecha de emisión,
   * ya que para el balance importa cuándo se declaró el gasto.
   * @param startDate - Fecha de inicio (inclusive)
   * @param endDate - Fecha de fin (inclusive)
   * @param enterpriseId - ID de la empresa
   * @returns Array de gastos con sus conceptos
   */
  async getSpentsForMetrics(startDate: Date, endDate: Date, enterpriseId: string): Promise<Spent[]> {
    this.logger.log(`Obteniendo gastos desde ${startDate.toISOString()} hasta ${endDate.toISOString()} para empresa ${enterpriseId} (usando declarationDate)`);

    // Consulta optimizada que obtiene solo los conceptos de gastos en el rango de fechas de declaración
    const result = await this.spentRepository
      .createQueryBuilder('spent')
      .leftJoin('spent.supplier', 'supplier')
      .select([
        'spent.concepts',
        'spent.id'
      ])
      .where('spent.declarationDate >= :startDate', { startDate })
      .andWhere('spent.declarationDate <= :endDate', { endDate })
      .andWhere('supplier.enterpriseId = :enterpriseId', { enterpriseId })
      .getMany();

    this.logger.log(`Encontrados ${result.length} gastos en el rango de fechas de declaración`);
    return result;
  }

  /**
   * Obtiene los importes imponibles (subtotales) de gastos desglosados por estado
   * mediante consulta SQL con agregación en base de datos (GROUP BY status).
   * Aplica los mismos filtros que la vista de gastos.
   * El subtotal por concepto se calcula como: base_price * quantity * (percentage/100).
   * @param enterpriseId - ID de la empresa
   * @param filter - Filtros aplicados (status, supplier.id, fechas, búsquedas)
   * @returns Subtotales y conteos por estado (total, pending, paid, partially_paid, cancelled)
   */
  async getSpentSubtotalsByStatus(
    enterpriseId: string,
    filter: Record<string, any> = {}
  ): Promise<SpentSubtotalsByStatusDto> {
    this.logger.log(`Obteniendo subtotales por estado (SQL) para empresa ${enterpriseId}`);

    const { whereClause, parameters } = this.buildSubtotalsWhereClause(enterpriseId, filter);

    const sql = `
      SELECT
        s.status,
        COUNT(*)::int AS count,
        ROUND(CAST(SUM(
          (SELECT COALESCE(SUM(
            (elem->>'base_price')::numeric * COALESCE((elem->>'quantity')::int, 1)
            * COALESCE((elem->>'percentage')::numeric, 100) / 100
          ), 0)
           FROM jsonb_array_elements(COALESCE(s.concepts, '[]'::jsonb)) elem)
        ) AS numeric), 2) AS subtotal
      FROM spents s
      INNER JOIN suppliers sup ON s.supplier_id = sup.id
      WHERE ${whereClause}
      GROUP BY s.status
    `;

    const rows = await this.spentRepository.manager.query(sql, parameters);

    const createEmptyMetrics = (): SpentStatusMetricsDto => ({
      count: 0,
      subtotal: 0,
    });

    const metrics: SpentSubtotalsByStatusDto = {
      total: createEmptyMetrics(),
      pending: createEmptyMetrics(),
      paid: createEmptyMetrics(),
      partially_paid: createEmptyMetrics(),
      cancelled: createEmptyMetrics(),
    };

    for (const row of rows) {
      const status = String(row.status || 'pending').toLowerCase();
      const count = Number(row.count) || 0;
      const subtotal = Number(row.subtotal) || 0;

      metrics.total.count += count;
      metrics.total.subtotal += subtotal;

      if (status in metrics && status !== 'total') {
        metrics[status as keyof SpentSubtotalsByStatusDto].count = count;
        metrics[status as keyof SpentSubtotalsByStatusDto].subtotal = subtotal;
      }
    }

    metrics.total.subtotal = Math.round(metrics.total.subtotal * 100) / 100;
    const statusKeys = ['pending', 'paid', 'partially_paid', 'cancelled'] as const;
    statusKeys.forEach((key) => {
      metrics[key].subtotal = Math.round(metrics[key].subtotal * 100) / 100;
    });

    this.logger.log(`Subtotales por estado calculados (SQL): total=${metrics.total.count} gastos, subtotal=${metrics.total.subtotal}€`);
    return metrics;
  }

  /**
   * Construye la cláusula WHERE y los parámetros para la consulta de subtotales.
   * Replica la lógica de filtros de la vista de gastos.
   * @param enterpriseId - ID de la empresa
   * @param filter - Filtros aplicados
   * @returns Objeto con whereClause (string) y parameters (array para query parametrizada)
   */
  private buildSubtotalsWhereClause(
    enterpriseId: string,
    filter: Record<string, any>
  ): { whereClause: string; parameters: any[] } {
    const conditions: string[] = ['sup.enterprise_id = $1'];
    const parameters: any[] = [enterpriseId];
    let paramIndex = 2;

    const addParam = (value: any): string => {
      parameters.push(value);
      return `$${paramIndex++}`;
    };

    if (filter.status != null) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      if (statuses.length > 0) {
        parameters.push(...statuses);
        conditions.push(`s.status IN (${statuses.map(() => `$${paramIndex++}`).join(', ')})`);
      }
    }

    if (filter['supplier.id'] != null) {
      const supplierIds = Array.isArray(filter['supplier.id']) ? filter['supplier.id'] : [filter['supplier.id']];
      if (supplierIds.length > 0) {
        parameters.push(...supplierIds);
        conditions.push(`s.supplier_id IN (${supplierIds.map(() => `$${paramIndex++}`).join(', ')})`);
      }
    }

    if (filter.issuedDate_from) {
      conditions.push(`s.issued_date >= ${addParam(filter.issuedDate_from)}`);
    }
    if (filter.issuedDate_to) {
      conditions.push(`s.issued_date <= ${addParam(filter.issuedDate_to)}`);
    }
    if (filter.declarationDate_from) {
      conditions.push(`s.declaration_date >= ${addParam(filter.declarationDate_from)}`);
    }
    if (filter.declarationDate_to) {
      conditions.push(`s.declaration_date <= ${addParam(filter.declarationDate_to)}`);
    }
    if (filter.createdAt_from) {
      conditions.push(`s.created_at >= ${addParam(filter.createdAt_from)}`);
    }
    if (filter.createdAt_to) {
      conditions.push(`s.created_at <= ${addParam(filter.createdAt_to)}`);
    }
    if (filter.updatedAt_from) {
      conditions.push(`s.updated_at >= ${addParam(filter.updatedAt_from)}`);
    }
    if (filter.updatedAt_to) {
      conditions.push(`s.updated_at <= ${addParam(filter.updatedAt_to)}`);
    }
    if (filter.name_ilike) {
      conditions.push(`LOWER(s.name) LIKE LOWER(${addParam(`%${filter.name_ilike}%`)})`);
    }
    if (filter['supplier.name_ilike']) {
      conditions.push(`LOWER(sup.name) LIKE LOWER(${addParam(`%${filter['supplier.name_ilike']}%`)})`);
    }

    return {
      whereClause: conditions.join(' AND '),
      parameters,
    };
  }
}