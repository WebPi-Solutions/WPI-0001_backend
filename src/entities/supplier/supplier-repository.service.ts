import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Supplier } from './supplier.entity';
import { DeleteResult, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryBuilderService, QueryFilterOptions, QueryRelation } from 'src/helpers/query-builder/query-builder.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';

@Injectable()
export class SupplierRepository {

  constructor(@InjectRepository(Supplier) private supplierRepository: Repository<Supplier>){}

  /**
   * Crea un nuevo proveedor
   * @param supplier - El proveedor a crear
   * @returns El proveedor creado
   */
  create(supplier: Supplier): Promise<Supplier> {
    return this.supplierRepository.save(supplier);
  }

  /**
   * Obtiene todos los proveedores con paginación, filtros y ordenación
   * @param page - Número de página
   * @param pageSize - Tamaño de página
   * @param sort - Campo por el que ordenar
   * @param order - Dirección de ordenación
   * @param filter - Filtros a aplicar
   * @param relations - Las relaciones a incluir
   * @returns Respuesta paginada con los proveedores
   */
  findAll(
    page: number = 1,
    pageSize: number = 10,
    sort: string = 'name',
    order: 'ASC' | 'DESC' = 'ASC',
    filter: Record<string, any> = {},
    relations?: string[]
  ): Promise<PaginatedResponse<Supplier>> {

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
      this.supplierRepository,
      'supplier',
      options
    );
  }

  /**
   * Obtiene un proveedor por su ID
   * @param id - El ID del proveedor a buscar
   * @param relations - Las relaciones a incluir
   * @returns El proveedor si se encuentra, de lo contrario null
   */
  findById(id: string, relations?: string[]): Promise<Supplier> {
    return this.supplierRepository.findOne({ where: { id }, relations });
  }

  /**
   * Actualiza un proveedor existente por su ID
   * @param id - El ID del proveedor a actualizar
   * @param supplier - El proveedor con datos actualizados
   * @returns El proveedor actualizado
   */
  async updateById(id: string, supplier: Supplier): Promise<Supplier> {
    // Obtiene el proveedor a actualizar
    const supplierToUpdate = await this.supplierRepository.findOne({ where: { id } });

    // Si el proveedor no existe, se lanza un error
    if (!supplierToUpdate) {
      throw new HttpException('Proveedor no encontrado', HttpStatus.NOT_FOUND);
    }

    // Actualiza el proveedor
    await this.supplierRepository.save({ ...supplierToUpdate, ...supplier });

    // Devuelve el proveedor actualizado con las relaciones incluidas
    return this.findById(id);
  }

  /**
   * Elimina un proveedor por su ID
   * @param id - El ID del proveedor a eliminar
   * @returns El resultado de la operación de eliminación
   */
  deleteById(id: string): Promise<DeleteResult> {
    return this.supplierRepository.delete(id);
  }
}
