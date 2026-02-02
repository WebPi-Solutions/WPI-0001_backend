import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Quote, QuoteStatus } from './quote.entity';
import { DeleteResult, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryBuilderService, QueryFilterOptions } from 'src/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { Concept } from 'src/models/Concept';

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
}