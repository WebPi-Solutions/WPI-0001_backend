import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Spent } from './spent.entity';
import { DeleteResult, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryBuilderService, QueryFilterOptions, QueryRelation } from 'src/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';

@Injectable()
export class SpentRepository {
  private readonly logger = new Logger(SpentRepository.name);

  constructor(@InjectRepository(Spent) private spentRepository: Repository<Spent>){}

  /**
   * Crea un nuevo gasto
   * @param spent - El gasto a crear
   * @returns El gasto creado
   */
  create(spent: Spent): Promise<Spent> {
    return this.spentRepository.save(spent);
  }

  /**
   * Obtiene todos los gastos con paginación, filtros y ordenación
   * @param page - Número de página
   * @param pageSize - Tamaño de página
   * @param sort - Campo por el que ordenar
   * @param order - Dirección de ordenación
   * @param filter - Filtros a aplicar
   * @param relations - Las relaciones a incluir
   * @returns Respuesta paginada con los gastos
   */
  findAll(
    page: number = 1,
    pageSize: number = 10,
    sort: string = 'issuedDate',
    order: 'ASC' | 'DESC' = 'DESC',
    filter: Record<string, any> = {},
    relations?: string[]
  ): Promise<PaginatedResponse<Spent>> {

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
      this.spentRepository,
      'spent',
      options
    );
  }

  /**
   * Obtiene un gasto por su ID
   * @param id - El ID del gasto a buscar
   * @param relations - Las relaciones a incluir
   * @returns El gasto si se encuentra, de lo contrario null
   */
  findById(id: string, relations?: string[]): Promise<Spent> {
    return this.spentRepository.findOne({ where: { id }, relations });
  }

  /**
   * Actualiza un gasto existente por su ID
   * @param id - El ID del gasto a actualizar
   * @param spent - El gasto con datos actualizados
   * @returns El gasto actualizado
   */
  async updateById(id: string, spent: Spent): Promise<Spent> {
    // Obtiene el gasto a actualizar
    const spentToUpdate = await this.spentRepository.findOne({ where: { id } });

    // Si el gasto no existe, se lanza un error
    if (!spentToUpdate) {
      throw new HttpException('Gasto no encontrado', HttpStatus.NOT_FOUND);
    }

    // Actualiza el gasto
    await this.spentRepository.save({ ...spentToUpdate, ...spent });

    // Devuelve el gasto actualizado con las relaciones incluidas
    return this.findById(id);
  }

  /**
   * Elimina un gasto por su ID
   * @param id - El ID del gasto a eliminar
   * @returns El resultado de la operación de eliminación
   */
  deleteById(id: string): Promise<DeleteResult> {
    return this.spentRepository.delete(id);
  }

  /**
   * Obtiene la ruta del archivo del gasto en Dropbox por su empresa y gasto
   * @param enterpriseId - ID de la empresa
   * @param spentId - ID del gasto
   * @returns La ruta del archivo del gasto en Dropbox
   */
  getSpentFilePath(enterpriseId: string, spentId: string): string {
    return `${process.env.DROPBOX_SPENT_FILE_PATH.replace(':enterpriseId', enterpriseId).replace(':spentId', spentId)}.pdf`;
  }

  /**
   * Obtiene gastos con sus conceptos en un rango de fechas para cálculo de métricas
   * Utiliza la fecha de declaración (declarationDate) en lugar de la fecha de emisión,
   * ya que para el balance importa cuándo se declaró el gasto.
   * @param startDate - Fecha de inicio (inclusive)
   * @param endDate - Fecha de fin (inclusive)
   * @param enterpriseId - ID de la empresa
   * @returns Array de gastos con sus conceptos
   */
  async getSpentsForMetrics(startDate: Date, endDate: Date, enterpriseId: string): Promise<Spent[]> {
    this.logger.log(`Obteniendo gastos desde ${startDate.toISOString()} hasta ${endDate.toISOString()} para empresa ${enterpriseId} (usando declarationDate)`);

    // Consulta optimizada que obtiene solo los conceptos de gastos en el rango de fechas de declaración
    const result = await this.spentRepository
      .createQueryBuilder('spent')
      .leftJoin('spent.supplier', 'supplier')
      .select([
        'spent.concepts',
        'spent.id'
      ])
      .where('spent.declarationDate >= :startDate', { startDate })
      .andWhere('spent.declarationDate <= :endDate', { endDate })
      .andWhere('supplier.enterpriseId = :enterpriseId', { enterpriseId })
      .getMany();

    this.logger.log(`Encontrados ${result.length} gastos en el rango de fechas de declaración`);
    return result;
  }
}