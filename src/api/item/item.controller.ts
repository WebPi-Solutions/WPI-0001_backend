import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Item } from 'src/entities/item/item.entity';
import { ItemResponseDto } from 'src/entities/item/dto/item-response.dto';
import { ItemService } from './item.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { MapResponse } from 'src/common/decorators/map-response.decorator';
import { RequireEnterpriseId } from 'src/common/decorators/enterprise-access.decorator';
import { RequirePermission } from 'src/common/decorators/enterprise-permission.decorator';

/**
 * API HTTP de artículos.
 * El listado y el alta exigen `enterpriseId` en query; el tenant de cada fila se resuelve vía categoría.
 */
@ApiTags('Artículos')
@Controller('items')
export class ItemController {
  constructor(private readonly itemService: ItemService) {}

  /**
   * Crea un artículo en una categoría de la empresa de la query.
   * @param enterpriseId - Empresa objetivo (query)
   * @param item - Datos del artículo
   * @returns El artículo creado
   */
  @Post()
  @RequirePermission('items', 'write')
  @RequireEnterpriseId()
  @MapResponse(ItemResponseDto)
  @ApiOperation({
    summary: 'Crear un artículo',
    description: 'El número de serie solo puede activarse si el stock también está habilitado.',
  })
  @ApiOkResponse({ type: ItemResponseDto, description: 'Artículo creado (vista pública).' })
  @ApiResponse({ status: 201, description: 'El artículo ha sido creado correctamente.' })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos. El número de serie requiere stock habilitado.',
  })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async create(
    @Query('enterpriseId') enterpriseId: string,
    @Body() item: Item,
  ): Promise<Item> {
    if (!enterpriseId) {
      throw new HttpException('Es obligatorio especificar el ID de la empresa', HttpStatus.BAD_REQUEST);
    }

    return this.itemService.create(item, enterpriseId);
  }

  /**
   * Lista los artículos de una empresa (filtro por `itemCategory.enterpriseId`).
   * @param enterpriseId - Empresa objetivo
   * @param page - Página
   * @param pageSize - Tamaño de página
   * @param sort - Campo de ordenación
   * @param order - Dirección de ordenación
   * @param filter - Filtro JSON opcional
   * @param relations - Relaciones separadas por coma
   * @returns Página de artículos
   */
  @Get()
  @RequirePermission('items', 'read')
  @RequireEnterpriseId()
  @MapResponse(ItemResponseDto)
  @ApiOperation({ summary: 'Obtener los artículos de una empresa' })
  @ApiOkResponse({ type: ItemResponseDto, isArray: true, description: 'Artículos (vista pública).' })
  @ApiResponse({ status: 200, description: 'Los artículos han sido obtenidos correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findAll(
    @Query('enterpriseId') enterpriseId: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('sort') sort: string = 'name',
    @Query('order') order: 'ASC' | 'DESC' = 'ASC',
    @Query('filter') filter?: string,
    @Query('relations') relations?: string,
  ): Promise<PaginatedResponse<Item>> {
    if (!enterpriseId) {
      throw new HttpException('Es obligatorio especificar el ID de la empresa', HttpStatus.BAD_REQUEST);
    }

    const pageNumber = Number(page);
    const pageSizeNumber = Number(pageSize);

    // El filtro por tenant usa `itemCategory.enterpriseId`; el JOIN es obligatorio.
    const relationsArray = relations ? relations.split(',') : [];
    if (!relationsArray.includes('itemCategory')) {
      relationsArray.push('itemCategory');
    }

    let filterObj: Record<string, unknown> = {
      'itemCategory.enterpriseId': enterpriseId,
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

    return this.itemService.findAll(
      pageNumber,
      pageSizeNumber,
      sort,
      order,
      filterObj,
      relationsArray,
    );
  }

  /**
   * Obtiene un artículo por identificador.
   * @param id - UUID del artículo
   * @param relations - Relaciones separadas por coma
   * @returns El artículo
   */
  @Get(':id')
  @RequirePermission('items', 'read')
  @MapResponse(ItemResponseDto)
  @ApiOperation({ summary: 'Obtener un artículo por su id' })
  @ApiOkResponse({ type: ItemResponseDto, description: 'Artículo (vista pública).' })
  @ApiResponse({ status: 200, description: 'El artículo ha sido obtenido correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findById(
    @Param('id') id: string,
    @Query('relations') relations?: string,
  ): Promise<Item> {
    const relationsArray = relations ? relations.split(',') : [];
    return this.itemService.findById(id, relationsArray);
  }

  /**
   * Actualiza un artículo por identificador.
   * @param id - UUID del artículo
   * @param item - Campos a actualizar
   * @returns El artículo actualizado
   */
  @Patch(':id')
  @RequirePermission('items', 'write')
  @MapResponse(ItemResponseDto)
  @ApiOperation({
    summary: 'Actualizar un artículo por su id',
    description: 'El número de serie solo puede activarse si el stock también está habilitado.',
  })
  @ApiOkResponse({ type: ItemResponseDto, description: 'Artículo actualizado (vista pública).' })
  @ApiResponse({ status: 200, description: 'El artículo ha sido actualizado correctamente.' })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos. El número de serie requiere stock habilitado.',
  })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async updateById(@Param('id') id: string, @Body() item: Item): Promise<Item> {
    return this.itemService.updateById(id, item);
  }

  /**
   * Elimina un artículo por identificador.
   * @param id - UUID del artículo
   * @returns Resultado del borrado
   */
  @Delete(':id')
  @RequirePermission('items', 'delete')
  @ApiOperation({ summary: 'Eliminar un artículo por su id' })
  @ApiResponse({ status: 200, description: 'El artículo ha sido eliminado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async delete(@Param('id') id: string): Promise<unknown> {
    return this.itemService.deleteById(id);
  }
}
