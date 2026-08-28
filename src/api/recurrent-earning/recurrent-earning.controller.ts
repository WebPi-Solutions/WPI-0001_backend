import { Body, Controller, Delete, Get, HttpException, HttpStatus, Logger, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RecurrentEarning } from 'src/entities/recurrent-earning/recurrent-earning.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { RecurrentEarningService } from './recurrent-earning.service';

/**
 * Controlador REST de ingresos recurrentes.
 * Expone el CRUD de la entidad RecurrentEarning filtrado por empresa.
 */
@ApiTags('Ingresos recurrentes')
@Controller('recurrent-earnings')
export class RecurrentEarningController {
  private readonly logger = new Logger(RecurrentEarningController.name);

  constructor(private readonly recurrentEarningService: RecurrentEarningService) {}

  /**
   * Crea un nuevo ingreso recurrente.
   * @param enterpriseId - ID de la empresa propietaria
   * @param recurrentEarning - Datos del ingreso recurrente
   * @returns El ingreso recurrente creado
   */
  @Post()
  @ApiOperation({ summary: 'Crear un nuevo ingreso recurrente' })
  @ApiResponse({ status: 201, description: 'El ingreso recurrente ha sido creado correctamente.' })
  @ApiResponse({ status: 400, description: 'Petición inválida.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async create(
    @Query('enterpriseId') enterpriseId: string,
    @Body() recurrentEarning: RecurrentEarning,
  ) {
    if (!enterpriseId) {
      throw new HttpException('Es obligatorio especificar el ID de la empresa', HttpStatus.BAD_REQUEST);
    }

    recurrentEarning.enterpriseId = enterpriseId;
    return this.recurrentEarningService.create(recurrentEarning);
  }

  /**
   * Obtiene todos los ingresos recurrentes de una empresa.
   * @param enterpriseId - ID de la empresa
   * @param page - Número de página
   * @param pageSize - Tamaño de página
   * @param sort - Campo de ordenación
   * @param order - Dirección de ordenación
   * @param filter - Filtros adicionales en JSON
   * @param relations - Relaciones a incluir, separadas por coma
   * @returns Respuesta paginada con los ingresos recurrentes
   */
  @Get()
  @ApiOperation({ summary: 'Obtener todos los ingresos recurrentes' })
  @ApiResponse({ status: 200, description: 'Los ingresos recurrentes han sido obtenidos correctamente.' })
  @ApiResponse({ status: 400, description: 'Petición inválida.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findAll(
    @Query('enterpriseId') enterpriseId: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('sort') sort: string = 'createdAt',
    @Query('order') order: 'ASC' | 'DESC' = 'DESC',
    @Query('filter') filter?: string,
    @Query('relations') relations?: string,
  ): Promise<PaginatedResponse<RecurrentEarning>> {
    if (!enterpriseId) {
      throw new HttpException('Es obligatorio especificar el ID de la empresa', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(
      `Obtención de ingresos recurrentes - Empresa: ${enterpriseId}, Página: ${page}, Tamaño: ${pageSize}, Ordenación: ${sort} ${order}, Filtros: ${filter}, Relaciones: ${relations}`,
    );

    const pageNumber = Number(page);
    const pageSizeNumber = Number(pageSize);
    const relationsArray = relations ? relations.split(',') : [];

    let filterObj: Record<string, any> = {
      enterpriseId,
    };

    if (filter) {
      try {
        filterObj = {
          ...JSON.parse(filter),
          ...filterObj,
        };
      } catch (error) {
        this.logger.error('Error al parsear el filtro JSON de ingresos recurrentes:', error);
      }
    }

    const result = await this.recurrentEarningService.findAll(
      pageNumber,
      pageSizeNumber,
      sort,
      order,
      filterObj,
      relationsArray,
    );
    this.logger.log(`Ingresos recurrentes obtenidos: ${result.items.length} de ${result.total}`);
    return result;
  }

  /**
   * Obtiene un ingreso recurrente por su ID.
   * @param id - El ID del ingreso recurrente
   * @param relations - Relaciones a incluir, separadas por coma
   * @returns El ingreso recurrente
   */
  @Get(':id')
  @ApiOperation({ summary: 'Obtener un ingreso recurrente por su id' })
  @ApiResponse({ status: 200, description: 'El ingreso recurrente ha sido obtenido correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Ingreso recurrente no encontrado.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findById(@Param('id') id: string, @Query('relations') relations?: string) {
    const relationsArray = relations ? relations.split(',') : [];
    return this.recurrentEarningService.findById(id, relationsArray);
  }

  /**
   * Actualiza un ingreso recurrente por su ID.
   * @param id - El ID del ingreso recurrente
   * @param recurrentEarning - Datos a actualizar
   * @returns El ingreso recurrente actualizado
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un ingreso recurrente por su id' })
  @ApiResponse({ status: 200, description: 'El ingreso recurrente ha sido actualizado correctamente.' })
  @ApiResponse({ status: 400, description: 'Petición inválida.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Ingreso recurrente no encontrado.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async updateById(@Param('id') id: string, @Body() recurrentEarning: RecurrentEarning) {
    return this.recurrentEarningService.updateById(id, recurrentEarning);
  }

  /**
   * Elimina un ingreso recurrente por su ID.
   * @param id - El ID del ingreso recurrente
   * @returns El resultado de la eliminación
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un ingreso recurrente por su id' })
  @ApiResponse({ status: 200, description: 'El ingreso recurrente ha sido eliminado correctamente.' })
  @ApiResponse({ status: 400, description: 'El ingreso recurrente tiene facturas asociadas.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Ingreso recurrente no encontrado.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async deleteById(@Param('id') id: string) {
    return this.recurrentEarningService.deleteById(id);
  }
}
