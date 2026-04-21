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
import { Holiday } from 'src/entities/holiday/holiday.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';
import { HolidayService } from './holiday.service';

/**
 * Endpoints REST para festivos (`holidays`).
 */
@ApiTags('Festivos')
@Controller('holidays')
export class HolidayController {
  constructor(private readonly holidayService: HolidayService) {}

  /**
   * Crea un festivo para la empresa del query param.
   * @param enterpriseId - Empresa (obligatorio)
   * @param dto - Datos del festivo
   * @returns Festivo creado
   */
  @Post()
  @ApiOperation({ summary: 'Crear un festivo' })
  @ApiResponse({ status: 201, description: 'Festivo creado correctamente.' })
  @ApiResponse({ status: 400, description: 'Petición inválida.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async create(
    @Query('enterpriseId') enterpriseId: string,
    @Body() dto: CreateHolidayDto,
  ): Promise<Holiday> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.holidayService.create(enterpriseId, dto);
  }

  /**
   * Lista festivos de la empresa con paginación.
   * @param enterpriseId - Empresa (obligatorio)
   * @returns Página de festivos
   */
  @Get()
  @ApiOperation({ summary: 'Listar festivos por empresa' })
  @ApiResponse({ status: 200, description: 'Listado obtenido correctamente.' })
  @ApiResponse({ status: 400, description: 'Falta enterpriseId.' })
  async findAll(
    @Query('enterpriseId') enterpriseId: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('sort') sort: string = 'calendarDate',
    @Query('order') order: 'ASC' | 'DESC' = 'ASC',
    @Query('filter') filter?: string,
    @Query('relations') relations?: string,
  ): Promise<PaginatedResponse<Holiday>> {
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
        console.error('Error al parsear filter JSON (holidays):', error);
      }
    }

    return this.holidayService.findAll(
      pageNumber,
      pageSizeNumber,
      sort,
      order,
      filterObj,
      relationsArray,
    );
  }

  /**
   * Obtiene un festivo por id validando la empresa.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @returns Festivo
   */
  @Get(':id')
  @ApiOperation({ summary: 'Obtener un festivo por id' })
  @ApiResponse({ status: 200, description: 'Festivo encontrado.' })
  @ApiResponse({ status: 404, description: 'No encontrado.' })
  @ApiResponse({ status: 400, description: 'Falta enterpriseId.' })
  async findById(
    @Param('id') id: string,
    @Query('enterpriseId') enterpriseId: string,
    @Query('relations') relations?: string,
  ): Promise<Holiday> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    const relationsArray = relations ? relations.split(',') : [];
    return this.holidayService.findById(id, enterpriseId, relationsArray);
  }

  /**
   * Actualiza un festivo (solo campos permitidos).
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @param dto - Campos opcionales
   * @returns Festivo actualizado
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un festivo' })
  @ApiResponse({ status: 200, description: 'Actualización correcta.' })
  @ApiResponse({ status: 404, description: 'No encontrado.' })
  @ApiResponse({ status: 400, description: 'Falta enterpriseId.' })
  async updateById(
    @Param('id') id: string,
    @Query('enterpriseId') enterpriseId: string,
    @Body() dto: UpdateHolidayDto,
  ): Promise<Holiday> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.holidayService.updateById(id, enterpriseId, dto);
  }

  /**
   * Elimina un festivo de la empresa.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @returns Resultado del borrado
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un festivo' })
  @ApiResponse({ status: 200, description: 'Eliminación correcta.' })
  @ApiResponse({ status: 404, description: 'No encontrado.' })
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
    return this.holidayService.deleteById(id, enterpriseId);
  }
}
