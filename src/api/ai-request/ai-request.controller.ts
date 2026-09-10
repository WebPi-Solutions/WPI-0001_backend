import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MapResponse } from 'src/common/decorators/map-response.decorator';
import { RequireEnterpriseId } from 'src/common/decorators/enterprise-access.decorator';
import { AiRequestResponseDto } from 'src/entities/ai-request/dto/ai-request-response.dto';
import { AiRequest } from 'src/entities/ai-request/ai-request.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { AiRequestService } from './ai-request.service';
import { CreateAiRequestDto } from './dto/create-ai-request.dto';

/**
 * Controlador REST de peticiones a la API de IA.
 * Expone el registro y la consulta de consumo por empresa.
 */
@ApiTags('Peticiones de IA')
@Controller('ai-requests')
export class AiRequestController {
  private readonly logger = new Logger(AiRequestController.name);

  constructor(private readonly aiRequestService: AiRequestService) {}

  /**
   * Registra una petición a la API de IA.
   * @param enterpriseId - ID de la empresa propietaria
   * @param createAiRequestDto - Datos de la petición
   * @returns La petición registrada
   */
  @Post()
  @RequireEnterpriseId()
  @MapResponse(AiRequestResponseDto)
  @ApiOperation({ summary: 'Registrar una petición a la API de IA' })
  @ApiResponse({ status: 201, description: 'La petición ha sido registrada correctamente.' })
  @ApiResponse({ status: 400, description: 'Petición inválida.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async create(
    @Query('enterpriseId') enterpriseId: string,
    @Body() createAiRequestDto: CreateAiRequestDto,
  ): Promise<AiRequest> {
    if (!enterpriseId) {
      throw new HttpException('Es obligatorio especificar el ID de la empresa', HttpStatus.BAD_REQUEST);
    }

    return this.aiRequestService.create(enterpriseId, createAiRequestDto);
  }

  /**
   * Obtiene las peticiones de IA de una empresa.
   * @param enterpriseId - ID de la empresa
   * @param page - Número de página
   * @param pageSize - Tamaño de página
   * @param sort - Campo de ordenación
   * @param order - Dirección de ordenación
   * @param filter - Filtros adicionales en JSON
   * @param relations - Relaciones a incluir, separadas por coma
   * @returns Respuesta paginada con las peticiones
   */
  @Get()
  @RequireEnterpriseId()
  @MapResponse(AiRequestResponseDto)
  @ApiOperation({ summary: 'Obtener las peticiones de IA de una empresa' })
  @ApiResponse({ status: 200, description: 'Las peticiones han sido obtenidas correctamente.' })
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
  ): Promise<PaginatedResponse<AiRequest>> {
    if (!enterpriseId) {
      throw new HttpException('Es obligatorio especificar el ID de la empresa', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(
      `Obtención de peticiones de IA - Empresa: ${enterpriseId}, Página: ${page}, Tamaño: ${pageSize}, Ordenación: ${sort} ${order}, Filtros: ${filter}, Relaciones: ${relations}`,
    );

    const pageNumber = Number(page);
    const pageSizeNumber = Number(pageSize);
    const relationsArray = relations ? relations.split(',') : [];

    let filterObject: Record<string, unknown> = {
      enterpriseId,
    };

    if (filter) {
      try {
        filterObject = {
          ...JSON.parse(filter),
          ...filterObject,
        };
      } catch (error) {
        this.logger.error('Error al parsear el filtro JSON de peticiones de IA:', error);
        throw new HttpException('El filtro JSON no es válido', HttpStatus.BAD_REQUEST);
      }
    }

    return this.aiRequestService.findAll(
      pageNumber,
      pageSizeNumber,
      sort,
      order,
      filterObject,
      relationsArray,
    );
  }

  /**
   * Obtiene una petición de IA por su ID.
   * @param id - ID de la petición
   * @param relations - Relaciones a incluir, separadas por coma
   * @returns La petición encontrada
   */
  @Get(':id')
  @MapResponse(AiRequestResponseDto)
  @ApiOperation({ summary: 'Obtener una petición de IA por su id' })
  @ApiResponse({ status: 200, description: 'La petición ha sido obtenida correctamente.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiResponse({ status: 404, description: 'Petición de IA no encontrada.' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor.' })
  async findById(
    @Param('id') id: string,
    @Query('relations') relations?: string,
  ): Promise<AiRequest> {
    const relationsArray = relations ? relations.split(',') : [];
    return this.aiRequestService.findById(id, relationsArray);
  }
}
