import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { QuoteConcept } from 'src/entities/quote-concept/quote-concept.entity';
import { QuoteConceptResponseDto } from 'src/entities/quote-concept/dto/quote-concept-response.dto';
import { QuoteConceptService } from './quote-concept.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { MapResponse } from 'src/common/decorators/map-response.decorator';
import { RequireEnterpriseId } from 'src/common/decorators/enterprise-access.decorator';
import { RequirePermission } from 'src/common/decorators/enterprise-permission.decorator';

/**
 * API HTTP de líneas de presupuesto.
 * El listado y el alta exigen `enterpriseId` en query; el tenant se resuelve vía presupuesto → cliente.
 * El permiso es el de presupuestos: las líneas no son un recurso de catálogo aparte.
 */
@ApiTags('Conceptos de presupuesto')
@Controller('quote-concepts')
export class QuoteConceptController {
  constructor(private readonly quoteConceptService: QuoteConceptService) {}

  /**
   * Crea una línea en un presupuesto de la empresa de la query.
   * @param enterpriseId - Empresa objetivo
   * @param quoteConcept - Datos de la línea
   * @returns La línea creada
   */
  @Post()
  @RequirePermission('quotes', 'write')
  @RequireEnterpriseId()
  @MapResponse(QuoteConceptResponseDto)
  @ApiOperation({ summary: 'Crear un concepto de presupuesto' })
  @ApiOkResponse({ type: QuoteConceptResponseDto, description: 'Concepto creado (vista pública).' })
  @ApiResponse({ status: 201, description: 'El concepto ha sido creado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async create(
    @Query('enterpriseId') enterpriseId: string,
    @Body() quoteConcept: QuoteConcept,
  ): Promise<QuoteConcept> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.quoteConceptService.create(quoteConcept, enterpriseId);
  }

  /**
   * Lista las líneas de los presupuestos de una empresa.
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
  @RequirePermission('quotes', 'read')
  @RequireEnterpriseId()
  @MapResponse(QuoteConceptResponseDto)
  @ApiOperation({ summary: 'Obtener los conceptos de presupuesto de una empresa' })
  @ApiOkResponse({
    type: QuoteConceptResponseDto,
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
  ): Promise<PaginatedResponse<QuoteConcept>> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }

    const pageNumber = Number(page);
    const pageSizeNumber = Number(pageSize);
    const relationsArray = relations ? relations.split(',') : [];
    if (!relationsArray.includes('quote')) {
      relationsArray.push('quote');
    }
    if (!relationsArray.includes('quote.client')) {
      relationsArray.push('quote.client');
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

    return this.quoteConceptService.findAll(
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
  @RequirePermission('quotes', 'read')
  @MapResponse(QuoteConceptResponseDto)
  @ApiOperation({ summary: 'Obtener un concepto de presupuesto por su id' })
  @ApiOkResponse({ type: QuoteConceptResponseDto, description: 'Concepto (vista pública).' })
  @ApiResponse({ status: 200, description: 'El concepto ha sido obtenido correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findById(
    @Param('id') id: string,
    @Query('relations') relations?: string,
  ): Promise<QuoteConcept> {
    const relationsArray = relations ? relations.split(',') : [];
    return this.quoteConceptService.findById(id, relationsArray);
  }

  /**
   * Actualiza una línea por identificador.
   * @param id - UUID de la línea
   * @param quoteConcept - Campos a actualizar
   * @returns La línea actualizada
   */
  @Patch(':id')
  @RequirePermission('quotes', 'write')
  @MapResponse(QuoteConceptResponseDto)
  @ApiOperation({ summary: 'Actualizar un concepto de presupuesto por su id' })
  @ApiOkResponse({
    type: QuoteConceptResponseDto,
    description: 'Concepto actualizado (vista pública).',
  })
  @ApiResponse({ status: 200, description: 'El concepto ha sido actualizado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async updateById(
    @Param('id') id: string,
    @Body() quoteConcept: QuoteConcept,
  ): Promise<QuoteConcept> {
    return this.quoteConceptService.updateById(id, quoteConcept);
  }

  /**
   * Elimina una línea por identificador.
   * @param id - UUID de la línea
   * @returns Resultado del borrado
   */
  @Delete(':id')
  @RequirePermission('quotes', 'delete')
  @ApiOperation({ summary: 'Eliminar un concepto de presupuesto por su id' })
  @ApiResponse({ status: 200, description: 'El concepto ha sido eliminado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async delete(@Param('id') id: string): Promise<unknown> {
    return this.quoteConceptService.deleteById(id);
  }
}
