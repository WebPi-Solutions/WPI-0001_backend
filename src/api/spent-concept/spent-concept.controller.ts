import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SpentConcept } from 'src/entities/spent-concept/spent-concept.entity';
import { SpentConceptResponseDto } from 'src/entities/spent-concept/dto/spent-concept-response.dto';
import { SpentConceptService } from './spent-concept.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { MapResponse } from 'src/common/decorators/map-response.decorator';
import { RequireEnterpriseId } from 'src/common/decorators/enterprise-access.decorator';
import { RequirePermission } from 'src/common/decorators/enterprise-permission.decorator';

/**
 * API HTTP de líneas de gasto.
 * El listado y el alta exigen `enterpriseId` en query; el tenant se resuelve vía gasto → proveedor.
 * El permiso es el de gastos: las líneas no son un recurso de catálogo aparte.
 */
@ApiTags('Conceptos de gasto')
@Controller('spent-concepts')
export class SpentConceptController {
  constructor(private readonly spentConceptService: SpentConceptService) {}

  /**
   * Crea una línea en un gasto de la empresa de la query.
   * @param enterpriseId - Empresa objetivo
   * @param spentConcept - Datos de la línea
   * @returns La línea creada
   */
  @Post()
  @RequirePermission('spents', 'write')
  @RequireEnterpriseId()
  @MapResponse(SpentConceptResponseDto)
  @ApiOperation({ summary: 'Crear un concepto de gasto' })
  @ApiOkResponse({ type: SpentConceptResponseDto, description: 'Concepto creado (vista pública).' })
  @ApiResponse({ status: 201, description: 'El concepto ha sido creado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async create(
    @Query('enterpriseId') enterpriseId: string,
    @Body() spentConcept: SpentConcept,
  ): Promise<SpentConcept> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.spentConceptService.create(spentConcept, enterpriseId);
  }

  /**
   * Lista las líneas de los gastos de una empresa.
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
  @RequirePermission('spents', 'read')
  @RequireEnterpriseId()
  @MapResponse(SpentConceptResponseDto)
  @ApiOperation({ summary: 'Obtener los conceptos de gasto de una empresa' })
  @ApiOkResponse({
    type: SpentConceptResponseDto,
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
  ): Promise<PaginatedResponse<SpentConcept>> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }

    const pageNumber = Number(page);
    const pageSizeNumber = Number(pageSize);
    const relationsArray = relations ? relations.split(',') : [];
    if (!relationsArray.includes('spent')) {
      relationsArray.push('spent');
    }
    if (!relationsArray.includes('spent.supplier')) {
      relationsArray.push('spent.supplier');
    }

    let filterObj: Record<string, unknown> = {
      'supplier.enterpriseId': enterpriseId,
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

    return this.spentConceptService.findAll(
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
  @RequirePermission('spents', 'read')
  @MapResponse(SpentConceptResponseDto)
  @ApiOperation({ summary: 'Obtener un concepto de gasto por su id' })
  @ApiOkResponse({ type: SpentConceptResponseDto, description: 'Concepto (vista pública).' })
  @ApiResponse({ status: 200, description: 'El concepto ha sido obtenido correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findById(
    @Param('id') id: string,
    @Query('relations') relations?: string,
  ): Promise<SpentConcept> {
    const relationsArray = relations ? relations.split(',') : [];
    return this.spentConceptService.findById(id, relationsArray);
  }

  /**
   * Actualiza una línea por identificador.
   * @param id - UUID de la línea
   * @param spentConcept - Campos a actualizar
   * @returns La línea actualizada
   */
  @Patch(':id')
  @RequirePermission('spents', 'write')
  @MapResponse(SpentConceptResponseDto)
  @ApiOperation({ summary: 'Actualizar un concepto de gasto por su id' })
  @ApiOkResponse({
    type: SpentConceptResponseDto,
    description: 'Concepto actualizado (vista pública).',
  })
  @ApiResponse({ status: 200, description: 'El concepto ha sido actualizado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async updateById(
    @Param('id') id: string,
    @Body() spentConcept: SpentConcept,
  ): Promise<SpentConcept> {
    return this.spentConceptService.updateById(id, spentConcept);
  }

  /**
   * Elimina una línea por identificador.
   * @param id - UUID de la línea
   * @returns Resultado del borrado
   */
  @Delete(':id')
  @RequirePermission('spents', 'delete')
  @ApiOperation({ summary: 'Eliminar un concepto de gasto por su id' })
  @ApiResponse({ status: 200, description: 'El concepto ha sido eliminado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async delete(@Param('id') id: string): Promise<unknown> {
    return this.spentConceptService.deleteById(id);
  }
}
