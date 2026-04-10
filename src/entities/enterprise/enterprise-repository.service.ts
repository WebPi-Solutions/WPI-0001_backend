import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Enterprise } from './enterprise.entity';
import { DeleteResult, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryBuilderService, QueryFilterOptions, QueryRelation } from 'src/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';

@Injectable()
export class EnterpriseRepository {

  constructor(@InjectRepository(Enterprise) private enterpriseRepository: Repository<Enterprise>){}

  /**
   * Crea una nueva empresa
   * @param enterprise - La empresa a crear
   * @returns La empresa creada
   */
  create(enterprise: Enterprise): Promise<Enterprise> {
    return this.enterpriseRepository.save(enterprise);
  }

  /**
   * Obtiene todas las empresas con paginación, filtros y ordenación
   * @param page - Número de página
   * @param pageSize - Tamaño de página
   * @param sort - Campo por el que ordenar
   * @param order - Dirección de ordenación
   * @param filter - Filtros a aplicar
   * @param relations - Las relaciones a incluir
   * @returns Respuesta paginada con las empresas
   */
  findAll(
    page: number = 1,
    pageSize: number = 10,
    sort: string = 'name',
    order: 'ASC' | 'DESC' = 'ASC',
    filter: Record<string, any> = {},
    relations?: string[]
  ): Promise<PaginatedResponse<Enterprise>> {

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
      this.enterpriseRepository,
      'enterprise',
      options
    );
  }

  /**
   * Obtiene una empresa por su ID
   * @param id - El ID de la empresa a buscar
   * @param relations - Las relaciones a incluir
   * @returns La empresa si se encuentra, de lo contrario null
   */
  findById(id: string, relations?: string[]): Promise<Enterprise> {
    return this.enterpriseRepository.findOne({ where: { id }, relations });
  }

  /**
   * Obtiene una empresa por su NIF
   * @param nif - El NIF de la empresa a buscar
   * @returns La empresa si se encuentra, de lo contrario null
   */
  findByNif(nif: string): Promise<Enterprise> {
    return this.enterpriseRepository.findOne({ where: { nif } });
  }

  /**
   * Actualiza una empresa existente por su ID
   * @param id - El ID de la empresa a actualizar
   * @param enterprise - La empresa con datos actualizados
   * @returns La empresa actualizada
   */
  async updateById(id: string, enterprise: Enterprise): Promise<Enterprise> {
    // Obtiene la empresa a actualizar
    const enterpriseToUpdate = await this.enterpriseRepository.findOne({ where: { id } });
    
    // Si la empresa no existe, se lanza un error
    if (!enterpriseToUpdate) {
      throw new HttpException('Empresa no encontrada', HttpStatus.NOT_FOUND);
    }

    // Actualiza la empresa
    await this.enterpriseRepository.save({ ...enterpriseToUpdate, ...enterprise });

    // Devuelve la empresa actualizada con las relaciones incluidas
    return this.findById(id);
  }

  /**
   * Elimina una empresa por su ID
   * @param id - El ID de la empresa a eliminar
   * @returns El resultado de la operación de eliminación
   */
  deleteById(id: string): Promise<DeleteResult> {
    return this.enterpriseRepository.delete(id);
  }

  /**
   * Obtiene la ruta del archivo del logo de la empresa en Dropbox
   * @param enterpriseId - ID de la empresa
   * @returns La ruta del archivo del logo de la empresa en Dropbox
   */
  getEnterpriseFolderPath(enterpriseId: string): string {
    return `${process.env.DROPBOX_ENTERPRISE_FOLDER_PATH.replace(':enterpriseId', enterpriseId)}`;
  }

  /**
   * Obtiene la ruta del archivo del logo de la empresa en Dropbox
   * @param enterpriseId - ID de la empresa
   * @param extension - Extensión del archivo
   * @returns La ruta del archivo del logo de la empresa en Dropbox
   */
  getLogoFilePath(enterpriseId: string, extension: string): string {
    return `${process.env.DROPBOX_ENTERPRISE_LOGO_FILE_PATH.replace(':enterpriseId', enterpriseId)}.${extension}`;
  }
}
