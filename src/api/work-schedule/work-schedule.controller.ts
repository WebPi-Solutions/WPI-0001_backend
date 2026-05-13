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
import { MapResponse } from 'src/common/decorators/map-response.decorator';
import { WorkScheduleResponseDto } from 'src/entities/work-schedule/dto/work-schedule-response.dto';
import { WorkSchedule } from 'src/entities/work-schedule/work-schedule.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { CreateWorkScheduleDto } from './dto/create-work-schedule.dto';
import { UpdateWorkScheduleDto } from './dto/update-work-schedule.dto';
import { WorkScheduleService } from './work-schedule.service';

/**
 * Endpoints REST para franjas de trabajo efectivas (`schedules`).
 */
@ApiTags('Franjas de horario')
@Controller('work-schedules')
export class WorkScheduleController {
  constructor(private readonly workScheduleService: WorkScheduleService) {}

  /**
   * Crea una franja para un usuario que debe pertenecer a `enterpriseId`.
   * @param enterpriseId - Empresa (obligatorio)
   * @param dto - Datos de la franja
   * @returns Franja creada
   */
  @Post()
  @MapResponse(WorkScheduleResponseDto)
  @ApiOperation({ summary: 'Crear una franja de trabajo' })
  @ApiResponse({ status: 201, description: 'Franja creada correctamente.' })
  @ApiResponse({ status: 400, description: 'Petición inválida.' })
  @ApiResponse({
    status: 404,
    description: 'Usuario no vinculado a la empresa.',
  })
  async create(
    @Query('enterpriseId') enterpriseId: string,
    @Body() dto: CreateWorkScheduleDto,
  ): Promise<WorkSchedule> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.workScheduleService.create(enterpriseId, dto);
  }

  /**
   * Lista franjas de usuarios de la empresa; opcionalmente filtra por `userId`.
   * @param enterpriseId - Empresa (obligatorio)
   * @param userId - Usuario opcional
   * @returns Página de franjas
   */
  @Get()
  @MapResponse(WorkScheduleResponseDto)
  @ApiOperation({ summary: 'Listar franjas de trabajo por empresa' })
  @ApiResponse({ status: 200, description: 'Listado obtenido correctamente.' })
  @ApiResponse({ status: 400, description: 'Falta enterpriseId.' })
  async findAll(
    @Query('enterpriseId') enterpriseId: string,
    @Query('userEnterpriseId') userEnterpriseId?: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('sort') sort: string = 'startsAt',
    @Query('order') order: 'ASC' | 'DESC' = 'DESC',
    @Query('filter') filter?: string,
    @Query('relations') relations?: string,
  ): Promise<PaginatedResponse<WorkSchedule>> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }

    const pageNumber = Number(page);
    const pageSizeNumber = Number(pageSize);
    const relationsArray = relations ? relations.split(',') : [];

    let filterObj: Record<string, unknown> = {
      'userEnterprise.enterpriseId': enterpriseId,
    };
    if (userEnterpriseId) {
      filterObj.userEnterpriseId = userEnterpriseId;
    }
    if (filter) {
      try {
        filterObj = {
          ...JSON.parse(filter),
          'userEnterprise.enterpriseId': enterpriseId,
          ...(userEnterpriseId ? { userEnterpriseId } : {}),
        };
      } catch (error) {
        console.error('Error al parsear filter JSON (work-schedules):', error);
      }
    }

    return this.workScheduleService.findAll(
      pageNumber,
      pageSizeNumber,
      sort,
      order,
      filterObj,
      relationsArray,
    );
  }

  /**
   * Obtiene una franja por id si el usuario está en la empresa.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @returns Franja
   */
  @Get(':id')
  @MapResponse(WorkScheduleResponseDto)
  @ApiOperation({ summary: 'Obtener una franja de trabajo por id' })
  @ApiResponse({ status: 200, description: 'Franja encontrada.' })
  @ApiResponse({ status: 404, description: 'No encontrada o sin acceso.' })
  @ApiResponse({ status: 400, description: 'Falta enterpriseId.' })
  async findById(
    @Param('id') id: string,
    @Query('enterpriseId') enterpriseId: string,
    @Query('relations') relations?: string,
  ): Promise<WorkSchedule> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    const relationsArray = relations ? relations.split(',') : [];
    return this.workScheduleService.findById(id, enterpriseId, relationsArray);
  }

  /**
   * Actualiza inicio/fin de la franja.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @param dto - Campos opcionales
   * @returns Franja actualizada
   */
  @Patch(':id')
  @MapResponse(WorkScheduleResponseDto)
  @ApiOperation({ summary: 'Actualizar una franja de trabajo' })
  @ApiResponse({ status: 200, description: 'Actualización correcta.' })
  @ApiResponse({ status: 404, description: 'No encontrada.' })
  @ApiResponse({ status: 400, description: 'Falta enterpriseId.' })
  async updateById(
    @Param('id') id: string,
    @Query('enterpriseId') enterpriseId: string,
    @Body() dto: UpdateWorkScheduleDto,
  ): Promise<WorkSchedule> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.workScheduleService.updateById(id, enterpriseId, dto);
  }

  /**
   * Elimina una franja si pertenece a la empresa vía usuario.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @returns Resultado del borrado
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una franja de trabajo' })
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
    return this.workScheduleService.deleteById(id, enterpriseId);
  }
}
