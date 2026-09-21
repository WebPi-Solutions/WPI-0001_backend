import { Controller, Get, HttpException, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ItemSerial } from 'src/entities/item-serial/item-serial.entity';
import { ItemSerialResponseDto } from 'src/entities/item-serial/dto/item-serial-response.dto';
import { ItemSerialService } from './item-serial.service';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { MapResponse } from 'src/common/decorators/map-response.decorator';
import { RequireEnterpriseId } from 'src/common/decorators/enterprise-access.decorator';
import { RequirePermission } from 'src/common/decorators/enterprise-permission.decorator';

/**
 * API HTTP de números de serie canónicos de artículo.
 * El listado exige `enterpriseId` e `itemId` en query.
 */
@ApiTags('Números de serie de artículos')
@Controller('item-serials')
export class ItemSerialController {
  constructor(private readonly itemSerialService: ItemSerialService) {}

  /**
   * Lista los números de serie de un artículo.
   * @param enterpriseId - Empresa objetivo
   * @param itemId - Artículo propietario
   * @param status - Estado opcional
   * @param page - Página
   * @param pageSize - Tamaño de página
   * @param sort - Campo de ordenación
   * @param order - Dirección
   * @param filter - Filtro JSON opcional
   * @param relations - Relaciones separadas por coma
   * @returns Página de números de serie
   */
  @Get()
  @RequirePermission('items', 'read')
  @RequireEnterpriseId()
  @MapResponse(ItemSerialResponseDto)
  @ApiOperation({
    summary: 'Obtener los números de serie de un artículo',
    description: 'Filtra por artículo. `status=in_stock` alimenta el selector de venta.',
  })
  @ApiOkResponse({
    type: ItemSerialResponseDto,
    isArray: true,
    description: 'Números de serie (vista pública).',
  })
  @ApiResponse({ status: 200, description: 'Los números de serie han sido obtenidos correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findAll(
    @Query('enterpriseId') enterpriseId: string,
    @Query('itemId') itemId: string,
    @Query('status') status?: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('sort') sort: string = 'serialNumber',
    @Query('order') order: 'ASC' | 'DESC' = 'ASC',
    @Query('filter') filter?: string,
    @Query('relations') relations?: string,
  ): Promise<PaginatedResponse<ItemSerial>> {
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

    await this.itemSerialService.assertItemAccessibleForList(itemId, enterpriseId);
    const parsedStatus = this.itemSerialService.parseStatusFilter(status);

    const pageNumber = Number(page);
    const pageSizeNumber = Number(pageSize);
    const relationsArray = relations ? relations.split(',') : [];
    if (!relationsArray.includes('item')) {
      relationsArray.push('item');
    }

    let filterObj: Record<string, unknown> = { itemId };
    if (parsedStatus) {
      filterObj.status = parsedStatus;
    }
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

    return this.itemSerialService.findAll(
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
  @RequirePermission('items', 'read')
  @MapResponse(ItemSerialResponseDto)
  @ApiOperation({ summary: 'Obtener un número de serie de artículo por su id' })
  @ApiOkResponse({
    type: ItemSerialResponseDto,
    description: 'Número de serie (vista pública).',
  })
  @ApiResponse({ status: 200, description: 'El número de serie ha sido obtenido correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findById(
    @Param('id') id: string,
    @Query('relations') relations?: string,
  ): Promise<ItemSerial> {
    const relationsArray = relations ? relations.split(',') : [];
    return this.itemSerialService.findById(id, relationsArray);
  }
}
