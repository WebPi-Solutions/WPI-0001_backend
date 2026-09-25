import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MapResponse } from 'src/common/decorators/map-response.decorator';
import { RequireEnterpriseId } from 'src/common/decorators/enterprise-access.decorator';
import { RequirePermission } from 'src/common/decorators/enterprise-permission.decorator';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { EnterpriseSettingsResponseDto } from 'src/entities/enterprise-settings/dto/enterprise-settings-response.dto';
import { UpdateEnterpriseSettingsDto } from 'src/entities/enterprise-settings/dto/update-enterprise-settings.dto';
import { EnterpriseSettings } from 'src/entities/enterprise-settings/enterprise-settings.entity';
import { EnterpriseSettingsService } from './enterprise-settings.service';

/** Endpoints REST de configuraciones de empresa. */
@ApiTags('Configuraciones de empresa')
@RequireEnterpriseId()
@Controller('enterprise-settings')
export class EnterpriseSettingsController {
  constructor(private readonly settingsService: EnterpriseSettingsService) {}

  /** Lista configuraciones de una empresa con paginación. */
  @Get()
  @RequirePermission('enterpriseSettings', 'read')
  @MapResponse(EnterpriseSettingsResponseDto)
  @ApiOperation({ summary: 'Listar configuraciones de empresa' })
  async findAll(
    @Query('enterpriseId') enterpriseId: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
    @Query('sort') sort = 'key',
    @Query('order') order: 'ASC' | 'DESC' = 'ASC',
    @Query('filter') filter?: string,
    @Query('relations') relations?: string,
  ): Promise<PaginatedResponse<EnterpriseSettings>> {
    this.assertEnterpriseId(enterpriseId);
    let filterObject: Record<string, unknown> = { enterpriseId };
    if (filter) {
      try {
        filterObject = { ...JSON.parse(filter), enterpriseId };
      } catch (error) {
        console.error(
          'Error al parsear filter JSON (enterprise-settings):',
          error,
        );
      }
    }
    return this.settingsService.findAll(
      Number(page),
      Number(pageSize),
      sort,
      order,
      filterObject,
      relations ? relations.split(',') : [],
    );
  }

  /** Obtiene una configuración propia por id. */
  @Get('key/:key')
  @RequirePermission('enterpriseSettings', 'read')
  @MapResponse(EnterpriseSettingsResponseDto)
  @ApiOperation({ summary: 'Obtener una configuración de empresa por key' })
  async findByKey(
    @Param('key') key: string,
    @Query('enterpriseId') enterpriseId: string,
    @Query('relations') relations?: string,
  ): Promise<EnterpriseSettings> {
    this.assertEnterpriseId(enterpriseId);
    return this.settingsService.findByKey(
      key,
      enterpriseId,
      relations ? relations.split(',') : [],
    );
  }

  /** Obtiene una configuración propia por id. */
  @Get(':id')
  @RequirePermission('enterpriseSettings', 'read')
  @MapResponse(EnterpriseSettingsResponseDto)
  @ApiOperation({ summary: 'Obtener una configuración de empresa' })
  async findById(
    @Param('id') id: string,
    @Query('enterpriseId') enterpriseId: string,
    @Query('relations') relations?: string,
  ): Promise<EnterpriseSettings> {
    this.assertEnterpriseId(enterpriseId);
    return this.settingsService.findById(
      id,
      enterpriseId,
      relations ? relations.split(',') : [],
    );
  }

  /** Actualiza el valor de una configuración propia por key. */
  @Patch('key/:key')
  @RequirePermission('enterpriseSettings', 'write')
  @MapResponse(EnterpriseSettingsResponseDto)
  @ApiOperation({ summary: 'Actualizar una configuración de empresa' })
  async updateByKey(
    @Param('key') key: string,
    @Query('enterpriseId') enterpriseId: string,
    @Body() dto: UpdateEnterpriseSettingsDto,
  ): Promise<EnterpriseSettings> {
    this.assertEnterpriseId(enterpriseId);
    this.assertOnlyValueBody(dto);
    return this.settingsService.updateByKey(key, enterpriseId, dto);
  }

  private assertEnterpriseId(enterpriseId: string): void {
    if (!enterpriseId) {
      throw new HttpException(
        'Es obligatorio especificar el ID de la empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private assertOnlyValueBody(dto: UpdateEnterpriseSettingsDto): void {
    const bodyKeys = Object.keys(dto ?? {});
    if (
      bodyKeys.length !== 1 ||
      bodyKeys[0] !== 'value' ||
      typeof dto?.value !== 'string'
    ) {
      throw new HttpException(
        'El body solo puede contener un value de tipo texto',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
