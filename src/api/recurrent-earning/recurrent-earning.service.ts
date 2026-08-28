import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ClientRepository } from 'src/entities/client/client-repository.service';
import { InvoiceSeriesRepository } from 'src/entities/invoice-series/invoice-series-repository.service';
import { RecurrentEarningRepository } from 'src/entities/recurrent-earning/recurrent-earning-repository.service';
import { RecurrentEarning, RecurrentEarningType } from 'src/entities/recurrent-earning/recurrent-earning.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { DeleteResult } from 'typeorm';

/**
 * Servicio de negocio de ingresos recurrentes.
 * Valida cliente y serie de factura respecto a la empresa antes de persistir.
 */
@Injectable()
export class RecurrentEarningService {
  private readonly logger = new Logger(RecurrentEarningService.name);

  constructor(
    private readonly recurrentEarningRepository: RecurrentEarningRepository,
    private readonly clientRepository: ClientRepository,
    private readonly invoiceSeriesRepository: InvoiceSeriesRepository,
  ) {}

  /**
   * Crea un nuevo ingreso recurrente.
   * @param recurrentEarning - El ingreso recurrente a crear
   * @returns El ingreso recurrente creado
   */
  async create(recurrentEarning: RecurrentEarning): Promise<RecurrentEarning> {
    this.logger.log(`Iniciando proceso de creación de ingreso recurrente: ${recurrentEarning.name}`);
    this.logger.log(`Datos del ingreso recurrente a crear:`, JSON.stringify(recurrentEarning, null, 2));

    this.normalizeRelatedIdentifiers(recurrentEarning);
    this.applyDefaultTypeIfMissing(recurrentEarning);
    this.validateType(recurrentEarning);
    this.validateRequiredFields(recurrentEarning);
    await this.validateRelatedEntitiesBelongToEnterprise(recurrentEarning);

    if (!recurrentEarning.concepts) {
      recurrentEarning.concepts = [];
    }

    try {
      const createdRecurrentEarning = await this.recurrentEarningRepository.create(recurrentEarning);
      this.logger.log(`Ingreso recurrente creado exitosamente con ID: ${createdRecurrentEarning.id}`);
      return createdRecurrentEarning;
    } catch (error) {
      this.logger.error(`Error al crear ingreso recurrente ${recurrentEarning.name}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene ingresos recurrentes paginados, filtrados y ordenados.
   * @param page - Número de página
   * @param pageSize - Tamaño de página
   * @param sort - Campo por el que ordenar
   * @param order - Dirección de ordenación
   * @param filter - Filtros a aplicar
   * @param relations - Relaciones a incluir
   * @returns Respuesta paginada con los ingresos recurrentes
   */
  async findAll(
    page: number,
    pageSize: number,
    sort: string,
    order: 'ASC' | 'DESC',
    filter: Record<string, any>,
    relations?: string[],
  ): Promise<PaginatedResponse<RecurrentEarning>> {
    this.logger.log(`Obteniendo ingresos recurrentes paginados - Página: ${page}, Tamaño: ${pageSize}, Ordenación: ${sort} ${order}`);
    this.logger.log(`Filtros aplicados:`, JSON.stringify(filter, null, 2));

    if (relations && relations.length > 0) {
      this.logger.log(`Incluyendo relaciones: ${relations.join(', ')}`);
    }

    const result = await this.recurrentEarningRepository.findAll(page, pageSize, sort, order, filter, relations);
    this.logger.log(`Ingresos recurrentes obtenidos: ${result.items.length} de ${result.total}`);
    return result;
  }

  /**
   * Obtiene un ingreso recurrente por su ID.
   * @param id - El ID del ingreso recurrente
   * @param relations - Relaciones a incluir
   * @returns El ingreso recurrente encontrado
   */
  async findById(id: string, relations?: string[]): Promise<RecurrentEarning> {
    this.logger.log(`Buscando ingreso recurrente por ID: ${id}${relations ? ` con relaciones: [${relations.join(', ')}]` : ''}`);

    const recurrentEarning = await this.recurrentEarningRepository.findById(id, relations);

    if (!recurrentEarning) {
      this.logger.error(`No se encontró ningún ingreso recurrente con ID: ${id}`);
      throw new HttpException('Ingreso recurrente no encontrado', HttpStatus.NOT_FOUND);
    }

    this.logger.log(`Ingreso recurrente encontrado: ${recurrentEarning.name} (ID: ${recurrentEarning.id})`);
    return recurrentEarning;
  }

  /**
   * Actualiza un ingreso recurrente por su ID.
   * @param id - El ID del ingreso recurrente a actualizar
   * @param recurrentEarning - Datos a actualizar
   * @returns El ingreso recurrente actualizado
   */
  async updateById(id: string, recurrentEarning: RecurrentEarning): Promise<RecurrentEarning> {
    this.logger.log(`Iniciando actualización de ingreso recurrente con ID: ${id}`);
    this.logger.log(`Datos a actualizar:`, JSON.stringify(recurrentEarning, null, 2));

    const existingRecurrentEarning = await this.recurrentEarningRepository.findById(id);
    if (!existingRecurrentEarning) {
      this.logger.error(`Ingreso recurrente no encontrado con ID: ${id}`);
      throw new HttpException('Ingreso recurrente no encontrado', HttpStatus.NOT_FOUND);
    }

    this.normalizeRelatedIdentifiers(recurrentEarning);
    if (recurrentEarning.type) {
      this.validateType(recurrentEarning);
    }

    const mergedRecurrentEarning = {
      ...existingRecurrentEarning,
      ...recurrentEarning,
      enterpriseId: existingRecurrentEarning.enterpriseId,
    } as RecurrentEarning;

    this.validateRequiredFields(mergedRecurrentEarning);
    await this.validateRelatedEntitiesBelongToEnterprise(mergedRecurrentEarning);

    try {
      const updatedRecurrentEarning = await this.recurrentEarningRepository.updateById(id, mergedRecurrentEarning);
      this.logger.log(`Ingreso recurrente ${id} actualizado exitosamente`);
      return updatedRecurrentEarning;
    } catch (error) {
      this.logger.error(`Error al actualizar ingreso recurrente ${id}:`, error);
      throw error;
    }
  }

  /**
   * Elimina un ingreso recurrente por su ID.
   * No permite el borrado si existen facturas vinculadas (FK ON DELETE NO ACTION).
   * @param id - El ID del ingreso recurrente a eliminar
   * @returns El resultado de la eliminación
   */
  async deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Iniciando eliminación de ingreso recurrente con ID: ${id}`);

    const recurrentEarning = await this.recurrentEarningRepository.findById(id, ['invoices']);
    if (!recurrentEarning) {
      this.logger.error(`Ingreso recurrente no encontrado con ID: ${id}`);
      throw new HttpException('Ingreso recurrente no encontrado', HttpStatus.NOT_FOUND);
    }

    if (recurrentEarning.invoices && recurrentEarning.invoices.length > 0) {
      this.logger.error(`No se puede eliminar el ingreso recurrente ${id} porque tiene facturas asociadas`);
      throw new HttpException(
        'No se puede eliminar el ingreso recurrente porque tiene facturas asociadas',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const result = await this.recurrentEarningRepository.deleteById(id);
      this.logger.log(`Ingreso recurrente ${id} eliminado exitosamente. Filas afectadas: ${result.affected}`);
      return result;
    } catch (error) {
      this.logger.error(`Error al eliminar ingreso recurrente ${id}:`, error);
      throw error;
    }
  }

  /**
   * Asigna el tipo mensual cuando no se informa en el alta.
   * @param recurrentEarning - El ingreso recurrente a normalizar
   */
  private applyDefaultTypeIfMissing(recurrentEarning: RecurrentEarning): void {
    if (!recurrentEarning.type) {
      recurrentEarning.type = RecurrentEarningType.MONTHLY;
      this.logger.log('Tipo de ingreso recurrente no informado; se aplica el valor por defecto monthly');
    }
  }

  /**
   * Rechaza un tipo distinto de monthly o yearly.
   * @param recurrentEarning - El ingreso recurrente a validar
   */
  private validateType(recurrentEarning: RecurrentEarning): void {
    const isValidType = Object.values(RecurrentEarningType).includes(recurrentEarning.type);
    if (!isValidType) {
      this.logger.error(`Tipo de ingreso recurrente no válido: ${recurrentEarning.type}`);
      throw new HttpException(
        'El tipo del ingreso recurrente debe ser monthly o yearly',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Extrae los identificadores de cliente y serie desde el cuerpo anidado o plano.
   * @param recurrentEarning - El ingreso recurrente a normalizar
   */
  private normalizeRelatedIdentifiers(recurrentEarning: RecurrentEarning): void {
    if (!recurrentEarning.clientId && recurrentEarning.client?.id) {
      recurrentEarning.clientId = recurrentEarning.client.id;
    }

    if (!recurrentEarning.invoiceSerieId && recurrentEarning.invoiceSeries?.id) {
      recurrentEarning.invoiceSerieId = recurrentEarning.invoiceSeries.id;
    }
  }

  /**
   * Comprueba que nombre, empresa, cliente y serie estén informados.
   * @param recurrentEarning - El ingreso recurrente a validar
   */
  private validateRequiredFields(recurrentEarning: RecurrentEarning): void {
    if (!recurrentEarning.name) {
      throw new HttpException('El ingreso recurrente debe tener un nombre', HttpStatus.BAD_REQUEST);
    }

    if (!recurrentEarning.enterpriseId) {
      throw new HttpException('El ingreso recurrente debe pertenecer a una empresa', HttpStatus.BAD_REQUEST);
    }

    if (!recurrentEarning.clientId) {
      throw new HttpException('El ingreso recurrente debe tener un cliente', HttpStatus.BAD_REQUEST);
    }

    if (!recurrentEarning.invoiceSerieId) {
      throw new HttpException('El ingreso recurrente debe tener una serie de factura', HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Verifica que el cliente y la serie existan y pertenezcan a la misma empresa.
   * @param recurrentEarning - El ingreso recurrente cuyas relaciones se validan
   */
  private async validateRelatedEntitiesBelongToEnterprise(recurrentEarning: RecurrentEarning): Promise<void> {
    const client = await this.clientRepository.findById(recurrentEarning.clientId);
    if (!client) {
      this.logger.error(`Cliente no encontrado con ID: ${recurrentEarning.clientId}`);
      throw new HttpException('Cliente no encontrado', HttpStatus.NOT_FOUND);
    }

    if (client.enterpriseId !== recurrentEarning.enterpriseId) {
      this.logger.error(
        `El cliente ${client.id} no pertenece a la empresa ${recurrentEarning.enterpriseId}`,
      );
      throw new HttpException(
        'El cliente no pertenece a la empresa del ingreso recurrente',
        HttpStatus.BAD_REQUEST,
      );
    }

    const invoiceSeries = await this.invoiceSeriesRepository.findById(recurrentEarning.invoiceSerieId);
    if (!invoiceSeries) {
      this.logger.error(`Serie de factura no encontrada con ID: ${recurrentEarning.invoiceSerieId}`);
      throw new HttpException('Serie de factura no encontrada', HttpStatus.NOT_FOUND);
    }

    if (invoiceSeries.enterpriseId !== recurrentEarning.enterpriseId) {
      this.logger.error(
        `La serie ${invoiceSeries.id} no pertenece a la empresa ${recurrentEarning.enterpriseId}`,
      );
      throw new HttpException(
        'La serie de factura no pertenece a la empresa del ingreso recurrente',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
