import { Body, Controller, Delete, Get, HttpException, HttpStatus, Logger, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrderStatus } from 'src/common/enums';
import { MapResponse } from 'src/common/decorators/map-response.decorator';
import { RequireEnterpriseId } from 'src/common/decorators/enterprise-access.decorator';
import { RequirePermission } from 'src/common/decorators/enterprise-permission.decorator';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { Order } from 'src/entities/order/order.entity';
import { OrderResponseDto } from 'src/entities/order/dto/order-response.dto';
import { OrderService } from './order.service';
import { Response } from 'express';

/**
 * Endpoints HTTP de pedidos.
 */
@ApiTags('Pedidos')
@Controller('orders')
export class OrderController {
  private readonly logger = new Logger(OrderController.name);

  constructor(private readonly orderService: OrderService) {}

  /**
   * Crea un nuevo pedido.
   *
   * @param order - Pedido a crear
   * @returns El pedido creado
   */
  @Post()
  @RequirePermission('orders', 'write')
  @MapResponse(OrderResponseDto)
  @ApiOperation({ summary: 'Crear un nuevo pedido' })
  @ApiOkResponse({ type: OrderResponseDto, description: 'Pedido creado (vista pública).' })
  @ApiResponse({ status: 201, description: 'El pedido ha sido creado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async create(@Body() order: Order) {
    return this.orderService.create(order);
  }

  /**
   * Obtiene todos los pedidos de la empresa indicada.
   *
   * @param enterpriseId - UUID de la empresa (query)
   * @param page - Número de página
   * @param pageSize - Tamaño de página
   * @param sort - Campo de ordenación
   * @param order - Dirección de ordenación
   * @param filter - Filtros JSON
   * @param relations - Relaciones a incluir
   * @returns Pedidos paginados
   */
  @Get()
  @RequirePermission('orders', 'read')
  @RequireEnterpriseId()
  @MapResponse(OrderResponseDto)
  @ApiOperation({ summary: 'Obtener todos los pedidos' })
  @ApiOkResponse({ type: OrderResponseDto, isArray: true, description: 'Pedidos (vista pública).' })
  @ApiResponse({ status: 200, description: 'Los pedidos han sido obtenidos correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findAll(
    @Query('enterpriseId') enterpriseId: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('sort') sort: string = 'date',
    @Query('order') order: 'ASC' | 'DESC' = 'DESC',
    @Query('filter') filter?: string,
    @Query('relations') relations?: string,
  ): Promise<PaginatedResponse<Order>> {
    if (!enterpriseId) {
      throw new HttpException('Es obligatorio especificar el ID de la empresa', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(
      `Obtención de pedidos - Empresa: ${enterpriseId}, Página: ${page}, Tamaño: ${pageSize}, Ordenación: ${sort} ${order}, Filtros: ${filter}, Relaciones: ${relations}`,
    );

    const pageNumber = Number(page);
    const pageSizeNumber = Number(pageSize);
    const relationsArray = relations ? relations.split(',') : [];
    if (!relationsArray.includes('client')) {
      relationsArray.push('client');
    }

    let filterObj: Record<string, any> = {
      'client.enterpriseId': enterpriseId,
    };
    if (filter) {
      try {
        filterObj = {
          ...JSON.parse(filter),
          ...filterObj,
        };
      } catch (error) {
        this.logger.error('Error al parsear el filtro JSON de pedidos', error);
      }
    }

    const result = await this.orderService.findAll(
      pageNumber,
      pageSizeNumber,
      sort,
      order,
      filterObj,
      relationsArray,
    );
    this.logger.log(`Pedidos obtenidos: ${result.items.length} de ${result.total}`);
    return result;
  }

  /** Descarga el pedido completando la plantilla DOCX de la empresa. */
  @Get(':id/document')
  @RequirePermission('orders', 'read')
  @ApiOperation({ summary: 'Descargar el pedido en Word usando la plantilla de empresa' })
  @ApiResponse({ status: 200, description: 'El documento Word se ha descargado correctamente.' })
  @ApiResponse({ status: 404, description: 'Pedido o plantilla Word no encontrados.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async downloadDocumentById(@Param('id') id: string, @Res() response: Response): Promise<void> {
    await this.orderService.downloadDocumentById(id, response);
  }

  /**
   * Obtiene un pedido por su identificador.
   *
   * @param id - UUID del pedido
   * @param relations - Relaciones a incluir
   * @returns El pedido
   */
  @Get(':id')
  @RequirePermission('orders', 'read')
  @MapResponse(OrderResponseDto)
  @ApiOperation({ summary: 'Obtener un pedido por su id' })
  @ApiOkResponse({ type: OrderResponseDto, description: 'Pedido (vista pública).' })
  @ApiResponse({ status: 200, description: 'El pedido ha sido obtenido correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findById(@Param('id') id: string, @Query('relations') relations?: string) {
    const relationsArray = relations ? relations.split(',') : [];
    return this.orderService.findById(id, relationsArray);
  }

  /**
   * Actualiza un pedido por su identificador.
   *
   * @param id - UUID del pedido
   * @param order - Datos a actualizar
   * @returns El pedido actualizado
   */
  @Patch(':id')
  @RequirePermission('orders', 'write')
  @MapResponse(OrderResponseDto)
  @ApiOperation({ summary: 'Actualizar un pedido por su id' })
  @ApiOkResponse({ type: OrderResponseDto, description: 'Pedido actualizado (vista pública).' })
  @ApiResponse({ status: 200, description: 'El pedido ha sido actualizado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async updateById(@Param('id') id: string, @Body() order: Order) {
    return this.orderService.updateById(id, order);
  }

  /**
   * Actualiza el estado de un pedido.
   *
   * @param id - UUID del pedido
   * @param status - Nuevo estado
   * @returns El pedido actualizado
   */
  @Patch(':id/status')
  @RequirePermission('orders', 'write')
  @MapResponse(OrderResponseDto)
  @ApiOperation({ summary: 'Actualizar el estado de un pedido por su ID' })
  @ApiOkResponse({ type: OrderResponseDto, description: 'Pedido actualizado (vista pública).' })
  @ApiResponse({ status: 200, description: 'El pedido ha sido actualizado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async updateStatusById(
    @Param('id') id: string,
    @Query('status') status: OrderStatus,
  ): Promise<Order> {
    return this.orderService.updateStatusById(id, status);
  }

  /**
   * Elimina un pedido por su identificador.
   *
   * @param id - UUID del pedido
   * @returns Resultado de la eliminación
   */
  @Delete(':id')
  @RequirePermission('orders', 'delete')
  @ApiOperation({ summary: 'Eliminar un pedido por su id' })
  @ApiResponse({ status: 200, description: 'El pedido ha sido eliminado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async delete(@Param('id') id: string) {
    return this.orderService.deleteById(id);
  }
}
