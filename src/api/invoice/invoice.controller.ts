import { Body, Controller, Delete, Get, HttpException, HttpStatus, Logger, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Invoice, InvoiceStatus } from 'src/entities/invoice/invoice.entity';
import { InvoiceService } from './invoice.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';

@ApiTags('Facturas')
@Controller('invoices')
export class InvoiceController {

  private readonly logger = new Logger(InvoiceController.name);
  
  constructor(private readonly invoiceService: InvoiceService){}

  /**
   * Crea una nueva factura
   * @param invoice - La factura a crear
   * @returns La factura creada
   */
  @Post()
  @ApiOperation({ summary: 'Crear una nueva factura' })
  @ApiResponse({ status: 201, description: 'La factura ha sido creada correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async create(@Body() invoice: Invoice) {
    return this.invoiceService.create(invoice);
  }

  /**
   * Obtiene todas las facturas
   * @returns Las facturas
   */
  @Get()
  @ApiOperation({ summary: 'Obtener todas las facturas' })
  @ApiResponse({ status: 200, description: 'Las facturas han sido obtenidas correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findAll(
    @Query('enterpriseId') enterpriseId: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('sort') sort: string = 'issuedDate',
    @Query('order') order: 'ASC' | 'DESC' = 'DESC',
    @Query('filter') filter?: string,
    @Query('relations') relations?: string
  ): Promise<PaginatedResponse<Invoice>> {
    if(!enterpriseId) throw new HttpException('Es obligatorio especificar el ID de la empresa', HttpStatus.BAD_REQUEST);

    this.logger.log(`Obtención de facturas - Empresa: ${enterpriseId}, Página: ${page}, Tamaño: ${pageSize}, Ordenación: ${sort} ${order}, Filtros: ${filter}, Relaciones: ${relations}`);

    const pageNumber = Number(page);
    const pageSizeNumber = Number(pageSize);

    // Parsear las relaciones si existen
    const relationsArray = relations ? relations.split(',') : [];


    // Parsear el filtro si existe
    let filterObj = {
      'client.enterpriseId': enterpriseId
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

    console.log(filterObj);

    const result = await this.invoiceService.findAll(pageNumber, pageSizeNumber, sort, order, filterObj, relationsArray);
    this.logger.log(`Facturas obtenidas: ${result.items.length} de ${result.total}`);
    return result;
  }

  /**
   * Obtiene una factura por su id
   * @param id - El id de la factura
   * @returns La factura
   */
  @Get(':id')
  @ApiOperation({ summary: 'Obtener una factura por su id' })
  @ApiResponse({ status: 200, description: 'La factura ha sido obtenida correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findById(@Param('id') id: string, @Query('relations') relations?: string) {
    const relationsArray = relations ? relations.split(',') : [];
    return this.invoiceService.findById(id, relationsArray);
  }

  /**
   * Actualiza una factura por su id
   * @param id - El id de la factura
   * @param invoice - La factura a actualizar
   * @returns La factura actualizada
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una factura por su id' })
  @ApiResponse({ status: 200, description: 'La factura ha sido actualizada correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async updateById(@Param('id') id: string, @Body() invoice: Invoice) {
    return this.invoiceService.updateById(id, invoice);
  }

  /**
   * Actualiza el estado de una factura por su ID a un estado diferente a borrador
   * @param id - El ID de la factura a actualizar
   * @param status - El nuevo estado de la factura (diferente a borrador)
   * @returns La factura actualizada
   */
  @Patch(':id/status')
  @ApiOperation({ summary: 'Actualizar el estado de una factura por su ID a un estado diferente a borrador' })
  @ApiResponse({ status: 200, description: 'La factura ha sido actualizada correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async updateStatusById(@Param('id') id: string, @Query('status') status: InvoiceStatus): Promise<Invoice> {
    return this.invoiceService.updateStatusById(id, status);
  }

  /**
   * Elimina una factura por su id
   * @param id - El id de la factura
   * @returns La factura eliminada
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una factura por su id' })
  @ApiResponse({ status: 200, description: 'La factura ha sido eliminada correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async delete(@Param('id') id: string) {
    return this.invoiceService.deleteById(id);
  }
}
