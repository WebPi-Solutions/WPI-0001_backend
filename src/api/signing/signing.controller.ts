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
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SigningUpdate } from 'src/entities/signing/signing-update.entity';
import { Signing } from 'src/entities/signing/signing.entity';
import { PaginatedResponse } from 'src/helpers/query-builder/Pagination';
import { CreateSigningDto } from './dto/create-signing.dto';
import { UpdateSigningDto } from './dto/update-signing.dto';
import { SigningService } from './signing.service';

/**
 * Endpoints REST para fichajes (`signings`).
 */
@ApiTags('Fichajes')
@Controller('signings')
export class SigningController {
  constructor(private readonly signingService: SigningService) {}

  /**
   * Registra un fichaje para un usuario de la empresa.
   * @param enterpriseId - Empresa (obligatorio)
   * @param dto - Datos del fichaje
   * @returns Fichaje creado
   */
  @Post()
  @ApiOperation({ summary: 'Crear un fichaje' })
  @ApiResponse({ status: 201, description: 'Fichaje creado correctamente.' })
  @ApiResponse({ status: 400, description: 'Petición inválida.' })
  @ApiResponse({
    status: 404,
    description: 'Usuario no vinculado a la empresa.',
  })
  async create(
    @Query('enterpriseId') enterpriseId: string,
    @Body() dto: CreateSigningDto,
  ): Promise<Signing> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.signingService.create(enterpriseId, dto);
  }

  /**
   * Lista fichajes de usuarios de la empresa; opcionalmente por `userId`.
   * @param enterpriseId - Empresa (obligatorio)
   * @param userId - Filtro opcional por usuario
   * @returns Página de fichajes
   */
  @Get()
  @ApiOperation({ summary: 'Listar fichajes por empresa' })
  @ApiResponse({ status: 200, description: 'Listado obtenido correctamente.' })
  @ApiResponse({ status: 400, description: 'Falta enterpriseId.' })
  async findAll(
    @Query('enterpriseId') enterpriseId: string,
    @Query('userEnterpriseId') userEnterpriseId?: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('sort') sort: string = 'moment',
    @Query('order') order: 'ASC' | 'DESC' = 'DESC',
    @Query('filter') filter?: string,
    @Query('relations') relations?: string,
  ): Promise<PaginatedResponse<Signing>> {
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
        console.error('Error al parsear filter JSON (signings):', error);
      }
    }

    return this.signingService.findAll(
      pageNumber,
      pageSizeNumber,
      sort,
      order,
      filterObj,
      relationsArray,
    );
  }

  /**
   * Devuelve el histórico de actualizaciones de un fichaje (tabla `signings_updates`).
   * Ruta concreta: debe declararse **antes** de `GET :id` para no capturar `signing-updates` como id.
   *
   * @param id - UUID del fichaje
   * @param enterpriseId - Empresa
   * @returns Lista ordenada de más antigua a más reciente
   */
  @Get(':id/signing-updates')
  @ApiOperation({ summary: 'Histórico de actualizaciones de un fichaje' })
  @ApiResponse({ status: 200, description: 'Listado de cambios (puede ser vacío).' })
  @ApiResponse({ status: 404, description: 'No encontrado, cancelado o sin acceso a la empresa.' })
  @ApiResponse({ status: 400, description: 'Falta enterpriseId.' })
  async getSigningUpdates(
    @Param('id') id: string,
    @Query('enterpriseId') enterpriseId: string,
  ): Promise<SigningUpdate[]> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.signingService.getSigningUpdatesForSigning(id, enterpriseId);
  }

  /**
   * Obtiene un fichaje por id con comprobación de empresa.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @returns Fichaje
   */
  @Get(':id')
  @ApiOperation({ summary: 'Obtener un fichaje por id' })
  @ApiResponse({ status: 200, description: 'Fichaje encontrado.' })
  @ApiResponse({ status: 404, description: 'No encontrado o sin acceso.' })
  @ApiResponse({ status: 400, description: 'Falta enterpriseId.' })
  async findById(
    @Param('id') id: string,
    @Query('enterpriseId') enterpriseId: string,
    @Query('relations') relations?: string,
  ): Promise<Signing> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    const relationsArray = relations ? relations.split(',') : [];
    return this.signingService.findById(id, enterpriseId, relationsArray);
  }

  /**
   * Actualiza campos permitidos del fichaje.
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @param dto - Campos opcionales
   * @returns Fichaje actualizado
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un fichaje' })
  @ApiResponse({ status: 200, description: 'Actualización correcta.' })
  @ApiResponse({ status: 404, description: 'No encontrado.' })
  @ApiResponse({
    status: 400,
    description:
      'Falta enterpriseId, datos inválidos o la nueva hora rompe la secuencia entrada/salida del vínculo.',
  })
  @ApiResponse({ status: 401, description: 'No se identificó al usuario (middleware Firebase).' })
  async updateById(
    @Param('id') id: string,
    @Query('enterpriseId') enterpriseId: string,
    @Body() dto: UpdateSigningDto,
    @Req() req: Request,
  ): Promise<Signing> {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    const actorUserId = req.user?.id;
    if (!actorUserId) {
      throw new HttpException(
        'No se pudo identificar al usuario autenticado',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return this.signingService.updateById(id, enterpriseId, dto, actorUserId);
  }

  /**
   * Anula un fichaje (marca `cancelled`; no borra la fila en base de datos).
   * @param id - UUID
   * @param enterpriseId - Empresa
   * @returns Resultado de la anulación lógica
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Anular un fichaje (borrado lógico)' })
  @ApiResponse({ status: 200, description: 'Anulación correcta.' })
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
    return this.signingService.deleteById(id, enterpriseId);
  }
}
