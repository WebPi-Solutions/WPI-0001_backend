import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DefaultSchedule } from 'src/entities/default-schedule/default-schedule.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { DefaultScheduleService } from './default-schedule.service';
import { CreateDefaultScheduleDto } from './dto/create-default-schedule.dto';
import { UpdateDefaultScheduleDto } from './dto/update-default-schedule.dto';

/**
 * Endpoints REST para plantillas de horario por defecto (`default_schedules`).
 */
@ApiTags('Plantillas de horario')
@Controller('default-schedules')
export class DefaultScheduleController {
  constructor(
    private readonly defaultScheduleService: DefaultScheduleService,
  ) {}

  /**
   * Crea una plantilla para la empresa indicada en query.
   * @param enterpriseId - ID de empresa (obligatorio)
   * @param dto - Datos de creación
   * @returns Plantilla creada
   */
  @Post()
  @ApiOperation({ summary: 'Crear una plantilla de horario por defecto' })
  @ApiResponse({ status: 201, description: 'Plantilla creada correctamente.' })
  @ApiResponse({
    status: 400,
    description: 'Petición inválida (falta enterpriseId o cuerpo).',
  })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async create(
    @Query('enterpriseId') enterpriseId: string,
    @Body() dto: CreateDefaultScheduleDto,
  ): Promise<DefaultSchedule> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.defaultScheduleService.create(enterpriseId, dto);
  }

  /**
   * Lista plantillas con paginación; siempre filtradas por `enterpriseId`.
   * @param enterpriseId - Empresa (obligatorio)
   * @returns Página de plantillas
   */
  @Get()
  @ApiOperation({ summary: 'Listar plantillas de horario por empresa' })
  @ApiResponse({ status: 200, description: 'Listado obtenido correctamente.' })
  @ApiResponse({ status: 400, description: 'Falta enterpriseId.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findAll(
    @Query('enterpriseId') enterpriseId: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('sort') sort: string = 'name',
    @Query('order') order: 'ASC' | 'DESC' = 'ASC',
    @Query('filter') filter?: string,
    @Query('relations') relations?: string,
  ): Promise<PaginatedResponse<DefaultSchedule>> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }

    const pageNumber = Number(page);
    const pageSizeNumber = Number(pageSize);
    const relationsArray = relations ? relations.split(',') : [];

    let filterObj: Record<string, unknown> = { enterpriseId };
    if (filter) {
      try {
        filterObj = {
          ...JSON.parse(filter),
          enterpriseId,
        };
      } catch (error) {
        console.error(
          'Error al parsear filter JSON (default-schedules):',
          error,
        );
      }
    }

    return this.defaultScheduleService.findAll(
      pageNumber,
      pageSizeNumber,
      sort,
      order,
      filterObj,
      relationsArray,
    );
  }

  /**
   * Obtiene una plantilla por id comprobando la empresa.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @returns Plantilla
   */
  @Get(':id')
  @ApiOperation({ summary: 'Obtener una plantilla de horario por id' })
  @ApiResponse({ status: 200, description: 'Plantilla encontrada.' })
  @ApiResponse({
    status: 404,
    description: 'No encontrada o no pertenece a la empresa.',
  })
  @ApiResponse({ status: 400, description: 'Falta enterpriseId.' })
  async findById(
    @Param('id') id: string,
    @Query('enterpriseId') enterpriseId: string,
    @Query('relations') relations?: string,
  ): Promise<DefaultSchedule> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    const relationsArray = relations ? relations.split(',') : [];
    return this.defaultScheduleService.findById(
      id,
      enterpriseId,
      relationsArray,
    );
  }

  /**
   * Actualiza una plantilla (solo campos permitidos en servicio).
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @param dto - Campos a actualizar
   * @returns Plantilla actualizada
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una plantilla de horario' })
  @ApiResponse({ status: 200, description: 'Actualización correcta.' })
  @ApiResponse({ status: 404, description: 'No encontrada.' })
  @ApiResponse({ status: 400, description: 'Falta enterpriseId.' })
  async updateById(
    @Param('id') id: string,
    @Query('enterpriseId') enterpriseId: string,
    @Body() dto: UpdateDefaultScheduleDto,
  ): Promise<DefaultSchedule> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.defaultScheduleService.updateById(id, enterpriseId, dto);
  }

  /**
   * Elimina una plantilla si pertenece a la empresa.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @returns Resultado del borrado
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una plantilla de horario' })
  @ApiResponse({ status: 200, description: 'Eliminación correcta.' })
  @ApiResponse({ status: 404, description: 'No encontrada.' })
  @ApiResponse({ status: 400, description: 'Falta enterpriseId.' })
  async delete(
    @Param('id') id: string,
    @Query('enterpriseId') enterpriseId: string,
  ) {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.defaultScheduleService.deleteById(id, enterpriseId);
  }
}
