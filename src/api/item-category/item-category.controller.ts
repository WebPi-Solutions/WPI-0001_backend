import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ItemCategory } from 'src/entities/item-category/item-category.entity';
import { ItemCategoryResponseDto } from 'src/entities/item-category/dto/item-category-response.dto';
import { ItemCategoryService } from './item-category.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { MapResponse } from 'src/common/decorators/map-response.decorator';
import { RequireEnterpriseId } from 'src/common/decorators/enterprise-access.decorator';
import { RequirePermission } from 'src/common/decorators/enterprise-permission.decorator';

/**
 * API HTTP de categorías de artículos.
 * El listado y el alta exigen `enterpriseId` en query; las rutas por UUID resuelven el tenant en el servicio.
 */
@ApiTags('Categorías de artículos')
@Controller('item-categories')
export class ItemCategoryController {
  constructor(private readonly itemCategoryService: ItemCategoryService) {}

  /**
   * Crea una categoría de artículos en la empresa de la query.
   * @param enterpriseId - Empresa objetivo (query)
   * @param itemCategory - Datos de la categoría
   * @returns La categoría creada
   */
  @Post()
  @RequirePermission('itemCategories', 'write')
  @RequireEnterpriseId()
  @MapResponse(ItemCategoryResponseDto)
  @ApiOperation({ summary: 'Crear una categoría de artículos' })
  @ApiOkResponse({ type: ItemCategoryResponseDto, description: 'Categoría creada (vista pública).' })
  @ApiResponse({ status: 201, description: 'La categoría de artículos ha sido creada correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async create(
    @Query('enterpriseId') enterpriseId: string,
    @Body() itemCategory: ItemCategory,
  ): Promise<ItemCategory> {
    if (!enterpriseId) {
      throw new HttpException('Es obligatorio especificar el ID de la empresa', HttpStatus.BAD_REQUEST);
    }
    itemCategory.enterpriseId = enterpriseId;

    return this.itemCategoryService.create(itemCategory);
  }

  /**
   * Lista las categorías de artículos de una empresa.
   * @param enterpriseId - Empresa objetivo
   * @param page - Página
   * @param pageSize - Tamaño de página
   * @param sort - Campo de ordenación
   * @param order - Dirección de ordenación
   * @param filter - Filtro JSON opcional
   * @param relations - Relaciones separadas por coma
   * @returns Página de categorías
   */
  @Get()
  @RequirePermission('itemCategories', 'read')
  @RequireEnterpriseId()
  @MapResponse(ItemCategoryResponseDto)
  @ApiOperation({ summary: 'Obtener las categorías de artículos de una empresa' })
  @ApiOkResponse({
    type: ItemCategoryResponseDto,
    isArray: true,
    description: 'Categorías de artículos (vista pública).',
  })
  @ApiResponse({ status: 200, description: 'Las categorías de artículos han sido obtenidas correctamente.' })
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
  ): Promise<PaginatedResponse<ItemCategory>> {
    if (!enterpriseId) {
      throw new HttpException('Es obligatorio especificar el ID de la empresa', HttpStatus.BAD_REQUEST);
    }

    const pageNumber = Number(page);
    const pageSizeNumber = Number(pageSize);
    const relationsArray = relations ? relations.split(',') : [];

    let filterObj: Record<string, unknown> = {
      enterpriseId,
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

    return this.itemCategoryService.findAll(
      pageNumber,
      pageSizeNumber,
      sort,
      order,
      filterObj,
      relationsArray,
    );
  }

  /**
   * Obtiene una categoría por identificador.
   * @param id - UUID de la categoría
   * @param relations - Relaciones separadas por coma
   * @returns La categoría
   */
  @Get(':id')
  @RequirePermission('itemCategories', 'read')
  @MapResponse(ItemCategoryResponseDto)
  @ApiOperation({ summary: 'Obtener una categoría de artículos por su id' })
  @ApiOkResponse({ type: ItemCategoryResponseDto, description: 'Categoría (vista pública).' })
  @ApiResponse({ status: 200, description: 'La categoría de artículos ha sido obtenida correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findById(
    @Param('id') id: string,
    @Query('relations') relations?: string,
  ): Promise<ItemCategory> {
    const relationsArray = relations ? relations.split(',') : [];
    return this.itemCategoryService.findById(id, relationsArray);
  }

  /**
   * Actualiza una categoría por identificador.
   * @param id - UUID de la categoría
   * @param itemCategory - Campos a actualizar
   * @returns La categoría actualizada
   */
  @Patch(':id')
  @RequirePermission('itemCategories', 'write')
  @MapResponse(ItemCategoryResponseDto)
  @ApiOperation({ summary: 'Actualizar una categoría de artículos por su id' })
  @ApiOkResponse({ type: ItemCategoryResponseDto, description: 'Categoría actualizada (vista pública).' })
  @ApiResponse({ status: 200, description: 'La categoría de artículos ha sido actualizada correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async updateById(
    @Param('id') id: string,
    @Body() itemCategory: ItemCategory,
  ): Promise<ItemCategory> {
    return this.itemCategoryService.updateById(id, itemCategory);
  }

  /**
   * Elimina una categoría por identificador.
   * @param id - UUID de la categoría
   * @returns Resultado del borrado
   */
  @Delete(':id')
  @RequirePermission('itemCategories', 'delete')
  @ApiOperation({ summary: 'Eliminar una categoría de artículos por su id' })
  @ApiResponse({ status: 200, description: 'La categoría de artículos ha sido eliminada correctamente.' })
  @ApiResponse({
    status: 400,
    description: 'No se puede eliminar la categoría porque tiene artículos asociados.',
  })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async delete(@Param('id') id: string): Promise<unknown> {
    return this.itemCategoryService.deleteById(id);
  }
}
