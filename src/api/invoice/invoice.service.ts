import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ClientRepository } from 'src/entities/client/client-repository.service';
import { InvoiceSeriesRepository } from 'src/entities/invoice-series/invoice-series-repository.service';
import { InvoiceRepository } from 'src/entities/invoice/invoice-repository.service';
import { Invoice, InvoiceStatus } from 'src/entities/invoice/invoice.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { DeleteResult } from 'typeorm';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(private readonly invoiceRepository: InvoiceRepository,
              private readonly clientRepository: ClientRepository,
              private readonly invoiceSeriesRepository: InvoiceSeriesRepository
  ){}

  /**
   * Crea una nueva factura
   * @param invoice - La factura a crear
   * @returns La factura creada
   */
  async create(invoice: Invoice): Promise<Invoice> {
    this.logger.log(`Iniciando proceso de creación de factura`);
    this.logger.log(`Datos de la factura a crear:`, JSON.stringify(invoice, null, 2));

    // Se establecen los datos persistentes de cliente y emisor así como el número de serie de la factura siempre que esta se cree con un estado diferente a borrador (representa que ya fue emitida)
    invoice = await this.setInvoicePersistentData(invoice);
    
    try {
      const newInvoice = await this.invoiceRepository.create(invoice);
      this.logger.log(`Factura creada exitosamente con ID: ${newInvoice.id}`);
      return newInvoice;
    } catch (error) {
      this.logger.error(`Error al crear factura:`, error);
      throw error;
    }
  }

  /**
   * Obtiene todas las facturas con paginación, filtros y ordenación
   * @param page - El número de página
   * @param pageSize - El tamaño de la página
   * @param sort - El campo por el que ordenar
   * @param order - La dirección de ordenación
   * @param filter - Los filtros a aplicar
   * @param relations - Las relaciones a incluir
   * @returns Las facturas encontradas
   */
  async findAll(page: number, pageSize: number, sort: string, order: 'ASC' | 'DESC', filter: Record<string, any>, relations?: string[]): Promise<PaginatedResponse<Invoice>> {
    this.logger.log(`Obteniendo facturas paginadas - Página: ${page}, Tamaño: ${pageSize}, Ordenación: ${sort} ${order}`);
    this.logger.log(`Filtros aplicados:`, JSON.stringify(filter, null, 2));
    
    if (relations && relations.length > 0) {
      this.logger.log(`Incluyendo relaciones: ${relations.join(', ')}`);
    }
    
    const result = await this.invoiceRepository.findAll(page, pageSize, sort, order, filter, relations);
    this.logger.log(`Facturas obtenidas: ${result.items.length} de ${result.total}`);
    return result;
  }

  /**
   * Obtiene una factura por su ID
   * @param id - El ID de la factura a obtener
   * @param relations - Las relaciones a incluir
   * @returns La factura encontrada
   */
  async findById(id: string, relations?: string[]): Promise<Invoice> {
    this.logger.log(`Buscando factura por ID: ${id}${relations ? ` con relaciones: [${relations.join(', ')}]` : ''}`);
    
    const invoice = await this.invoiceRepository.findById(id, relations);
    
    if (invoice) {
      this.logger.log(`Factura encontrada con ID: ${invoice.id}`);
    } else {
      this.logger.log(`No se encontró ninguna factura con ID: ${id}`);
      throw new HttpException(`Factura con ID: ${id} no encontrada`, HttpStatus.NOT_FOUND);
    }
    
    return invoice;
  }

  /**
   * Actualiza una factura por su ID
   * @param id - El ID de la factura a actualizar
   * @param invoice - La factura con los datos actualizados
   * @returns La factura actualizada
   */
  async updateById(id: string, invoice: Invoice): Promise<Invoice> {
    this.logger.log(`Iniciando actualización de factura con ID: ${id}`);
    this.logger.log(`Datos a actualizar:`, JSON.stringify(invoice, null, 2));

    const invoiceToUpdate = await this.invoiceRepository.findById(id);

    if (!invoiceToUpdate) {
      this.logger.error(`Factura no encontrada con ID: ${id}`);
      throw new HttpException('Factura no encontrada', HttpStatus.NOT_FOUND);
    }

    if(invoiceToUpdate.status !== InvoiceStatus.DRAFT) {
      this.logger.error(`No se puede actualizar la factura ${id} porque ya ha sido emitida`);
      throw new HttpException(`No se puede actualizar la factura ${id} porque ya ha sido emitida`, HttpStatus.BAD_REQUEST);
    }

    // Rellena el resto de la factura con los datos de la factura guardada en base de datos. (Evita errores de validación al no tener campos)
    invoice = {
      ...invoiceToUpdate,
      ...invoice
    }
    invoice = await this.setInvoicePersistentData(invoice);
    
    try {
      const updatedInvoice = await this.invoiceRepository.updateById(id, invoice);
      this.logger.log(`Factura ${id} actualizada exitosamente`);
      return updatedInvoice;
    } catch (error) {
      this.logger.error(`Error al actualizar factura ${id}:`, error);
      throw error;
    }
  }

  /**
   * Actualiza el estado de una factura por su ID a un estado diferente a borrador
   * @param id - El ID de la factura a actualizar
   * @param status - El nuevo estado de la factura (diferente a borrador)
   * @returns La factura actualizada
   */
  async updateStatusById(id: string, status: InvoiceStatus): Promise<Invoice> {
    this.logger.log(`Iniciando actualización del estado de la factura con ID: ${id}`);
    this.logger.log(`Estado a actualizar: ${status}`);

    if(!Object.values(InvoiceStatus).includes(status)) {
      this.logger.error(`El nuevo estado de la factura no es válido: ${status}`);
      throw new HttpException(`El nuevo estado de la factura no es válido: ${status}`, HttpStatus.BAD_REQUEST);
    }

    let invoiceToUpdate = await this.invoiceRepository.findById(id, ['client', 'series']);
    if(!invoiceToUpdate) {
      this.logger.error(`Factura no encontrada con ID: ${id}`);
      throw new HttpException(`Factura no encontrada con ID: ${id}`, HttpStatus.NOT_FOUND);
    }

    if(invoiceToUpdate.status !== InvoiceStatus.DRAFT && status === InvoiceStatus.DRAFT) {
      this.logger.error(`No se puede establecer como borrador una factura que ya ha sido emitida`);
      throw new HttpException(`No se puede establecer como borrador una factura que ya ha sido emitida`, HttpStatus.BAD_REQUEST);
    }

    if(invoiceToUpdate.status === InvoiceStatus.DRAFT && status !== InvoiceStatus.DRAFT) {
      this.logger.log(`La factura pasa de estado borrador a estado de emitida, se establece el número de serie de la factura y el resto de datos persistentes`);
      // Mandamos la factura actual reemplazando el status en el objeto para que al setear la información persistente lo tenga en cuenta, ya que para generar el número de factura es necesario
      // un status !== DRAFT que todavía no ha sido asignado para no interferir con las validaciones if.
      invoiceToUpdate = await this.setInvoicePersistentData({...invoiceToUpdate, status: status});
    }

    await this.invoiceRepository.updateById(id, { ...invoiceToUpdate, status });
    
    this.logger.log(`Factura ${id} actualizada exitosamente con estado: ${status} y número de serie: ${invoiceToUpdate.seriesNumber}`);
    return this.findById(id, ['client', 'series']);
  }
  
  /**
   * Elimina una factura por su ID
   * @param id - El ID de la factura a eliminar
   * @returns El resultado de la eliminación
   */
  async deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Iniciando eliminación de factura con ID: ${id}`);

    const invoice = await this.invoiceRepository.findById(id);
    if (!invoice) {
      this.logger.error(`Factura con ID ${id} no encontrada`);
      throw new HttpException(`Factura con ID ${id} no encontrada`, HttpStatus.NOT_FOUND);
    }

    if (invoice.status !== InvoiceStatus.DRAFT) {
      this.logger.error(`No se puede eliminar la factura ${id} porque ya ha sido emitida`);
      throw new HttpException(`No se puede eliminar la factura ${id} porque ya ha sido emitida`, HttpStatus.BAD_REQUEST);
    }
    
    try {
      const result = await this.invoiceRepository.deleteById(id);
      this.logger.log(`Factura ${id} eliminada exitosamente. Filas afectadas: ${result.affected}`);
      return result;
    } catch (error) {
      this.logger.error(`Error al eliminar factura ${id}:`, error);
      throw error;
    }
  }

  /**
   * Asigna los datos persistentes de cliente y emisor a la factura
   * @param invoice - La factura a la que se le asignan los datos persistentes
   * @returns La factura con los datos persistentes asignados
   */
  async setInvoicePersistentData(invoice: Invoice): Promise<Invoice> {
    const clientId = invoice.client.id || invoice.clientId;
    if(!clientId) {
      this.logger.error(`La factura debe tener un cliente`);
      throw new HttpException(`La factura debe tener un cliente`, HttpStatus.BAD_REQUEST);
    }

    if(invoice.status !== InvoiceStatus.DRAFT) {
      const seriesId = invoice.seriesId;
      if(!seriesId) {
        this.logger.error(`La factura debe tener una serie cuando no está en estado borrador`);
        throw new HttpException(`La factura debe tener una serie cuando no está en estado borrador`, HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`La factura pasa a estado de emitida, se establece el número de serie de la factura`);
      invoice.seriesNumber = await this.setInvoiceSeriesNumber(invoice);

      this.logger.log(`Asignando los datos persistentes de cliente y emisor a la factura. Cliente ID: ${invoice.clientId}, Serie ID: ${invoice.seriesId}`);
      
      const client = await this.clientRepository.findById(clientId);
      if(!client) {
        this.logger.error(`Cliente no encontrado con ID: ${clientId}`);
        throw new HttpException(`Cliente no encontrado con ID: ${clientId}`, HttpStatus.NOT_FOUND);
      }
      this.logger.log(`Cliente para asignar datos persistentes encontrado:`, JSON.stringify(client, null, 2));
      invoice.clientName = client.name;
      invoice.clientNif = client.nif;
      if(client.address) invoice.clientAddress = client.address;

      const invoiceSeries = await this.invoiceSeriesRepository.findById(seriesId, ['enterprise']);
      if(!invoiceSeries) {
        this.logger.error(`Serie de factura no encontrada con ID: ${seriesId}`);
        throw new HttpException(`Serie de factura no encontrada con ID: ${seriesId}`, HttpStatus.NOT_FOUND);
      }
      this.logger.log(`Serie de factura para asignar datos persistentes encontrada:`, JSON.stringify(invoiceSeries, null, 2));
      invoice.issuerName = invoiceSeries.enterprise.name;
      invoice.issuerNif = invoiceSeries.enterprise.nif;
      if(invoiceSeries.enterprise.address) invoice.issuerAddress = invoiceSeries.enterprise.address;
      if(invoiceSeries.enterprise.bankAccount) invoice.issuerBankAccount = invoiceSeries.enterprise.bankAccount;

      this.logger.log(`Datos de la factura tras asignar los datos persistentes de cliente y emisor:`, JSON.stringify(invoice, null, 2));
    }

    else {
      invoice.seriesNumber = null;
      this.logger.warn(`No se establece el número de serie ni los datos persistentes de la factura porque está en estado de borrador`);
    }

    return invoice;
  }

  /**
   * Establece el número de serie de la factura
   * @param invoice - La factura a la que se le establece el número de serie
   * @returns El número de serie de la factura
   */
  async setInvoiceSeriesNumber(invoice: Invoice): Promise<number> {
    this.logger.log(`Iniciando proceso de cálculo del número de serie de la factura`);
    let invoiceSeriesNumber: number;

    this.logger.log(`Obtenemos todas las facturas de la serie ${invoice.series.id} para establecer el número de serie`);
    const invoices = (await this.invoiceRepository.findAll(1, null, 'seriesNumber', 'ASC', { seriesId: invoice.series.id })).items
      .filter(i => i.seriesNumber); // Filtramos para obtener sólo las facturas que ya tienen un número de serie asignado
    if(invoices.length > 0) {
      const lastInvoice = invoices.sort((a, b) => b.seriesNumber - a.seriesNumber)[0]
      invoiceSeriesNumber = lastInvoice.seriesNumber + 1;
      this.logger.log(`Número de factura a establecer: ${invoiceSeriesNumber}. Facturas encontradas: ${invoices.length}. Último número de serie: ${lastInvoice.seriesNumber}`);
    }
    else {
      invoiceSeriesNumber = 1;
      this.logger.log(`No hay facturas en la serie ${invoice.series.id}. Número de factura a establecer: ${invoiceSeriesNumber}`);
    }

    return invoiceSeriesNumber;
  }
}

