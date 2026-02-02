import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ClientRepository } from 'src/entities/client/client-repository.service';
import { EnterpriseRepository } from 'src/entities/enterprise/enterprise-repository.service';
import { QuoteRepository } from 'src/entities/quote/quote-repository.service';
import { Quote, QuoteStatus } from 'src/entities/quote/quote.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { DeleteResult } from 'typeorm';

@Injectable()
export class QuoteService {
  private readonly logger = new Logger(QuoteService.name);

  constructor(private readonly quoteRepository: QuoteRepository,
              private readonly clientRepository: ClientRepository,
              private readonly enterpriseRepository: EnterpriseRepository
  ){}

  /**
   * Crea una nueva cotización
   * @param quote - La cotización a crear
   * @returns La cotización creada
   */
  async create(quote: Quote): Promise<Quote> {
    this.logger.log(`Iniciando proceso de creación de cotización`);
    this.logger.log(`Datos de la cotización a crear:`, JSON.stringify(quote, null, 2));

    // Se establecen los datos persistentes de cliente y emisor
    quote = await this.setQuotePersistentData(quote);
    
    try {
      const newQuote = await this.quoteRepository.create(quote);
      this.logger.log(`Cotización creada exitosamente con ID: ${newQuote.id}`);
      return newQuote;
    } catch (error) {
      this.logger.error(`Error al crear cotización:`, error);
      throw error;
    }
  }

  /**
   * Obtiene todas las cotizaciones con paginación, filtros y ordenación
   * @param page - El número de página
   * @param pageSize - El tamaño de la página
   * @param sort - El campo por el que ordenar
   * @param order - La dirección de ordenación
   * @param filter - Los filtros a aplicar
   * @param relations - Las relaciones a incluir
   * @returns Las cotizaciones encontradas
   */
  async findAll(page: number, pageSize: number, sort: string, order: 'ASC' | 'DESC', filter: Record<string, any>, relations?: string[]): Promise<PaginatedResponse<Quote>> {
    this.logger.log(`Obteniendo cotizaciones paginadas - Página: ${page}, Tamaño: ${pageSize}, Ordenación: ${sort} ${order}`);
    this.logger.log(`Filtros aplicados:`, JSON.stringify(filter, null, 2));
    
    if (relations && relations.length > 0) {
      this.logger.log(`Incluyendo relaciones: ${relations.join(', ')}`);
    }
    
    const result = await this.quoteRepository.findAll(page, pageSize, sort, order, filter, relations);
    this.logger.log(`Cotizaciones obtenidas: ${result.items.length} de ${result.total}`);
    return result;
  }

  /**
   * Obtiene una cotización por su ID
   * @param id - El ID de la cotización a obtener
   * @param relations - Las relaciones a incluir
   * @returns La cotización encontrada
   */
  async findById(id: string, relations?: string[]): Promise<Quote> {
    this.logger.log(`Buscando cotización por ID: ${id}${relations ? ` con relaciones: [${relations.join(', ')}]` : ''}`);
    
    const quote = await this.quoteRepository.findById(id, relations);
    
    if (quote) {
      this.logger.log(`Cotización encontrada con ID: ${quote.id}`);
    } else {
      this.logger.log(`No se encontró ninguna cotización con ID: ${id}`);
      throw new HttpException(`Cotización con ID: ${id} no encontrada`, HttpStatus.NOT_FOUND);
    }
    
    return quote;
  }

  /**
   * Actualiza una cotización por su ID
   * @param id - El ID de la cotización a actualizar
   * @param quote - La cotización con los datos actualizados
   * @returns La cotización actualizada
   */
  async updateById(id: string, quote: Quote): Promise<Quote> {
    this.logger.log(`Iniciando actualización de cotización con ID: ${id}`);
    this.logger.log(`Datos a actualizar:`, JSON.stringify(quote, null, 2));

    const quoteToUpdate = await this.quoteRepository.findById(id);

    if (!quoteToUpdate) {
      this.logger.error(`Cotización no encontrada con ID: ${id}`);
      throw new HttpException('Cotización no encontrada', HttpStatus.NOT_FOUND);
    }

    if(quoteToUpdate.status !== QuoteStatus.DRAFT) {
      this.logger.error(`No se puede actualizar la cotización ${id} porque ya ha sido emitida`);
      throw new HttpException(`No se puede actualizar la cotización ${id} porque ya ha sido emitida`, HttpStatus.BAD_REQUEST);
    }

    // Rellena el resto de la cotización con los datos de la cotización guardada en base de datos. (Evita errores de validación al no tener campos)
    quote = {
      ...quoteToUpdate,
      ...quote
    }
    quote = await this.setQuotePersistentData(quote);
    
    try {
      const updatedQuote = await this.quoteRepository.updateById(id, quote);
      this.logger.log(`Cotización ${id} actualizada exitosamente`);
      return updatedQuote;
    } catch (error) {
      this.logger.error(`Error al actualizar cotización ${id}:`, error);
      throw error;
    }
  }

  /**
   * Actualiza el estado de una cotización por su ID a un estado diferente a borrador
   * @param id - El ID de la cotización a actualizar
   * @param status - El nuevo estado de la cotización (diferente a borrador)
   * @returns La cotización actualizada
   */
  async updateStatusById(id: string, status: QuoteStatus): Promise<Quote> {
    this.logger.log(`Iniciando actualización del estado de la cotización con ID: ${id}`);
    this.logger.log(`Estado a actualizar: ${status}`);

    if(!Object.values(QuoteStatus).includes(status)) {
      this.logger.error(`El estado de la cotización no es válido: ${status}`);
      throw new HttpException(`El estado de la cotización no es válido: ${status}`, HttpStatus.BAD_REQUEST);
    }

    let quoteToUpdate = await this.quoteRepository.findById(id);
    if(!quoteToUpdate) {
      this.logger.error(`Cotización no encontrada con ID: ${id}`);
      throw new HttpException(`Cotización no encontrada con ID: ${id}`, HttpStatus.NOT_FOUND);
    }

    if(quoteToUpdate.status !== QuoteStatus.DRAFT && status === QuoteStatus.DRAFT) {
      this.logger.error(`No se puede establecer como borrador una cotización que ya ha sido emitida`);
      throw new HttpException(`No se puede establecer como borrador una cotización que ya ha sido emitida`, HttpStatus.BAD_REQUEST);
    }

    if(quoteToUpdate.status === QuoteStatus.DRAFT && status !== QuoteStatus.DRAFT) {
      this.logger.log(`La cotización pasa de estado borrador a estado de emitida, se establece el número de serie de la cotización y el resto de datos persistentes`);
      // Mandamos la cotización actual reemplazando el status en el objeto para que al setear la información persistente lo tenga en cuenta, ya que para generar el número de cotización es necesario
      // un status !== DRAFT que todavía no ha sido asignado para no interferir con las validaciones if.
      quoteToUpdate = await this.setQuotePersistentData({...quoteToUpdate, status: status});
    }

    return this.quoteRepository.updateById(id, { ...quoteToUpdate, status });
  }
  
  /**
   * Elimina una cotización por su ID
   * @param id - El ID de la cotización a eliminar
   * @returns El resultado de la eliminación
   */
  async deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Iniciando eliminación de cotización con ID: ${id}`);

    const quote = await this.quoteRepository.findById(id);
    if (!quote) {
      this.logger.error(`Cotización con ID ${id} no encontrada`);
      throw new HttpException(`Cotización con ID ${id} no encontrada`, HttpStatus.NOT_FOUND);
    }

    if (quote.status !== QuoteStatus.DRAFT) {
      this.logger.error(`No se puede eliminar la cotización ${id} porque ya ha sido emitida`);
      throw new HttpException(`No se puede eliminar la cotización ${id} porque ya ha sido emitida`, HttpStatus.BAD_REQUEST);
    }
    
    try {
      const result = await this.quoteRepository.deleteById(id);
      this.logger.log(`Cotización ${id} eliminada exitosamente. Filas afectadas: ${result.affected}`);
      return result;
    } catch (error) {
      this.logger.error(`Error al eliminar cotización ${id}:`, error);
      throw error;
    }
  }

  /**
   * Asigna los datos persistentes de cliente y emisor a la cotización
   * @param quote - La cotización a la que se le asignan los datos persistentes
   * @returns La cotización con los datos persistentes asignados
   */
  async setQuotePersistentData(quote: Quote): Promise<Quote> {
    const clientId = quote.clientId;
    if(!clientId) {
      this.logger.error(`La cotización debe tener un cliente`);
      throw new HttpException(`La cotización debe tener un cliente`, HttpStatus.BAD_REQUEST);
    }

    if(quote.status !== QuoteStatus.DRAFT) {
      this.logger.log(`Asignando los datos persistentes de cliente y emisor a la cotización. Cliente ID: ${quote.clientId}`);
    
      const client = await this.clientRepository.findById(clientId);
      if(!client) {
        this.logger.error(`Cliente no encontrado con ID: ${clientId}`);
        throw new HttpException(`Cliente no encontrado con ID: ${clientId}`, HttpStatus.NOT_FOUND);
      }
      this.logger.log(`Cliente para asignar datos persistentes encontrado:`, JSON.stringify(client, null, 2));
      quote.clientName = client.name;
      quote.clientNif = client.nif;
      if(client.address) quote.clientAddress = client.address;

      const enterprise = await this.enterpriseRepository.findById(client.enterpriseId);
      if(!enterprise) {
        this.logger.error(`Empresa no encontrada con ID: ${client.enterpriseId}`);
        throw new HttpException(`Empresa no encontrada con ID: ${client.enterpriseId}`, HttpStatus.NOT_FOUND);
      }

      this.logger.log(`Empresa para asignar datos persistentes encontrada:`, JSON.stringify(enterprise, null, 2));
      quote.issuerName = enterprise.name;
      quote.issuerNif = enterprise.nif;
      if(enterprise.address) quote.issuerAddress = enterprise.address;

      this.logger.log(`Datos de la cotización tras asignar los datos persistentes de cliente y emisor:`, JSON.stringify(quote, null, 2));
    }
    
    else {
      this.logger.warn(`No se establece los datos persistentes de la cotización porque está en estado de borrador`);
    }

    return quote;
  }
}

