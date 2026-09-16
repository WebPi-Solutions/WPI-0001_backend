import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { SupplierRepository } from 'src/entities/supplier/supplier-repository.service';
import { Supplier } from 'src/entities/supplier/supplier.entity';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { DeleteResult } from 'typeorm';

@Injectable()
export class SupplierService {
  private readonly logger = new Logger(SupplierService.name);

  constructor(
    private readonly supplierRepository: SupplierRepository,
    private readonly enterpriseAccessService: EnterpriseAccessService,
  ){}

  /**
   * Crea un nuevo proveedor
   * @param supplier - El proveedor a crear
   * @returns El proveedor creado
   */
  async create(supplier: Supplier): Promise<Supplier> {
    this.logger.log(`Iniciando proceso de creación de proveedor: ${supplier.name}`);
    this.logger.log(`Datos del proveedor a crear:`, JSON.stringify(supplier, null, 2));

    await this.assertNifIsUniqueForEnterprise(supplier.nif, supplier.enterpriseId);
    
    try {
      const newSupplier = await this.supplierRepository.create(supplier);
      this.logger.log(`Proveedor creado exitosamente con ID: ${newSupplier.id}`);
      return newSupplier;
    } catch (error) {
      this.logger.error(`Error al crear proveedor ${supplier.name}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene todos los proveedores con paginación, filtros y ordenación
   * @param page - El número de página
   * @param pageSize - El tamaño de la página
   * @param sort - El campo por el que ordenar
   * @param order - La dirección de ordenación
   * @param filter - Los filtros a aplicar
   * @param relations - Las relaciones a incluir
   * @returns Los proveedores encontrados
   */
  async findAll(page: number, pageSize: number, sort: string, order: 'ASC' | 'DESC', filter: Record<string, any>, relations?: string[]): Promise<PaginatedResponse<Supplier>> {
    this.logger.log(`Obteniendo proveedores paginados - Página: ${page}, Tamaño: ${pageSize}, Ordenación: ${sort} ${order}`);
    this.logger.log(`Filtros aplicados:`, JSON.stringify(filter, null, 2));
    
    if (relations && relations.length > 0) {
      this.logger.log(`Incluyendo relaciones: ${relations.join(', ')}`);
    }
    
    const result = await this.supplierRepository.findAll(page, pageSize, sort, order, filter, relations);
    this.logger.log(`Proveedores obtenidos: ${result.items.length} de ${result.total}`);
    return result;
  }

  /**
   * Obtiene un proveedor por su ID
   * @param id - El ID del proveedor a obtener
   * @param relations - Las relaciones a incluir
   * @returns El proveedor encontrado
   */
  async findById(id: string, relations?: string[]): Promise<Supplier> {
    this.logger.log(`Buscando proveedor por ID: ${id}${relations ? ` con relaciones: [${relations.join(', ')}]` : ''}`);
    
    const supplier = await this.supplierRepository.findById(id, relations);
    
    if (!supplier) {
      this.logger.log(`No se encontró ningún proveedor con ID: ${id}`);
      throw new HttpException('Proveedor no encontrado', HttpStatus.NOT_FOUND);
    }

    this.logger.log(`Proveedor encontrado: ${supplier.name} (ID: ${supplier.id})`);
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      supplier.enterpriseId,
      'Proveedor no encontrado',
      { resource: 'suppliers', action: 'read' },
      );
    
    return supplier;
  }

  /**
   * Actualiza un proveedor por su ID
   * @param id - El ID del proveedor a actualizar
   * @param supplier - El proveedor con los datos actualizados
   * @returns El proveedor actualizado
   */
  async updateById(id: string, supplier: Supplier): Promise<Supplier> {
    this.logger.log(`Iniciando actualización de proveedor con ID: ${id}`);
    this.logger.log(`Datos a actualizar:`, JSON.stringify(supplier, null, 2));

    const existingSupplier = await this.supplierRepository.findById(id);
    if (!existingSupplier) {
      throw new HttpException('Proveedor no encontrado', HttpStatus.NOT_FOUND);
    }
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      existingSupplier.enterpriseId,
      'Proveedor no encontrado',
      { resource: 'suppliers', action: 'write' },
      );

    if (supplier.nif) {
      await this.assertNifIsUniqueForEnterprise(
        supplier.nif,
        existingSupplier.enterpriseId,
        id,
      );
    }

    const payloadForPersistence = {
      ...supplier,
      enterpriseId: existingSupplier.enterpriseId,
    } as Supplier;
    // Impide relocatar el proveedor a otra empresa mediante PATCH del cuerpo.
    delete (payloadForPersistence as { enterprise?: unknown }).enterprise;
    
    try {
      const updatedSupplier = await this.supplierRepository.updateById(id, payloadForPersistence);
      this.logger.log(`Proveedor ${id} actualizado exitosamente`);
      return updatedSupplier;
    } catch (error) {
      this.logger.error(`Error al actualizar proveedor ${id}:`, error);
      throw error;
    }
  }

  /**
   * Elimina un proveedor por su ID
   * @param id - El ID del proveedor a eliminar
   * @returns El resultado de la eliminación
   */
  async deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Iniciando eliminación de proveedor con ID: ${id}`);

    const existingSupplier = await this.supplierRepository.findById(id);
    if (!existingSupplier) {
      throw new HttpException('Proveedor no encontrado', HttpStatus.NOT_FOUND);
    }
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      existingSupplier.enterpriseId,
      'Proveedor no encontrado',
      { resource: 'suppliers', action: 'delete' },
      );
    
    try {
      const result = await this.supplierRepository.deleteById(id);
      this.logger.log(`Proveedor ${id} eliminado exitosamente. Filas afectadas: ${result.affected}`);
      return result;
    } catch (error) {
      this.logger.error(`Error al eliminar proveedor ${id}:`, error);
      throw error;
    }
  }

  /**
   * Verifica si existe un proveedor con el NIF y el ID de la empresa.
   * @param nif - El NIF/CIF del proveedor a buscar
   * @param enterpriseId - El ID de la empresa a la que pertenece el proveedor
   * @returns El proveedor si se encuentra, de lo contrario null
   */
  async verifySupplierExistsByNif(nif: string, enterpriseId: string): Promise<Supplier | null> {
    this.logger.log(
      `Verificando si existe un proveedor con el NIF: ${nif} para la empresa ${enterpriseId}`,
    );
    const supplierExists = await this.supplierRepository.findByNifAndEnterpriseId(
      nif,
      enterpriseId,
    );
    if (supplierExists) {
      this.logger.log(
        `El proveedor ${supplierExists.name} existe con el NIF: ${supplierExists.nif} para la empresa ${enterpriseId}`,
      );
      return supplierExists;
    }

    this.logger.log(`No existe un proveedor con el NIF: ${nif} para la empresa ${enterpriseId}`);
    return null;
  }

  /**
   * Impide registrar un NIF/CIF que ya pertenece a otro proveedor de la misma empresa.
   * En actualizaciones se ignora el propio proveedor.
   * @param nif - NIF/CIF a comprobar
   * @param enterpriseId - Empresa objetivo
   * @param excludedSupplierId - Identificador del proveedor que se está actualizando
   * @returns Nada
   */
  private async assertNifIsUniqueForEnterprise(
    nif: string,
    enterpriseId: string,
    excludedSupplierId?: string,
  ): Promise<void> {
    const supplierWithSameNif = await this.verifySupplierExistsByNif(nif, enterpriseId);
    if (!supplierWithSameNif) {
      return;
    }

    if (excludedSupplierId && supplierWithSameNif.id === excludedSupplierId) {
      this.logger.log(
        `El NIF ${nif} pertenece al propio proveedor ${excludedSupplierId}; se permite conservarlo`,
      );
      return;
    }

    this.logger.error(
      `Ya existe un proveedor con el NIF ${nif} para la empresa ${enterpriseId}`,
    );
    throw new HttpException(
      `Ya existe un proveedor con el NIF ${nif}`,
      HttpStatus.CONFLICT,
    );
  }
}
