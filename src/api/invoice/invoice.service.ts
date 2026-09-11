import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ClientRepository } from 'src/entities/client/client-repository.service';
import { InvoiceSeriesRepository } from 'src/entities/invoice-series/invoice-series-repository.service';
import { InvoiceRepository } from 'src/entities/invoice/invoice-repository.service';
import { Invoice, InvoiceStatus } from 'src/entities/invoice/invoice.entity';
import { RecurrentEarningRepository } from 'src/entities/recurrent-earning/recurrent-earning-repository.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { DeleteResult } from 'typeorm';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(private readonly invoiceRepository: InvoiceRepository,
              private readonly clientRepository: ClientRepository,
              private readonly invoiceSeriesRepository: InvoiceSeriesRepository,
              private readonly recurrentEarningRepository: RecurrentEarningRepository,
              private readonly enterpriseAccessService: EnterpriseAccessService,
  ){}

  /**
   * Crea una nueva factura
   * @param invoice - La factura a crear
   * @returns La factura creada
   */
  async create(invoice: Invoice): Promise<Invoice> {
    this.logger.log(`Iniciando proceso de creación de factura`);
    this.logger.log(`Datos de la factura a crear:`, JSON.stringify(invoice, null, 2));

    await this.assertInvoiceTenantAccessible(invoice);
    invoice = await this.setInvoicePersistentData(invoice);
    await this.validateRecurrentEarningLink(invoice);
    
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
    
    const relationsWithClient = this.enterpriseAccessService.mergeRelationNames(
      relations,
      ['client'],
    );
    const invoice = await this.invoiceRepository.findById(id, relationsWithClient);
    
    if (invoice) {
      this.logger.log(`Factura encontrada con ID: ${invoice.id}`);
      this.assertInvoiceAccessible(invoice, 'read');
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

    const invoiceToUpdate = await this.invoiceRepository.findById(id, ['client']);

    if (!invoiceToUpdate) {
      this.logger.error(`Factura no encontrada con ID: ${id}`);
      throw new HttpException('Factura no encontrada', HttpStatus.NOT_FOUND);
    }

    this.assertInvoiceAccessible(invoiceToUpdate, 'write');

    if(invoiceToUpdate.status !== InvoiceStatus.DRAFT) {
      this.logger.error(`No se puede actualizar la factura ${id} porque ya ha sido emitida`);
      throw new HttpException(`No se puede actualizar la factura ${id} porque ya ha sido emitida`, HttpStatus.BAD_REQUEST);
    }

    // Rellena el resto de la factura con los datos de la factura guardada en base de datos. (Evita errores de validación al no tener campos)
    invoice = {
      ...invoiceToUpdate,
      ...invoice
    }
    // Revalida cliente y serie tras el merge: el cuerpo puede retargetear FKs a otra empresa.
    await this.assertInvoiceTenantAccessible(invoice);
    invoice = await this.setInvoicePersistentData(invoice);
    await this.validateRecurrentEarningLink(invoice);
    
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

    this.assertInvoiceAccessible(invoiceToUpdate, 'write');

    if(invoiceToUpdate.status !== InvoiceStatus.DRAFT && status === InvoiceStatus.DRAFT) {
      this.logger.error(`No se puede establecer como borrador una factura que ya ha sido emitida`);
      throw new HttpException(`No se puede establecer como borrador una factura que ya ha sido emitida`, HttpStatus.BAD_REQUEST);
    }

    if(invoiceToUpdate.status === InvoiceStatus.DRAFT && status !== InvoiceStatus.DRAFT) {
      this.logger.log(`La factura pasa de estado borrador a estado de emitida, se establece el número de serie de la factura y el resto de datos persistentes`);
      // Impide emitir copiando NIF/banco de una serie de otra empresa (dato legado o payload manipulado).
      await this.assertInvoiceTenantAccessible(invoiceToUpdate);
      // Mandamos la factura actual reemplazando el status en el objeto para que al setear la información persistente lo tenga en cuenta, ya que para generar el número de factura es necesario
      // un status !== DRAFT que todavía no ha sido asignado para no interferir con las validaciones if.
      invoiceToUpdate = await this.setInvoicePersistentData({...invoiceToUpdate, status: status});
    }

    await this.invoiceRepository.updateById(id, { ...invoiceToUpdate, status });
    
    this.logger.log(`Factura ${id} actualizada exitosamente con estado: ${status} y número de serie: ${invoiceToUpdate.seriesNumber}`);
    return this.findById(id, ['client', 'series', 'recurrentEarning']);
  }
  
  /**
   * Elimina una factura por su ID
   * @param id - El ID de la factura a eliminar
   * @returns El resultado de la eliminación
   */
  async deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Iniciando eliminación de factura con ID: ${id}`);

    const invoice = await this.invoiceRepository.findById(id, ['client']);
    if (!invoice) {
      this.logger.error(`Factura con ID ${id} no encontrada`);
      throw new HttpException(`Factura con ID ${id} no encontrada`, HttpStatus.NOT_FOUND);
    }

    this.assertInvoiceAccessible(invoice, 'delete');

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
    const clientId = invoice.clientId ?? invoice.client?.id;
    if(!clientId) {
      this.logger.error(`La factura debe tener un cliente`);
      throw new HttpException(`La factura debe tener un cliente`, HttpStatus.BAD_REQUEST);
    }

    const seriesId = invoice.seriesId ?? invoice.series?.id;
    if (!seriesId) {
      this.logger.error('La factura debe tener una serie');
      throw new HttpException('La factura debe tener una serie', HttpStatus.BAD_REQUEST);
    }
    invoice.seriesId = seriesId;

    if(invoice.status !== InvoiceStatus.DRAFT) {

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
   * Valida que el ingreso recurrente, si se informa, exista y pertenezca al mismo cliente de la factura.
   * @param invoice - La factura cuyo vínculo se comprueba
   */
  async validateRecurrentEarningLink(invoice: Invoice): Promise<void> {
    const recurrentEarningId = invoice.recurrentEarningId ?? invoice.recurrentEarning?.id;
    if (!recurrentEarningId) {
      invoice.recurrentEarningId = null;
      return;
    }

    invoice.recurrentEarningId = recurrentEarningId;
    const recurrentEarning = await this.recurrentEarningRepository.findById(recurrentEarningId);
    if (!recurrentEarning) {
      this.logger.error(`Ingreso recurrente no encontrado con ID: ${recurrentEarningId}`);
      throw new HttpException('Ingreso recurrente no encontrado', HttpStatus.NOT_FOUND);
    }

    const clientId = invoice.client?.id ?? invoice.clientId;
    if (clientId && recurrentEarning.clientId !== clientId) {
      this.logger.error(
        `El ingreso recurrente ${recurrentEarningId} no pertenece al cliente ${clientId} de la factura`,
      );
      throw new HttpException(
        'El ingreso recurrente no pertenece al cliente de la factura',
        HttpStatus.BAD_REQUEST,
      );
    }
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

  /**
   * Recoge identificadores únicos no vacíos (FK escalar y relación anidada del mismo payload).
   *
   * @param identifierCandidates - UUID recibidos en `*Id` y en `*.id`
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

  /**
   * Comprueba que el cliente y la serie de la factura pertenecen a la misma empresa
   * accesible para el caller. Cubre tanto el UUID escalar como la relación anidada
   * para no omitir un retargeteo (`clientId` vs `client.id`).
   *
   * @param invoice - Factura a persistir
   */
  private async assertInvoiceTenantAccessible(invoice: Invoice): Promise<void> {
    const clientIds = this.collectUniqueIdentifiers(invoice.clientId, invoice.client?.id);
    if (clientIds.length === 0) {
      this.logger.error('La factura debe tener un cliente');
      throw new HttpException('La factura debe tener un cliente', HttpStatus.BAD_REQUEST);
    }

    const clientEnterpriseIds = new Set<string>();
    for (const clientId of clientIds) {
      const client = await this.clientRepository.findById(clientId);
      if (!client) {
        this.logger.error(`Cliente no encontrado con ID: ${clientId}`);
        throw new HttpException(`Cliente no encontrado con ID: ${clientId}`, HttpStatus.NOT_FOUND);
      }
      this.enterpriseAccessService.assertCurrentEntityAccessible(
        client.enterpriseId,
        'Factura no encontrada',
        { resource: 'invoices', action: 'write' },
        );
      clientEnterpriseIds.add(client.enterpriseId);
    }

    const seriesIds = this.collectUniqueIdentifiers(invoice.seriesId, invoice.series?.id);
    if (seriesIds.length === 0) {
      this.logger.error('La factura debe tener una serie');
      throw new HttpException('La factura debe tener una serie', HttpStatus.BAD_REQUEST);
    }

    const seriesEnterpriseIds = new Set<string>();
    for (const seriesId of seriesIds) {
      const invoiceSeries = await this.invoiceSeriesRepository.findById(seriesId);
      if (!invoiceSeries) {
        this.logger.error(`Serie de factura no encontrada con ID: ${seriesId}`);
        throw new HttpException('Serie de factura no encontrada', HttpStatus.NOT_FOUND);
      }
      this.enterpriseAccessService.assertCurrentEntityAccessible(
        invoiceSeries.enterpriseId,
        'Factura no encontrada',
        { resource: 'invoices', action: 'write' },
        );
      seriesEnterpriseIds.add(invoiceSeries.enterpriseId);
    }

    const clientEnterpriseId = [...clientEnterpriseIds][0];
    const seriesEnterpriseId = [...seriesEnterpriseIds][0];
    if (
      clientEnterpriseIds.size !== 1
      || seriesEnterpriseIds.size !== 1
      || clientEnterpriseId !== seriesEnterpriseId
    ) {
      this.logger.warn(
        `Cliente y serie de la factura no pertenecen a la misma empresa (clientes=${[...clientEnterpriseIds].join(',')}, series=${[...seriesEnterpriseIds].join(',')})`,
      );
      throw new HttpException(
        'La serie de factura no pertenece a la misma empresa que el cliente',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Comprueba que la factura pertenece a una empresa accesible para el caller.
   *
   * @param invoice - Factura con relación `client` cargada
   */
  /**
   * Comprueba tenant y permiso sobre la factura.
   *
   * @param invoice - Factura con `client` cargado
   * @param action - Acción del catálogo
   */
  private assertInvoiceAccessible(
    invoice: Invoice,
    action: 'read' | 'write' | 'delete',
  ): void {
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      invoice.client?.enterpriseId,
      `Factura con ID: ${invoice.id} no encontrada`,
      { resource: 'invoices', action },
    );
  }
}

