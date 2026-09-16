import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SpentConceptSerial } from 'src/entities/spent-concept-serial/spent-concept-serial.entity';
import { SpentConceptSerialResponseDto } from 'src/entities/spent-concept-serial/dto/spent-concept-serial-response.dto';
import { SpentConceptSerialService } from './spent-concept-serial.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { MapResponse } from 'src/common/decorators/map-response.decorator';
import { RequireEnterpriseId } from 'src/common/decorators/enterprise-access.decorator';
import { RequirePermission } from 'src/common/decorators/enterprise-permission.decorator';

/**
 * API HTTP de números de serie de línea de gasto.
 * El listado exige `enterpriseId` y `spentConceptId` en query.
 * El permiso es el de gastos.
 */
@ApiTags('Números de serie de conceptos de gasto')
@Controller('spent-concept-serials')
export class SpentConceptSerialController {
  constructor(
    private readonly spentConceptSerialService: SpentConceptSerialService,
  ) {}

  /**
   * Crea un número de serie en una línea de la empresa de la query.
   * @param enterpriseId - Empresa objetivo
   * @param spentConceptSerial - Datos del número de serie
   * @returns El registro creado
   */
  @Post()
  @RequirePermission('spents', 'write')
  @RequireEnterpriseId()
  @MapResponse(SpentConceptSerialResponseDto)
  @ApiOperation({ summary: 'Crear un número de serie de concepto de gasto' })
  @ApiOkResponse({
    type: SpentConceptSerialResponseDto,
    description: 'Número de serie creado (vista pública).',
  })
  @ApiResponse({ status: 201, description: 'El número de serie ha sido creado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async create(
    @Query('enterpriseId') enterpriseId: string,
    @Body() spentConceptSerial: SpentConceptSerial,
  ): Promise<SpentConceptSerial> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.spentConceptSerialService.create(spentConceptSerial, enterpriseId);
  }

  /**
   * Lista los números de serie de una línea. Exige `spentConceptId`.
   * @param enterpriseId - Empresa objetivo
   * @param spentConceptId - Línea propietaria
   * @param page - Página
   * @param pageSize - Tamaño de página
   * @param sort - Campo de ordenación
   * @param order - Dirección
   * @param filter - Filtro JSON opcional
   * @param relations - Relaciones separadas por coma
   * @returns Página de números de serie
   */
  @Get()
  @RequirePermission('spents', 'read')
  @RequireEnterpriseId()
  @MapResponse(SpentConceptSerialResponseDto)
  @ApiOperation({ summary: 'Obtener los números de serie de un concepto de gasto' })
  @ApiOkResponse({
    type: SpentConceptSerialResponseDto,
    isArray: true,
    description: 'Números de serie (vista pública).',
  })
  @ApiResponse({ status: 200, description: 'Los números de serie han sido obtenidos correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findAll(
    @Query('enterpriseId') enterpriseId: string,
    @Query('spentConceptId') spentConceptId: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('sort') sort: string = 'createdAt',
    @Query('order') order: 'ASC' | 'DESC' = 'ASC',
    @Query('filter') filter?: string,
    @Query('relations') relations?: string,
  ): Promise<PaginatedResponse<SpentConceptSerial>> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!spentConceptId) {
      throw new HttpException(
        'Es obligatorio especificar el ID del concepto de gasto',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.spentConceptSerialService.assertSpentConceptAccessibleForList(
      spentConceptId,
      enterpriseId,
    );

    const pageNumber = Number(page);
    const pageSizeNumber = Number(pageSize);
    const relationsArray = relations ? relations.split(',') : [];
    if (!relationsArray.includes('spentConcept')) {
      relationsArray.push('spentConcept');
    }

    let filterObj: Record<string, unknown> = {
      spentConceptId,
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

    return this.spentConceptSerialService.findAll(
      pageNumber,
      pageSizeNumber,
      sort,
      order,
      filterObj,
      relationsArray,
    );
  }

  /**
   * Obtiene un número de serie por identificador.
   * @param id - UUID
   * @param relations - Relaciones separadas por coma
   * @returns El registro
   */
  @Get(':id')
  @RequirePermission('spents', 'read')
  @MapResponse(SpentConceptSerialResponseDto)
  @ApiOperation({ summary: 'Obtener un número de serie de concepto por su id' })
  @ApiOkResponse({
    type: SpentConceptSerialResponseDto,
    description: 'Número de serie (vista pública).',
  })
  @ApiResponse({ status: 200, description: 'El número de serie ha sido obtenido correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findById(
    @Param('id') id: string,
    @Query('relations') relations?: string,
  ): Promise<SpentConceptSerial> {
    const relationsArray = relations ? relations.split(',') : [];
    return this.spentConceptSerialService.findById(id, relationsArray);
  }

  /**
   * Actualiza un número de serie por identificador.
   * @param id - UUID
   * @param spentConceptSerial - Campos a actualizar
   * @returns El registro actualizado
   */
  @Patch(':id')
  @RequirePermission('spents', 'write')
  @MapResponse(SpentConceptSerialResponseDto)
  @ApiOperation({ summary: 'Actualizar un número de serie de concepto por su id' })
  @ApiOkResponse({
    type: SpentConceptSerialResponseDto,
    description: 'Número de serie actualizado (vista pública).',
  })
  @ApiResponse({ status: 200, description: 'El número de serie ha sido actualizado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async updateById(
    @Param('id') id: string,
    @Body() spentConceptSerial: SpentConceptSerial,
  ): Promise<SpentConceptSerial> {
    return this.spentConceptSerialService.updateById(id, spentConceptSerial);
  }

  /**
   * Elimina un número de serie por identificador.
   * @param id - UUID
   * @returns Resultado del borrado
   */
  @Delete(':id')
  @RequirePermission('spents', 'delete')
  @ApiOperation({ summary: 'Eliminar un número de serie de concepto por su id' })
  @ApiResponse({ status: 200, description: 'El número de serie ha sido eliminado correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async delete(@Param('id') id: string): Promise<unknown> {
    return this.spentConceptSerialService.deleteById(id);
  }
}
