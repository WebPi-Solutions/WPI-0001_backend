import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrderConcept } from 'src/entities/order-concept/order-concept.entity';
import { OrderConceptResponseDto } from 'src/entities/order-concept/dto/order-concept-response.dto';
import { OrderConceptService } from './order-concept.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { MapResponse } from 'src/common/decorators/map-response.decorator';
import { RequireEnterpriseId } from 'src/common/decorators/enterprise-access.decorator';
import { RequirePermission } from 'src/common/decorators/enterprise-permission.decorator';

/**
 * API HTTP de líneas de pedido.
 * El listado y el alta exigen `enterpriseId` en query; el tenant se resuelve vía pedido → cliente.
 * El permiso es el de pedidos: las líneas no son un recurso de catálogo aparte.
 */
@ApiTags('Conceptos de pedido')
@Controller('order-concepts')
export class OrderConceptController {
  constructor(private readonly orderConceptService: OrderConceptService) {}

  /**
   * Crea una línea en un pedido de la empresa de la query.
   * @param enterpriseId - Empresa objetivo
   * @param orderConcept - Datos de la línea
   * @returns La línea creada
   */
  @Post()
  @RequirePermission('orders', 'write')
  @RequireEnterpriseId()
  @MapResponse(OrderConceptResponseDto)
  @ApiOperation({ summary: 'Crear un concepto de pedido' })
  @ApiOkResponse({ type: OrderConceptResponseDto, description: 'Concepto creado (vista pública).' })
  @ApiResponse({ status: 201, description: 'El concepto ha sido creado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async create(
    @Query('enterpriseId') enterpriseId: string,
    @Body() orderConcept: OrderConcept,
  ): Promise<OrderConcept> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.orderConceptService.create(orderConcept, enterpriseId);
  }

  /**
   * Lista las líneas de los pedidos de una empresa.
   * @param enterpriseId - Empresa objetivo
   * @param page - Página
   * @param pageSize - Tamaño de página
   * @param sort - Campo de ordenación
   * @param order - Dirección
   * @param filter - Filtro JSON opcional
   * @param relations - Relaciones separadas por coma
   * @returns Página de líneas
   */
  @Get()
  @RequirePermission('orders', 'read')
  @RequireEnterpriseId()
  @MapResponse(OrderConceptResponseDto)
  @ApiOperation({ summary: 'Obtener los conceptos de pedido de una empresa' })
  @ApiOkResponse({
    type: OrderConceptResponseDto,
    isArray: true,
    description: 'Conceptos (vista pública).',
  })
  @ApiResponse({ status: 200, description: 'Los conceptos han sido obtenidos correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findAll(
    @Query('enterpriseId') enterpriseId: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('sort') sort: string = 'position',
    @Query('order') order: 'ASC' | 'DESC' = 'ASC',
    @Query('filter') filter?: string,
    @Query('relations') relations?: string,
  ): Promise<PaginatedResponse<OrderConcept>> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }

    const pageNumber = Number(page);
    const pageSizeNumber = Number(pageSize);
    const relationsArray = relations ? relations.split(',') : [];
    if (!relationsArray.includes('order')) {
      relationsArray.push('order');
    }
    if (!relationsArray.includes('order.client')) {
      relationsArray.push('order.client');
    }

    let filterObj: Record<string, unknown> = {
      'client.enterpriseId': enterpriseId,
    };
    if (filter) {
      try {
        filterObj = {
          ...JSON.parse(filter),
          ...filterObj,
        };
      } catch (error) {
        console.error('Error parsing filter JSON:', error);
      }
    }

    return this.orderConceptService.findAll(
      pageNumber,
      pageSizeNumber,
      sort,
      order,
      filterObj,
      relationsArray,
    );
  }

  /**
   * Obtiene una línea por identificador.
   * @param id - UUID de la línea
   * @param relations - Relaciones separadas por coma
   * @returns La línea
   */
  @Get(':id')
  @RequirePermission('orders', 'read')
  @MapResponse(OrderConceptResponseDto)
  @ApiOperation({ summary: 'Obtener un concepto de pedido por su id' })
  @ApiOkResponse({ type: OrderConceptResponseDto, description: 'Concepto (vista pública).' })
  @ApiResponse({ status: 200, description: 'El concepto ha sido obtenido correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findById(
    @Param('id') id: string,
    @Query('relations') relations?: string,
  ): Promise<OrderConcept> {
    const relationsArray = relations ? relations.split(',') : [];
    return this.orderConceptService.findById(id, relationsArray);
  }

  /**
   * Actualiza una línea por identificador.
   * @param id - UUID de la línea
   * @param orderConcept - Campos a actualizar
   * @returns La línea actualizada
   */
  @Patch(':id')
  @RequirePermission('orders', 'write')
  @MapResponse(OrderConceptResponseDto)
  @ApiOperation({ summary: 'Actualizar un concepto de pedido por su id' })
  @ApiOkResponse({
    type: OrderConceptResponseDto,
    description: 'Concepto actualizado (vista pública).',
  })
  @ApiResponse({ status: 200, description: 'El concepto ha sido actualizado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async updateById(
    @Param('id') id: string,
    @Body() orderConcept: OrderConcept,
  ): Promise<OrderConcept> {
    return this.orderConceptService.updateById(id, orderConcept);
  }

  /**
   * Elimina una línea por identificador.
   * @param id - UUID de la línea
   * @returns Resultado del borrado
   */
  @Delete(':id')
  @RequirePermission('orders', 'delete')
  @ApiOperation({ summary: 'Eliminar un concepto de pedido por su id' })
  @ApiResponse({ status: 200, description: 'El concepto ha sido eliminado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async delete(@Param('id') id: string): Promise<unknown> {
    return this.orderConceptService.deleteById(id);
  }
}
