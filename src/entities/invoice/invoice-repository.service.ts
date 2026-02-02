import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Invoice, InvoiceStatus } from './invoice.entity';
import { DeleteResult, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryBuilderService, QueryFilterOptions, QueryRelation } from 'src/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { Concept, ConceptIrpfs, ConceptVats } from 'src/models/Concept';

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
}