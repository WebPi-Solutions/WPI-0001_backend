import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Invoice, InvoiceStatus } from './invoice.entity';
import { DeleteResult, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryBuilderService, QueryFilterOptions, QueryRelation } from 'src/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { Concept } from 'src/models/Concept';
import { InvoiceSubtotalsByStatusDto, InvoiceStatusMetricsDto } from 'src/api/metrics/dto';

@Injectable()
export class InvoiceRepository {

  private readonly logger = new Logger(InvoiceRepository.name);

  constructor(@InjectRepository(Invoice) private invoiceRepository: Repository<Invoice>){}

  /**
   * Crea una nueva factura
   * @param invoice - La factura a crear
   * @returns La factura creada
   */
  create(invoice: Invoice): Promise<Invoice> {
    // Verifica que el estado de la factura sea válido
    this.verifyInvoiceStatus(invoice);

    // Verifica que los conceptos sean válidos
    this.validateConcepts(invoice.concepts);

    return this.invoiceRepository.save(invoice);
  }

  /**
   * Obtiene todas las facturas con paginación, filtros y ordenación
   * @param page - Número de página
   * @param pageSize - Tamaño de página
   * @param sort - Campo por el que ordenar
   * @param order - Dirección de ordenación
   * @param filter - Filtros a aplicar
   * @param relations - Las relaciones a incluir
   * @returns Respuesta paginada con las facturas
   */
  findAll(
    page: number = 1,
    pageSize: number = 10,
    sort: string = 'issuedDate',
    order: 'ASC' | 'DESC' = 'DESC',
    filter: Record<string, any> = {},
    relations?: string[]
  ): Promise<PaginatedResponse<Invoice>> {

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
      this.invoiceRepository,
      'invoice',
      options
    );
  }

  /**
   * Obtiene una factura por su ID
   * @param id - El ID de la factura a buscar
   * @param relations - Las relaciones a incluir
   * @returns La factura si se encuentra, de lo contrario null
   */
  findById(id: string, relations?: string[]): Promise<Invoice> {
    return this.invoiceRepository.findOne({ where: { id }, relations });
  }

  /**
   * Actualiza una factura existente por su ID
   * @param id - El ID de la factura a actualizar
   * @param invoice - La factura con datos actualizados
   * @returns La factura actualizada
   */
  async updateById(id: string, invoice: Invoice): Promise<Invoice> {
    // Verifica que el estado de la factura sea válido
    this.verifyInvoiceStatus(invoice);

    // Verifica que los conceptos sean válidos
    this.validateConcepts(invoice.concepts);

    // Obtiene la factura a actualizar
    const invoiceToUpdate = await this.invoiceRepository.findOne({ where: { id } });

    // Si la factura no existe, se lanza un error
    if (!invoiceToUpdate) {
      throw new HttpException('Factura no encontrada', HttpStatus.NOT_FOUND);
    }

    // Actualiza la factura
    await this.invoiceRepository.save({ ...invoiceToUpdate, ...invoice });

    // Devuelve la factura actualizada con las relaciones incluidas
    return this.findById(id, ['client', 'series']);
  }

  /**
   * Elimina una factura por su ID
   * @param id - El ID de la factura a eliminar
   * @returns El resultado de la operación de eliminación
   */
  deleteById(id: string): Promise<DeleteResult> {
    return this.invoiceRepository.delete(id);
  }

  private verifyInvoiceStatus(invoice: Invoice): void {
    if(!Object.values(InvoiceStatus).includes(invoice.status as InvoiceStatus)) {
      this.logger.error(`El estado de la factura no es válido: ${invoice.status}`);
      throw new HttpException(`El estado de la factura no es válido: ${invoice.status}`, HttpStatus.BAD_REQUEST);
    }
  }

  private validateConcepts(concepts: Concept[]): void {
    // concepts.forEach(concept => {
    //   if(!Object.values(ConceptVats).some(vat => vat.value === concept.vat)) {
    //     this.logger.error(`El IVA del concepto no es válido: ${concept.vat}`);
    //     throw new HttpException(`El IVA del concepto no es válido: ${concept.vat}`, HttpStatus.BAD_REQUEST);
    //   }

    //   if(!Object.values(ConceptIrpfs).some(irpf => irpf.value === concept.irpf)) {
    //     this.logger.error(`El IRPF del concepto no es válido: ${concept.irpf}`);
    //     throw new HttpException(`El IRPF del concepto no es válido: ${concept.irpf}`, HttpStatus.BAD_REQUEST);
    //   }

    //   if(concept.quantity <= 0) {
    //     this.logger.error(`La cantidad del concepto no es válida: ${concept.quantity}`);
    //     throw new HttpException(`La cantidad del concepto no es válida: ${concept.quantity}`, HttpStatus.BAD_REQUEST);
    //   }

    //   if(concept.base_price <= 0) {
    //     this.logger.error(`El precio base del concepto no es válido: ${concept.base_price}`);
    //     throw new HttpException(`El precio base del concepto no es válido: ${concept.base_price}`, HttpStatus.BAD_REQUEST);
    //   }
    // });
  }

  /**
   * Obtiene facturas emitidas con sus conceptos en un rango de fechas para cálculo de métricas
   * @param startDate - Fecha de inicio (inclusive)
   * @param endDate - Fecha de fin (inclusive)
   * @param enterpriseId - ID de la empresa
   * @returns Array de facturas con sus conceptos
   */
  async getNonDraftInvoicesForMetrics(startDate: Date, endDate: Date, enterpriseId: string): Promise<Invoice[]> {
    this.logger.log(`Obteniendo facturas emitidas desde ${startDate.toISOString()} hasta ${endDate.toISOString()} para empresa ${enterpriseId}`);

    // Consulta optimizada que obtiene solo los conceptos de facturas emitidas en el rango de fechas
    const result = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoin('invoice.client', 'client')
      .select([
        'invoice.concepts',
        'invoice.id',
        'invoice.issuedDate',
        'invoice.name'
      ])
      .where('invoice.status != :status', { status: InvoiceStatus.DRAFT })
      .andWhere('invoice.issuedDate >= :startDate', { startDate })
      .andWhere('invoice.issuedDate <= :endDate', { endDate })
      .andWhere('client.enterpriseId = :enterpriseId', { enterpriseId })
      .getMany();

    this.logger.log(`Encontradas ${result.length} facturas emitidas en el rango de fechas`);
    return result;
  }

  /**
   * Obtiene los importes imponibles (subtotales) de facturas desglosados por estado
   * mediante consulta SQL con agregación en base de datos (GROUP BY status).
   * Aplica los mismos filtros que la vista de facturas.
   * @param enterpriseId - ID de la empresa
   * @param filter - Filtros aplicados (status, series.id, client.id, fechas, búsquedas)
   * @returns Subtotales y conteos por estado (total, draft, issued, paid, partially_paid, cancelled)
   */
  async getInvoiceSubtotalsByStatus(
    enterpriseId: string,
    filter: Record<string, any> = {}
  ): Promise<InvoiceSubtotalsByStatusDto> {
    this.logger.log(`Obteniendo subtotales por estado (SQL) para empresa ${enterpriseId}`);

    const { whereClause, parameters } = this.buildSubtotalsWhereClause(enterpriseId, filter);

    const sql = `
      SELECT
        i.status,
        COUNT(*)::int AS count,
        ROUND(CAST(SUM(
          (SELECT COALESCE(SUM((elem->>'base_price')::numeric * COALESCE((elem->>'quantity')::int, 1)), 0)
           FROM jsonb_array_elements(COALESCE(i.concepts, '[]'::jsonb)) elem)
        ) AS numeric), 2) AS subtotal
      FROM invoices i
      INNER JOIN clients c ON i.client_id = c.id
      LEFT JOIN invoice_series s ON i.series_id = s.id
      WHERE ${whereClause}
      GROUP BY i.status
    `;

    const rows = await this.invoiceRepository.manager.query(sql, parameters);

    const createEmptyMetrics = (): InvoiceStatusMetricsDto => ({
      count: 0,
      subtotal: 0,
    });

    const metrics: InvoiceSubtotalsByStatusDto = {
      total: createEmptyMetrics(),
      draft: createEmptyMetrics(),
      issued: createEmptyMetrics(),
      paid: createEmptyMetrics(),
      partially_paid: createEmptyMetrics(),
      cancelled: createEmptyMetrics(),
    };

    for (const row of rows) {
      const status = String(row.status || InvoiceStatus.DRAFT).toLowerCase();
      const count = Number(row.count) || 0;
      const subtotal = Number(row.subtotal) || 0;

      metrics.total.count += count;
      metrics.total.subtotal += subtotal;

      if (status in metrics && status !== 'total') {
        metrics[status as keyof InvoiceSubtotalsByStatusDto].count = count;
        metrics[status as keyof InvoiceSubtotalsByStatusDto].subtotal = subtotal;
      }
    }

    metrics.total.subtotal = Math.round(metrics.total.subtotal * 100) / 100;
    const statusKeys = ['draft', 'issued', 'paid', 'partially_paid', 'cancelled'] as const;
    statusKeys.forEach((key) => {
      metrics[key].subtotal = Math.round(metrics[key].subtotal * 100) / 100;
    });

    this.logger.log(`Subtotales por estado calculados (SQL): total=${metrics.total.count} facturas, subtotal=${metrics.total.subtotal}€`);
    return metrics;
  }

  /**
   * Construye la cláusula WHERE y los parámetros para la consulta de subtotales.
   * Replica la lógica de filtros de la vista de facturas.
   * @param enterpriseId - ID de la empresa
   * @param filter - Filtros aplicados
   * @returns Objeto con whereClause (string) y parameters (array para query parametrizada)
   */
  private buildSubtotalsWhereClause(
    enterpriseId: string,
    filter: Record<string, any>
  ): { whereClause: string; parameters: any[] } {
    const conditions: string[] = ['c.enterprise_id = $1'];
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
        conditions.push(`i.status IN (${statuses.map(() => `$${paramIndex++}`).join(', ')})`);
      }
    }

    if (filter['series.id'] != null) {
      const seriesIds = Array.isArray(filter['series.id']) ? filter['series.id'] : [filter['series.id']];
      if (seriesIds.length > 0) {
        parameters.push(...seriesIds);
        conditions.push(`i.series_id IN (${seriesIds.map(() => `$${paramIndex++}`).join(', ')})`);
      }
    }

    if (filter['client.id'] != null) {
      const clientIds = Array.isArray(filter['client.id']) ? filter['client.id'] : [filter['client.id']];
      if (clientIds.length > 0) {
        parameters.push(...clientIds);
        conditions.push(`i.client_id IN (${clientIds.map(() => `$${paramIndex++}`).join(', ')})`);
      }
    }

    if (filter.issuedDate_from) {
      conditions.push(`i.issued_date >= ${addParam(filter.issuedDate_from)}`);
    }
    if (filter.issuedDate_to) {
      conditions.push(`i.issued_date <= ${addParam(filter.issuedDate_to)}`);
    }
    if (filter.createdAt_from) {
      conditions.push(`i.created_at >= ${addParam(filter.createdAt_from)}`);
    }
    if (filter.createdAt_to) {
      conditions.push(`i.created_at <= ${addParam(filter.createdAt_to)}`);
    }
    if (filter.updatedAt_from) {
      conditions.push(`i.updated_at >= ${addParam(filter.updatedAt_from)}`);
    }
    if (filter.updatedAt_to) {
      conditions.push(`i.updated_at <= ${addParam(filter.updatedAt_to)}`);
    }
    if (filter.name_ilike) {
      conditions.push(`LOWER(i.name) LIKE LOWER(${addParam(`%${filter.name_ilike}%`)})`);
    }
    if (filter['client.name_ilike']) {
      conditions.push(`LOWER(c.name) LIKE LOWER(${addParam(`%${filter['client.name_ilike']}%`)})`);
    }

    return {
      whereClause: conditions.join(' AND '),
      parameters,
    };
  }
}