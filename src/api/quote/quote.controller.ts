import { Body, Controller, Delete, Get, HttpException, HttpStatus, Logger, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { QuoteService } from './quote.service';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { Quote, QuoteStatus } from 'src/entities/quote/quote.entity';

@ApiTags('Cotizaciones')
@Controller('quotes')
export class QuoteController {

  private readonly logger = new Logger(QuoteController.name);
  
  constructor(private readonly quoteService: QuoteService){}

  /**
   * Crea una nueva cotización
   * @param quote - La cotización a crear
   * @returns La cotización creada
   */
  @Post()
  @ApiOperation({ summary: 'Crear una nueva cotización' })
  @ApiResponse({ status: 201, description: 'La cotización ha sido creada correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async create(@Body() quote: Quote) {
    return this.quoteService.create(quote);
  }

  /**
   * Obtiene todas las cotizaciones
   * @returns Las cotizaciones
   */
  @Get()
  @ApiOperation({ summary: 'Obtener todas las cotizaciones' })
  @ApiResponse({ status: 200, description: 'Las cotizaciones han sido obtenidas correctamente.' })
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
    ): Promise<PaginatedResponse<Quote>> {
    if(!enterpriseId) throw new HttpException('Es obligatorio especificar el ID de la empresa', HttpStatus.BAD_REQUEST);

    this.logger.log(`Obtención de cotizaciones - Empresa: ${enterpriseId}, Página: ${page}, Tamaño: ${pageSize}, Ordenación: ${sort} ${order}, Filtros: ${filter}, Relaciones: ${relations}`);

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

    const result = await this.quoteService.findAll(pageNumber, pageSizeNumber, sort, order, filterObj, relationsArray);
    this.logger.log(`Cotizaciones obtenidas: ${result.items.length} de ${result.total}`);
    return result;
  }

  /**
   * Obtiene una cotización por su id
   * @param id - El id de la cotización
   * @returns La cotización
   */
  @Get(':id')
  @ApiOperation({ summary: 'Obtener una cotización por su id' })
  @ApiResponse({ status: 200, description: 'La cotización ha sido obtenida correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findById(@Param('id') id: string, @Query('relations') relations?: string) {
    const relationsArray = relations ? relations.split(',') : [];
    return this.quoteService.findById(id, relationsArray);
  }

  /**
   * Actualiza una cotización por su id
   * @param id - El id de la cotización
   * @param quote - La cotización a actualizar
   * @returns La cotización actualizada
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una cotización por su id' })
  @ApiResponse({ status: 200, description: 'La cotización ha sido actualizada correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async updateById(@Param('id') id: string, @Body() quote: Quote) {
    return this.quoteService.updateById(id, quote);
  }

  /**
   * Actualiza el estado de una cotización por su ID a un estado diferente a borrador
   * @param id - El ID de la cotización a actualizar
   * @param status - El nuevo estado de la cotización (diferente a borrador)
   * @returns La cotización actualizada
   */
  @Patch(':id/status')
  @ApiOperation({ summary: 'Actualizar el estado de una cotización por su ID a un estado diferente a borrador' })
  @ApiResponse({ status: 200, description: 'La cotización ha sido actualizada correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async updateStatusById(@Param('id') id: string, @Query('status') status: QuoteStatus): Promise<Quote> {
    return this.quoteService.updateStatusById(id, status);
  }

  /**
   * Elimina una cotización por su id
   * @param id - El id de la cotización
   * @returns La cotización eliminada
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una cotización por su id' })
  @ApiResponse({ status: 200, description: 'La cotización ha sido eliminada correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async delete(@Param('id') id: string) {
    return this.quoteService.deleteById(id);
  }
}
