import { Controller, Get, HttpException, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StockMovement } from 'src/entities/stock-movement/stock-movement.entity';
import { StockMovementResponseDto } from 'src/entities/stock-movement/dto/stock-movement-response.dto';
import { StockMovementService } from './stock-movement.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { MapResponse } from 'src/common/decorators/map-response.decorator';
import { RequireEnterpriseId } from 'src/common/decorators/enterprise-access.decorator';
import { RequirePermission } from 'src/common/decorators/enterprise-permission.decorator';

/**
 * API HTTP del kardex de artículos.
 * El listado exige `enterpriseId` e `itemId` en query.
 */
@ApiTags('Movimientos de stock')
@Controller('stock-movements')
export class StockMovementController {
  constructor(private readonly stockMovementService: StockMovementService) {}

  /**
   * Lista los movimientos de kardex de un artículo.
   * @param enterpriseId - Empresa objetivo
   * @param itemId - Artículo
   * @param page - Página
   * @param pageSize - Tamaño de página
   * @param sort - Campo de ordenación
   * @param order - Dirección
   * @param filter - Filtro JSON opcional
   * @param relations - Relaciones separadas por coma
   * @returns Página de movimientos
   */
  @Get()
  @RequirePermission('items', 'read')
  @RequireEnterpriseId()
  @MapResponse(StockMovementResponseDto)
  @ApiOperation({ summary: 'Obtener los movimientos de stock de un artículo' })
  @ApiOkResponse({
    type: StockMovementResponseDto,
    isArray: true,
    description: 'Movimientos de kardex (vista pública).',
  })
  @ApiResponse({ status: 200, description: 'Los movimientos han sido obtenidos correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findAll(
    @Query('enterpriseId') enterpriseId: string,
    @Query('itemId') itemId: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('sort') sort: string = 'occurredAt',
    @Query('order') order: 'ASC' | 'DESC' = 'DESC',
    @Query('filter') filter?: string,
    @Query('relations') relations?: string,
  ): Promise<PaginatedResponse<StockMovement>> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!itemId) {
      throw new HttpException(
        'Es obligatorio especificar el ID del artículo',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.stockMovementService.assertItemAccessibleForList(itemId, enterpriseId);

    const pageNumber = Number(page);
    const pageSizeNumber = Number(pageSize);
    const relationsArray = relations ? relations.split(',') : [];
    if (!relationsArray.includes('item')) {
      relationsArray.push('item');
    }
    if (!relationsArray.includes('itemSerial')) {
      relationsArray.push('itemSerial');
    }

    let filterObj: Record<string, unknown> = { itemId };
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

    return this.stockMovementService.findAll(
      pageNumber,
      pageSizeNumber,
      sort,
      order,
      filterObj,
      relationsArray,
    );
  }

  /**
   * Obtiene un movimiento por identificador.
   * @param id - UUID
   * @param relations - Relaciones separadas por coma
   * @returns El registro
   */
  @Get(':id')
  @RequirePermission('items', 'read')
  @MapResponse(StockMovementResponseDto)
  @ApiOperation({ summary: 'Obtener un movimiento de stock por su id' })
  @ApiOkResponse({
    type: StockMovementResponseDto,
    description: 'Movimiento de kardex (vista pública).',
  })
  @ApiResponse({ status: 200, description: 'El movimiento ha sido obtenido correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findById(
    @Param('id') id: string,
    @Query('relations') relations?: string,
  ): Promise<StockMovement> {
    const relationsArray = relations ? relations.split(',') : [];
    return this.stockMovementService.findById(id, relationsArray);
  }
}
