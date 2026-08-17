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
    if(supplier.nif) {
      supplier.nif = this.normalizeSupplierNif(supplier.nif);
    }
    return this.supplierRepository.save(supplier);
  }

  /**
   * Cuenta proveedores con los mismos filtros que el listado.
   */
  async count(
    filter: Record<string, any> = {},
    relations?: string[],
  ): Promise<number> {
    const queryRelations: QueryRelation[] | undefined = relations
      ? relations.map((relation) => ({
          property: relation,
          alias: relation,
          isLeftJoinAndSelect: false,
        }))
      : undefined;
    return QueryBuilderService.getCount(
      this.supplierRepository,
      'supplier',
      filter,
      queryRelations,
    );
  }

  /**
   * Conteos para tarjetas del listado: total, personas físicas y empresas.
   */
  async getListViewCounts(
    enterpriseId: string,
    filter: Record<string, unknown> = {},
  ): Promise<{ total: number; individuals: number; companies: number }> {
    const base: Record<string, unknown> = { enterpriseId, ...filter };
    const [total, individuals, companies] = await Promise.all([
      this.count(base as Record<string, any>),
      this.count({ ...base, type: 'individual' } as Record<string, any>),
      this.count({ ...base, type: 'company' } as Record<string, any>),
    ]);
    return { total, individuals, companies };
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
   * Obtiene un proveedor por su NIF y el ID de la empresa.
   * Compara el NIF ignorando mayúsculas, espacios, puntos y guiones.
   * @param nif CIF/NIF del proveedor
   * @param enterpriseId ID de la empresa a la que pertenece el proveedor
   * @returns El proveedor si se encuentra, o null si no existe
   */
  findByNifAndEnterpriseId(nif: string, enterpriseId: string): Promise<Supplier | null> {
    const normalizedNif = this.normalizeSupplierNif(nif);
    if (!normalizedNif || !enterpriseId) {
      return Promise.resolve(null);
    }

    return this.supplierRepository
      .createQueryBuilder('supplier')
      .where('supplier.enterprise_id = :enterpriseId', { enterpriseId })
      .andWhere(
        `REPLACE(REPLACE(REPLACE(UPPER(supplier.nif), '-', ''), ' ', ''), '.', '') = :normalizedNif`,
        { normalizedNif },
      )
      .getOne();
  }

  /**
   * Normaliza un CIF/NIF para compararlo con el almacenado en base de datos.
   * @param nif CIF/NIF a normalizar
   * @returns NIF en mayúsculas y sin separadores
   */
  private normalizeSupplierNif(nif: string): string {
    return nif?.replace(/[\s.\-]/g, '').toUpperCase() ?? '';
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
