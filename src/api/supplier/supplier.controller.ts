import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Supplier } from 'src/entities/supplier/supplier.entity';
import { SupplierService } from './supplier.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';

@ApiTags('Proveedores')
@Controller('suppliers')
export class SupplierController {

  constructor(private readonly supplierService: SupplierService){}

  /**
   * Crea un nuevo proveedor
   * @param supplier - El proveedor a crear
   * @returns El proveedor creado
   */
  @Post()
  @ApiOperation({ summary: 'Crear un nuevo proveedor' })
  @ApiResponse({ status: 201, description: 'El proveedor ha sido creado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async create(
    @Query('enterpriseId') enterpriseId: string,
    @Body() supplier: Supplier
  ) {
    if(!enterpriseId) throw new HttpException('Es obligatorio especificar el ID de la empresa', HttpStatus.BAD_REQUEST);
    supplier.enterpriseId = enterpriseId;

    return this.supplierService.create(supplier);
  }

  /**
   * Obtiene todos los proveedores
   * @returns Los proveedores
   */
  @Get()
  @ApiOperation({ summary: 'Obtener todos los proveedores' })
  @ApiResponse({ status: 200, description: 'Los proveedores han sido obtenidos correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findAll(
    @Query('enterpriseId') enterpriseId: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('sort') sort: string = 'name',
    @Query('order') order: 'ASC' | 'DESC' = 'ASC',
    @Query('filter') filter?: string,
    @Query('relations') relations?: string
  ): Promise<PaginatedResponse<Supplier>> {
    if(!enterpriseId) throw new HttpException('Es obligatorio especificar el ID de la empresa', HttpStatus.BAD_REQUEST);

    const pageNumber = Number(page);
    const pageSizeNumber = Number(pageSize);

    // Parsear las relaciones si existen
    const relationsArray = relations ? relations.split(',') : [];

    
    // Parsear el filtro si existe
    let filterObj = {
      enterpriseId: enterpriseId
    };
    if (filter) {
      try {
        filterObj = {
          ...JSON.parse(filter),
          ...filterObj
        };
      } catch (error) {
        console.error('Error parsing filter JSON:', error);
      }
    }

    return this.supplierService.findAll(pageNumber, pageSizeNumber, sort, order, filterObj, relationsArray);
  }

  /**
   * Obtiene un proveedor por su id
   * @param id - El id del proveedor
   * @returns El proveedor
   */
  @Get(':id')
  @ApiOperation({ summary: 'Obtener un proveedor por su id' })
  @ApiResponse({ status: 200, description: 'El proveedor ha sido obtenido correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findById(@Param('id') id: string, @Query('relations') relations?: string) {
    const relationsArray = relations ? relations.split(',') : [];
    return this.supplierService.findById(id, relationsArray);
  }

  /**
   * Actualiza un proveedor por su id
   * @param id - El id del proveedor
   * @param supplier - El proveedor a actualizar
   * @returns El proveedor actualizado
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un proveedor por su id' })
  @ApiResponse({ status: 200, description: 'El proveedor ha sido actualizado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async updateById(@Param('id') id: string, @Body() supplier: Supplier) {
    return this.supplierService.updateById(id, supplier);
  }

  /**
   * Elimina un proveedor por su id
   * @param id - El id del proveedor
   * @returns El proveedor eliminado
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un proveedor por su id' })
  @ApiResponse({ status: 200, description: 'El proveedor ha sido eliminado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async delete(@Param('id') id: string) {
    return this.supplierService.deleteById(id);
  }
}
