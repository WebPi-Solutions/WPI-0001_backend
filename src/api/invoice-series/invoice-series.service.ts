import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InvoiceSeriesRepository } from 'src/entities/invoice-series/invoice-series-repository.service';
import { InvoiceSeries } from 'src/entities/invoice-series/invoice-series.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { DeleteResult } from 'typeorm';

@Injectable()
export class InvoiceSeriesService {
  private readonly logger = new Logger(InvoiceSeriesService.name);

  constructor(private readonly invoiceSeriesRepository: InvoiceSeriesRepository){}

  /**
   * Crea un nuevo serie de facturas
   * @param invoiceSeries - La serie de facturas a crear
   * @returns La serie de facturas creada
   */
  async create(invoiceSeries: InvoiceSeries): Promise<InvoiceSeries> {
    this.logger.log(`Iniciando proceso de creación de serie de facturas: ${invoiceSeries.series}`);
    this.logger.log(`Datos de la serie a crear:`, JSON.stringify(invoiceSeries, null, 2));

    const seriesExists = await this.invoiceSeriesRepository.findBySeriesAndEnterpriseId(invoiceSeries.series, invoiceSeries.enterpriseId);
    if (seriesExists) {
      this.logger.error(`La serie de facturas ${invoiceSeries.series} ya existe para la empresa ${invoiceSeries.enterpriseId}`);
      throw new HttpException(`La serie de facturas ${invoiceSeries.series} ya existe para la empresa ${invoiceSeries.enterpriseId}`, HttpStatus.BAD_REQUEST);
    }

    try {
      const newInvoiceSeries = await this.invoiceSeriesRepository.create(invoiceSeries);
      this.logger.log(`Serie de facturas creada exitosamente con ID: ${newInvoiceSeries.id}`);
      return newInvoiceSeries;
    } catch (error) {
      this.logger.error(`Error al crear serie de facturas ${invoiceSeries.series}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene todas las series de facturas con paginación, filtros y ordenación
   * @param page - El número de página
   * @param pageSize - El tamaño de la página
   * @param sort - El campo por el que ordenar
   * @param order - La dirección de ordenación
   * @param filter - Los filtros a aplicar
   * @param relations - Las relaciones a incluir
   * @returns Las series de facturas encontradas
   */
  async findAll(page: number, pageSize: number, sort: string, order: 'ASC' | 'DESC', filter: Record<string, any>, relations?: string[]): Promise<PaginatedResponse<InvoiceSeries>> {
    this.logger.log(`Obteniendo series de facturas paginadas - Página: ${page}, Tamaño: ${pageSize}, Ordenación: ${sort} ${order}`);
    this.logger.log(`Filtros aplicados:`, JSON.stringify(filter, null, 2));
    
    if (relations && relations.length > 0) {
      this.logger.log(`Incluyendo relaciones: ${relations.join(', ')}`);
    }
    
    const result = await this.invoiceSeriesRepository.findAll(page, pageSize, sort, order, filter, relations);
    this.logger.log(`Series de facturas obtenidas: ${result.items.length} de ${result.total}`);
    return result;
  }

  /**
   * Obtiene una serie de facturas por su ID
   * @param id - El ID de la serie de facturas a obtener
   * @param relations - Las relaciones a incluir
   * @returns La serie de facturas encontrada
   */
  async findById(id: string, relations?: string[]): Promise<InvoiceSeries> {
    this.logger.log(`Buscando serie de facturas por ID: ${id}${relations ? ` con relaciones: [${relations.join(', ')}]` : ''}`);
    
    const invoiceSeries = await this.invoiceSeriesRepository.findById(id, relations);
    
    if (invoiceSeries) {
      this.logger.log(`Serie de facturas encontrada: ${invoiceSeries.series} (ID: ${invoiceSeries.id})`);
    } else {
      this.logger.log(`No se encontró ninguna serie de facturas con ID: ${id}`);
    }
    
    return invoiceSeries;
  }

  /**
   * Actualiza una serie de facturas por su ID
   * @param id - El ID de la serie de facturas a actualizar
   * @param invoiceSeries - La serie de facturas con los datos actualizados
   * @returns La serie de facturas actualizada
   */
  async updateById(id: string, invoiceSeries: InvoiceSeries): Promise<InvoiceSeries> {
    this.logger.log(`Iniciando actualización de serie de facturas con ID: ${id}`);
    this.logger.log(`Datos a actualizar:`, JSON.stringify(invoiceSeries, null, 2));

    const seriesExists = await this.invoiceSeriesRepository.findById(id, ['invoices', 'recurrentEarnings']);
    if(!seriesExists) {
      this.logger.error(`La serie de facturas ${id} no existe`);
      throw new HttpException(`La serie de facturas ${id} no existe`, HttpStatus.NOT_FOUND);
    }

    if(seriesExists.invoices.length > 0 && seriesExists.series !== invoiceSeries.series) {
      this.logger.error(`No se puede modificar la identificación de la serie de facturas porque ya tiene facturas emitidas`);
      throw new HttpException(`No se puede modificar la identificación de la serie de facturas porque ya tiene facturas emitidas`, HttpStatus.BAD_REQUEST);
    }
    
    try {
      const updatedInvoiceSeries = await this.invoiceSeriesRepository.updateById(id, invoiceSeries);
      this.logger.log(`Serie de facturas ${id} actualizada exitosamente`);
      return updatedInvoiceSeries;
    } catch (error) {
      this.logger.error(`Error al actualizar serie de facturas ${id}:`, error);
      throw error;
    }
  }

  /**
   * Elimina una serie de facturas por su ID
   * @param id - El ID de la serie de facturas a eliminar
   * @returns El resultado de la eliminación
   */
  async deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Iniciando eliminación de serie de facturas con ID: ${id}`);


    const seriesExists = await this.invoiceSeriesRepository.findById(id, ['invoices', 'recurrentEarnings']);
    if(!seriesExists) {
      this.logger.error(`La serie de facturas ${id} no existe`);
      throw new HttpException(`La serie de facturas ${id} no existe`, HttpStatus.NOT_FOUND);
    }

    if(seriesExists.invoices.length > 0) {
      this.logger.error(`No se puede eliminar la serie de facturas porque ya tiene facturas emitidas`);
      throw new HttpException(`No se puede eliminar la serie de facturas porque ya tiene facturas emitidas`, HttpStatus.BAD_REQUEST);
    }

    if(seriesExists.recurrentEarnings && seriesExists.recurrentEarnings.length > 0) {
      this.logger.error(`No se puede eliminar la serie de facturas porque tiene ingresos recurrentes asociados`);
      throw new HttpException(`No se puede eliminar la serie de facturas porque tiene ingresos recurrentes asociados`, HttpStatus.BAD_REQUEST);
    }
    
    try {
      const result = await this.invoiceSeriesRepository.deleteById(id);
      this.logger.log(`Serie de facturas ${id} eliminada exitosamente. Filas afectadas: ${result.affected}`);
      return result;
    } catch (error) {
      this.logger.error(`Error al eliminar serie de facturas ${id}:`, error);
      throw error;
    }
  }
}