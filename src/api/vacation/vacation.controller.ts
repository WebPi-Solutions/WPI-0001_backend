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
import { VacationResponseDto } from 'src/entities/vacation/dto/vacation-response.dto';
import { Vacation } from 'src/entities/vacation/vacation.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { CreateVacationDto } from './dto/create-vacation.dto';
import { UpdateVacationDto } from './dto/update-vacation.dto';
import { VacationService } from './vacation.service';

/**
 * Endpoints REST para vacaciones y permisos (`vacations`).
 */
@ApiTags('Vacaciones')
@Controller('vacations')
export class VacationController {
  constructor(private readonly vacationService: VacationService) {}

  /**
   * Crea un día de permiso para un usuario de la empresa.
   * @param enterpriseId - Empresa (obligatorio)
   * @param dto - Datos del permiso
   * @returns Registro creado
   */
  @Post()
  @MapResponse(VacationResponseDto)
  @ApiOperation({ summary: 'Crear un registro de vacaciones o permiso' })
  @ApiResponse({ status: 201, description: 'Registro creado correctamente.' })
  @ApiResponse({ status: 400, description: 'Petición inválida.' })
  @ApiResponse({
    status: 404,
    description: 'Usuario no vinculado a la empresa.',
  })
  async create(
    @Query('enterpriseId') enterpriseId: string,
    @Body() dto: CreateVacationDto,
  ): Promise<Vacation> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.vacationService.create(enterpriseId, dto);
  }

  /**
   * Lista permisos de usuarios de la empresa; opcionalmente por `userId`.
   * @param enterpriseId - Empresa (obligatorio)
   * @param userId - Filtro opcional
   * @returns Página de registros
   */
  @Get()
  @MapResponse(VacationResponseDto)
  @ApiOperation({ summary: 'Listar vacaciones y permisos por empresa' })
  @ApiResponse({ status: 200, description: 'Listado obtenido correctamente.' })
  @ApiResponse({ status: 400, description: 'Falta enterpriseId.' })
  async findAll(
    @Query('enterpriseId') enterpriseId: string,
    @Query('userEnterpriseId') userEnterpriseId?: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('sort') sort: string = 'calendarDate',
    @Query('order') order: 'ASC' | 'DESC' = 'ASC',
    @Query('filter') filter?: string,
    @Query('relations') relations?: string,
  ): Promise<PaginatedResponse<Vacation>> {
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
        console.error('Error al parsear filter JSON (vacations):', error);
      }
    }

    return this.vacationService.findAll(
      pageNumber,
      pageSizeNumber,
      sort,
      order,
      filterObj,
      relationsArray,
    );
  }

  /**
   * Obtiene un registro por id validando la empresa vía usuario.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @returns Vacación
   */
  @Get(':id')
  @MapResponse(VacationResponseDto)
  @ApiOperation({ summary: 'Obtener un registro de vacaciones por id' })
  @ApiResponse({ status: 200, description: 'Registro encontrado.' })
  @ApiResponse({ status: 404, description: 'No encontrado o sin acceso.' })
  @ApiResponse({ status: 400, description: 'Falta enterpriseId.' })
  async findById(
    @Param('id') id: string,
    @Query('enterpriseId') enterpriseId: string,
    @Query('relations') relations?: string,
  ): Promise<Vacation> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    const relationsArray = relations ? relations.split(',') : [];
    return this.vacationService.findById(id, enterpriseId, relationsArray);
  }

  /**
   * Actualiza nombre y/o fecha del permiso.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @param dto - Campos opcionales
   * @returns Registro actualizado
   */
  @Patch(':id')
  @MapResponse(VacationResponseDto)
  @ApiOperation({ summary: 'Actualizar un registro de vacaciones' })
  @ApiResponse({ status: 200, description: 'Actualización correcta.' })
  @ApiResponse({ status: 404, description: 'No encontrado.' })
  @ApiResponse({ status: 400, description: 'Falta enterpriseId.' })
  async updateById(
    @Param('id') id: string,
    @Query('enterpriseId') enterpriseId: string,
    @Body() dto: UpdateVacationDto,
  ): Promise<Vacation> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.vacationService.updateById(id, enterpriseId, dto);
  }

  /**
   * Elimina el registro si el usuario pertenece a la empresa.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @returns Resultado del borrado
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un registro de vacaciones' })
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
    return this.vacationService.deleteById(id, enterpriseId);
  }
}
