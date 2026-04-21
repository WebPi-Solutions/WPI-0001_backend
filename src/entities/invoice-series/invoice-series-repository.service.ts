import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InvoiceSeries } from './invoice-series.entity';
import { DeleteResult, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryBuilderService, QueryFilterOptions, QueryRelation } from 'src/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';

@Injectable()
export class InvoiceSeriesRepository {

  constructor(@InjectRepository(InvoiceSeries) private invoiceSeriesRepository: Repository<InvoiceSeries>){}

  /**
   * Crea una nueva serie de factura
   * @param invoiceSeries - La serie de factura a crear
   * @returns La serie de factura creada
   */
  create(invoiceSeries: InvoiceSeries): Promise<InvoiceSeries> {
    return this.invoiceSeriesRepository.save(invoiceSeries);
  }

  /**
   * Cuenta series con los mismos filtros que el listado.
   */
  async count(
    filter: Record<string, any> = {},
    relations?: string[],
  ): Promise<number> {
    const queryRelations: QueryRelation[] | undefined = relations
      ? relations.map((relation) => ({
          property: relation,
          alias: relation,
          isLeftJoinAndSelect: false,
        }))
      : undefined;
    return QueryBuilderService.getCount(
      this.invoiceSeriesRepository,
      'invoiceSeries',
      filter,
      queryRelations,
    );
  }

  /**
   * Conteos para tarjetas: total filtrado, rango mes calendario y rango última semana (created_at).
   */
  async getListViewCounts(
    enterpriseId: string,
    filter: Record<string, unknown>,
    monthRange: { from: string; to: string },
    weekRange: { from: string; to: string },
  ): Promise<{ total: number; thisMonth: number; lastWeek: number }> {
    const base: Record<string, unknown> = { enterpriseId, ...filter };
    const [total, thisMonth, lastWeek] = await Promise.all([
      this.count(base as Record<string, any>),
      this.count({
        ...base,
        createdAt_from: monthRange.from,
        createdAt_to: monthRange.to,
      } as Record<string, any>),
      this.count({
        ...base,
        createdAt_from: weekRange.from,
        createdAt_to: weekRange.to,
      } as Record<string, any>),
    ]);
    return { total, thisMonth, lastWeek };
  }

  /**
   * Obtiene todas las series de facturas con paginación, filtros y ordenación
   * @param page - Número de página
   * @param pageSize - Tamaño de página
   * @param sort - Campo por el que ordenar
   * @param order - Dirección de ordenación
   * @param filter - Filtros a aplicar
   * @param relations - Las relaciones a incluir
   * @returns Respuesta paginada con las series de facturas
   */
  findAll(
    page: number = 1,
    pageSize: number = 10,
    sort: string = 'series',
    order: 'ASC' | 'DESC' = 'ASC',
    filter: Record<string, any> = {},
    relations?: string[]
  ): Promise<PaginatedResponse<InvoiceSeries>> {

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
      this.invoiceSeriesRepository,
      'invoiceSeries',
      options
    );
  }

  /**
   * Obtiene una serie de factura por su ID
   * @param id - El ID de la serie de factura a buscar
   * @param relations - Las relaciones a incluir
   * @returns La serie de factura si se encuentra, de lo contrario null
   */
  findById(id: string, relations?: string[]): Promise<InvoiceSeries> {
    return this.invoiceSeriesRepository.findOne({ where: { id }, relations });
  }

  /**
   * Obtiene una serie de factura por su serie y ID de empresa
   * @param series - La serie de factura a buscar
   * @param enterpriseId - El ID de la empresa a buscar
   * @returns La serie de factura si se encuentra, de lo contrario null
   */
  findBySeriesAndEnterpriseId(series: string, enterpriseId: string): Promise<InvoiceSeries> {
    return this.invoiceSeriesRepository.findOne({ where: { series, enterpriseId } });
  }

  /**
   * Actualiza una serie de factura existente por su ID
   * @param id - El ID de la serie de factura a actualizar
   * @param invoiceSeries - La serie de factura con datos actualizados
   * @returns La serie de factura actualizada
   */
  async updateById(id: string, invoiceSeries: InvoiceSeries): Promise<InvoiceSeries> {
    // Obtiene la serie de factura a actualizar
    const invoiceSeriesToUpdate = await this.invoiceSeriesRepository.findOne({ where: { id } });

    // Si la serie de factura no existe, se lanza un error
    if (!invoiceSeriesToUpdate) {
      throw new HttpException('Serie de factura no encontrada', HttpStatus.NOT_FOUND);
    }

    // Actualiza la serie de factura
    await this.invoiceSeriesRepository.save({ ...invoiceSeriesToUpdate, ...invoiceSeries });

    // Devuelve la serie de factura actualizada con las relaciones incluidas
    return this.findById(id);
  }

  /**
   * Elimina una serie de factura por su ID
   * @param id - El ID de la serie de factura a eliminar
   * @returns El resultado de la operación de eliminación
   */
  deleteById(id: string): Promise<DeleteResult> {
    return this.invoiceSeriesRepository.delete(id);
  }
}
