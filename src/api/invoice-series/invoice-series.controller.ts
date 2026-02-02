import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InvoiceSeries } from 'src/entities/invoice-series/invoice-series.entity';
import { InvoiceSeriesService } from './invoice-series.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';

@ApiTags('Series de facturas')
@Controller('invoice-series')
export class InvoiceSeriesController {

  constructor(private readonly invoiceSeriesService: InvoiceSeriesService){}

  /**
   * Crea una nueva serie de factura
   * @param invoiceSeries - La serie de factura a crear
   * @returns La serie de factura creada
   */
  @Post()
  @ApiOperation({ summary: 'Crear una nueva serie de factura' })
  @ApiResponse({ status: 201, description: 'La serie de factura ha sido creada correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async create(
    @Query('enterpriseId') enterpriseId: string,
    @Body() invoiceSeries: InvoiceSeries
  ) {
    if(!enterpriseId) throw new HttpException('Es obligatorio especificar el ID de la empresa', HttpStatus.BAD_REQUEST);
    invoiceSeries.enterpriseId = enterpriseId;
    
    return this.invoiceSeriesService.create(invoiceSeries);
  }

  /**
   * Obtiene todas las series de facturas
   * @returns Las series de facturas
   */
  @Get()
  @ApiOperation({ summary: 'Obtener todas las series de facturas' })
  @ApiResponse({ status: 200, description: 'Las series de facturas han sido obtenidas correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findAll(
    @Query('enterpriseId') enterpriseId: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('sort') sort: string = 'series',
    @Query('order') order: 'ASC' | 'DESC' = 'ASC',
    @Query('filter') filter?: string,
    @Query('relations') relations?: string
  ): Promise<PaginatedResponse<InvoiceSeries>> {
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

    return this.invoiceSeriesService.findAll(pageNumber, pageSizeNumber, sort, order, filterObj, relationsArray);
  }

  /**
   * Obtiene una serie de factura por su id
   * @param id - El id de la serie de factura
   * @returns La serie de factura
   */
  @Get(':id')
  @ApiOperation({ summary: 'Obtener una serie de factura por su id' })
  @ApiResponse({ status: 200, description: 'La serie de factura ha sido obtenida correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findById(@Param('id') id: string, @Query('relations') relations?: string) {
    const relationsArray = relations ? relations.split(',') : [];
    return this.invoiceSeriesService.findById(id, relationsArray);
  }

  /**
   * Actualiza una serie de factura por su id
   * @param id - El id de la serie de factura
   * @param invoiceSeries - La serie de factura a actualizar
   * @returns La serie de factura actualizada
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una serie de factura por su id' })
  @ApiResponse({ status: 200, description: 'La serie de factura ha sido actualizada correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async updateById(@Param('id') id: string, @Body() invoiceSeries: InvoiceSeries) {
    return this.invoiceSeriesService.updateById(id, invoiceSeries);
  }

  /**
   * Elimina una serie de factura por su id
   * @param id - El id de la serie de factura
   * @returns La serie de factura eliminada
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una serie de factura por su id' })
  @ApiResponse({ status: 200, description: 'La serie de factura ha sido eliminada correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async delete(@Param('id') id: string) {
    return this.invoiceSeriesService.deleteById(id);
  }
}
