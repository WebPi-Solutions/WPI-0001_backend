import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MapResponse } from 'src/common/decorators/map-response.decorator';
import { RequireEnterpriseId } from 'src/common/decorators/enterprise-access.decorator';
import { RequirePermission } from 'src/common/decorators/enterprise-permission.decorator';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { SpentCategoryResponseDto } from 'src/entities/spent-category/dto/spent-category-response.dto';
import { SpentCategory } from 'src/entities/spent-category/spent-category.entity';
import { SpentCategoryService } from './spent-category.service';

/** API HTTP de categorías de gastos. */
@ApiTags('Categorías de gastos')
@Controller('spent-categories')
export class SpentCategoryController {
  constructor(private readonly spentCategoryService: SpentCategoryService) {}

  @Post()
  @RequirePermission('spentCategories', 'write')
  @RequireEnterpriseId()
  @MapResponse(SpentCategoryResponseDto)
  @ApiOperation({ summary: 'Crear una categoría de gastos' })
  @ApiOkResponse({ type: SpentCategoryResponseDto })
  @ApiResponse({ status: 400, description: 'Falta el ID de empresa.' })
  async create(@Query('enterpriseId') enterpriseId: string, @Body() spentCategory: SpentCategory): Promise<SpentCategory> {
    if (!enterpriseId) {
      throw new HttpException('Es obligatorio especificar el ID de la empresa', HttpStatus.BAD_REQUEST);
    }
    spentCategory.enterpriseId = enterpriseId;
    return this.spentCategoryService.create(spentCategory);
  }

  @Get()
  @RequirePermission('spentCategories', 'read')
  @RequireEnterpriseId()
  @MapResponse(SpentCategoryResponseDto)
  @ApiOperation({ summary: 'Obtener las categorías de gastos de una empresa' })
  async findAll(
    @Query('enterpriseId') enterpriseId: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('sort') sort = 'name',
    @Query('order') order: 'ASC' | 'DESC' = 'ASC',
    @Query('filter') filter?: string,
    @Query('relations') relations?: string,
  ): Promise<PaginatedResponse<SpentCategory>> {
    if (!enterpriseId) {
      throw new HttpException('Es obligatorio especificar el ID de la empresa', HttpStatus.BAD_REQUEST);
    }
    let filterObject: Record<string, unknown> = { enterpriseId };
    if (filter) {
      try {
        filterObject = { ...JSON.parse(filter), enterpriseId };
      } catch (error) {
        console.error('Error parsing filter JSON:', error);
      }
    }
    return this.spentCategoryService.findAll(
      Number(page), Number(pageSize), sort, order, filterObject,
      relations ? relations.split(',') : [],
    );
  }

  @Get(':id')
  @RequirePermission('spentCategories', 'read')
  @MapResponse(SpentCategoryResponseDto)
  @ApiOperation({ summary: 'Obtener una categoría de gastos por su id' })
  async findById(@Param('id') id: string, @Query('relations') relations?: string): Promise<SpentCategory> {
    return this.spentCategoryService.findById(id, relations ? relations.split(',') : []);
  }

  @Patch(':id')
  @RequirePermission('spentCategories', 'write')
  @MapResponse(SpentCategoryResponseDto)
  @ApiOperation({ summary: 'Actualizar una categoría de gastos' })
  async updateById(@Param('id') id: string, @Body() spentCategory: SpentCategory): Promise<SpentCategory> {
    return this.spentCategoryService.updateById(id, spentCategory);
  }

  @Delete(':id')
  @RequirePermission('spentCategories', 'delete')
  @ApiOperation({ summary: 'Eliminar una categoría de gastos' })
  async delete(@Param('id') id: string): Promise<unknown> {
    return this.spentCategoryService.deleteById(id);
  }
}
