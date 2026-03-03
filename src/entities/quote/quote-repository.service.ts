import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Quote, QuoteStatus } from './quote.entity';
import { DeleteResult, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryBuilderService, QueryFilterOptions } from 'src/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { Concept } from 'src/models/Concept';
import { QuoteSubtotalsByStatusDto, QuoteStatusMetricsDto } from 'src/api/metrics/dto/quote-subtotals-by-status.dto';

@Injectable()
export class QuoteRepository {

  private readonly logger = new Logger(QuoteRepository.name);

  constructor(@InjectRepository(Quote) private quoteRepository: Repository<Quote>){}

  /**
   * Crea una nueva cotización
   * @param quote - La cotización a crear
   * @returns La cotización creada
   */
  create(quote: Quote): Promise<Quote> {
    return this.quoteRepository.save(quote);
  }

  /**
   * Obtiene todas las cotizaciones con paginación, filtros y ordenación
   * @param page - Número de página
   * @param pageSize - Tamaño de página
   * @param sort - Campo por el que ordenar
   * @param order - Dirección de ordenación
   * @param filter - Filtros a aplicar
   * @param relations - Las relaciones a incluir
   * @returns Respuesta paginada con las cotizaciones
   */
  findAll(
    page: number = 1,
    pageSize: number = 10,
    sort: string = 'issuedDate',
    order: 'ASC' | 'DESC' = 'DESC',
    filter: Record<string, any> = {},
    relations?: string[]
  ): Promise<PaginatedResponse<Quote>> {

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
      this.quoteRepository,
      'quote',
      options
    );
  }

  /**
   * Obtiene una cotización por su ID
   * @param id - El ID de la cotización a buscar
   * @param relations - Las relaciones a incluir
   * @returns La cotización si se encuentra, de lo contrario null
   */
  findById(id: string, relations?: string[]): Promise<Quote> {
    return this.quoteRepository.findOne({ where: { id }, relations });
  }

  /**
   * Actualiza una cotización existente por su ID
   * @param id - El ID de la cotización a actualizar
   * @param quote - La cotización con datos actualizados
   * @returns La cotización actualizada
   */
  async updateById(id: string, quote: Quote): Promise<Quote> {
    // Verifica que el estado de la cotización sea válido
    this.verifyQuoteStatus(quote);

    // Verifica que los conceptos sean válidos
    this.validateConcepts(quote.concepts);

    // Obtiene la cotización a actualizar
    const quoteToUpdate = await this.quoteRepository.findOne({ where: { id } });

    // Si la cotización no existe, se lanza un error
    if (!quoteToUpdate) {
      throw new HttpException('Cotización no encontrada', HttpStatus.NOT_FOUND);
    }

    // Actualiza la cotización
    await this.quoteRepository.save({ ...quoteToUpdate, ...quote });

    // Devuelve la cotización actualizada con las relaciones incluidas
    return this.findById(id, ['client', 'invoices']);
  }

  /**
   * Elimina una cotización por su ID
   * @param id - El ID de la cotización a eliminar
   * @returns El resultado de la operación de eliminación
   */
  deleteById(id: string): Promise<DeleteResult> {
    return this.quoteRepository.delete(id);
  }

  private verifyQuoteStatus(quote: Quote): void {
    if(!Object.values(QuoteStatus).includes(quote.status as QuoteStatus)) {
      this.logger.error(`El estado de la cotización no es válido: ${quote.status}`);
      throw new HttpException(`El estado de la cotización no es válido: ${quote.status}`, HttpStatus.BAD_REQUEST);
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
   * Obtiene cotizaciones emitidas con sus conceptos en un rango de fechas para cálculo de métricas
   * @param startDate - Fecha de inicio (inclusive)
   * @param endDate - Fecha de fin (inclusive)
   * @param enterpriseId - ID de la empresa
   * @returns Array de cotizaciones con sus conceptos
   */
  async getNonDraftQuotesForMetrics(startDate: Date, endDate: Date, enterpriseId: string): Promise<Quote[]> {
    this.logger.log(`Obteniendo cotizaciones emitidas desde ${startDate.toISOString()} hasta ${endDate.toISOString()} para empresa ${enterpriseId}`);

    // Consulta optimizada que obtiene solo los conceptos de cotizaciones emitidas en el rango de fechas
    const result = await this.quoteRepository
      .createQueryBuilder('quote')
      .leftJoin('quote.client', 'client')
      .select([
        'quote.concepts',
        'quote.id',
        'quote.issuedDate',
        'quote.name'
      ])
      .where('quote.status != :status', { status: QuoteStatus.DRAFT })
      .andWhere('quote.issuedDate >= :startDate', { startDate })
      .andWhere('quote.issuedDate <= :endDate', { endDate })
      .andWhere('client.enterpriseId = :enterpriseId', { enterpriseId })
      .getMany();

    this.logger.log(`Encontradas ${result.length} cotizaciones emitidas en el rango de fechas`);
    return result;
  }

  /**
   * Obtiene los importes imponibles (subtotales) de presupuestos desglosados por estado
   * mediante consulta SQL con agregación en base de datos (GROUP BY status).
   * Aplica los mismos filtros que la vista de presupuestos.
   * El subtotal por concepto se calcula como: base_price * quantity.
   * @param enterpriseId - ID de la empresa
   * @param filter - Filtros aplicados (status, client.id, fechas, búsquedas)
   * @returns Subtotales y conteos por estado (total, draft, issued, converted, rejected)
   */
  async getQuoteSubtotalsByStatus(
    enterpriseId: string,
    filter: Record<string, any> = {}
  ): Promise<QuoteSubtotalsByStatusDto> {
    this.logger.log(`Obteniendo subtotales por estado (SQL) para empresa ${enterpriseId}`);

    const { whereClause, parameters } = this.buildSubtotalsWhereClause(enterpriseId, filter);

    const sql = `
      SELECT
        q.status,
        COUNT(*)::int AS count,
        ROUND(CAST(SUM(
          (SELECT COALESCE(SUM((elem->>'base_price')::numeric * COALESCE((elem->>'quantity')::int, 1)), 0)
           FROM jsonb_array_elements(COALESCE(q.concepts, '[]'::jsonb)) elem)
        ) AS numeric), 2) AS subtotal
      FROM quotes q
      INNER JOIN clients c ON q.client_id = c.id
      WHERE ${whereClause}
      GROUP BY q.status
    `;

    const rows = await this.quoteRepository.manager.query(sql, parameters);

    const createEmptyMetrics = (): QuoteStatusMetricsDto => ({
      count: 0,
      subtotal: 0,
    });

    const metrics: QuoteSubtotalsByStatusDto = {
      total: createEmptyMetrics(),
      draft: createEmptyMetrics(),
      issued: createEmptyMetrics(),
      converted: createEmptyMetrics(),
      rejected: createEmptyMetrics(),
    };

    for (const row of rows) {
      const status = String(row.status || QuoteStatus.DRAFT).toLowerCase();
      const count = Number(row.count) || 0;
      const subtotal = Number(row.subtotal) || 0;

      metrics.total.count += count;
      metrics.total.subtotal += subtotal;

      if (status in metrics && status !== 'total') {
        metrics[status as keyof QuoteSubtotalsByStatusDto].count = count;
        metrics[status as keyof QuoteSubtotalsByStatusDto].subtotal = subtotal;
      }
    }

    metrics.total.subtotal = Math.round(metrics.total.subtotal * 100) / 100;
    const statusKeys = ['draft', 'issued', 'converted', 'rejected'] as const;
    statusKeys.forEach((key) => {
      metrics[key].subtotal = Math.round(metrics[key].subtotal * 100) / 100;
    });

    this.logger.log(`Subtotales por estado calculados (SQL): total=${metrics.total.count} presupuestos, subtotal=${metrics.total.subtotal}€`);
    return metrics;
  }

  /**
   * Construye la cláusula WHERE y los parámetros para la consulta de subtotales.
   * Replica la lógica de filtros de la vista de presupuestos.
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
        conditions.push(`q.status IN (${statuses.map(() => `$${paramIndex++}`).join(', ')})`);
      }
    }

    if (filter['client.id'] != null) {
      const clientIds = Array.isArray(filter['client.id']) ? filter['client.id'] : [filter['client.id']];
      if (clientIds.length > 0) {
        parameters.push(...clientIds);
        conditions.push(`q.client_id IN (${clientIds.map(() => `$${paramIndex++}`).join(', ')})`);
      }
    }

    if (filter.issuedDate_from) {
      conditions.push(`q.issued_date >= ${addParam(filter.issuedDate_from)}`);
    }
    if (filter.issuedDate_to) {
      conditions.push(`q.issued_date <= ${addParam(filter.issuedDate_to)}`);
    }
    if (filter.formalizationDate_from) {
      conditions.push(`q.formalization_date >= ${addParam(filter.formalizationDate_from)}`);
    }
    if (filter.formalizationDate_to) {
      conditions.push(`q.formalization_date <= ${addParam(filter.formalizationDate_to)}`);
    }
    if (filter.createdAt_from) {
      conditions.push(`q.created_at >= ${addParam(filter.createdAt_from)}`);
    }
    if (filter.createdAt_to) {
      conditions.push(`q.created_at <= ${addParam(filter.createdAt_to)}`);
    }
    if (filter.updatedAt_from) {
      conditions.push(`q.updated_at >= ${addParam(filter.updatedAt_from)}`);
    }
    if (filter.updatedAt_to) {
      conditions.push(`q.updated_at <= ${addParam(filter.updatedAt_to)}`);
    }
    if (filter.name_ilike) {
      conditions.push(`LOWER(q.name) LIKE LOWER(${addParam(`%${filter.name_ilike}%`)})`);
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