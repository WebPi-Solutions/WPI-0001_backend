import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { EnterpriseSettingsRepository } from 'src/entities/enterprise-settings/enterprise-settings-repository.service';
import { EnterpriseSettings } from 'src/entities/enterprise-settings/enterprise-settings.entity';
import { UpdateEnterpriseSettingsDto } from 'src/entities/enterprise-settings/dto/update-enterprise-settings.dto';

/** Reglas de negocio y aislamiento por empresa para configuraciones. */
@Injectable()
export class EnterpriseSettingsService {
  private readonly logger = new Logger(EnterpriseSettingsService.name);

  constructor(
    private readonly settingsRepository: EnterpriseSettingsRepository,
    private readonly enterpriseAccessService: EnterpriseAccessService,
  ) {}

  /** Lista configuraciones forzando el filtro de empresa. */
  findAll(
    page: number,
    pageSize: number,
    sort: string,
    order: 'ASC' | 'DESC',
    filter: Record<string, unknown>,
    relations?: string[],
  ): Promise<PaginatedResponse<EnterpriseSettings>> {
    return this.settingsRepository.findAll(
      page,
      pageSize,
      sort,
      order,
      filter,
      relations,
    );
  }

  /** Obtiene una configuración si pertenece a la empresa actual. */
  async findById(
    id: string,
    enterpriseId: string,
    relations?: string[],
  ): Promise<EnterpriseSettings> {
    const settings = await this.settingsRepository.findById(id, relations);
    if (!settings) {
      throw new HttpException(
        'Configuración de empresa no encontrada',
        HttpStatus.NOT_FOUND,
      );
    }
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      settings.enterpriseId,
      'Configuración de empresa no encontrada',
      { resource: 'enterpriseSettings', action: 'read' },
    );
    if (settings.enterpriseId !== enterpriseId) {
      throw new HttpException(
        'Configuración de empresa no encontrada',
        HttpStatus.NOT_FOUND,
      );
    }
    return settings;
  }

  /** Obtiene una configuración por clave dentro de la empresa actual. */
  async findByKey(
    key: string,
    enterpriseId: string,
    relations?: string[],
  ): Promise<EnterpriseSettings> {
    const settings = await this.settingsRepository.findByKey(
      key,
      enterpriseId,
      relations,
    );
    if (!settings) {
      throw new HttpException(
        'Configuración de empresa no encontrada',
        HttpStatus.NOT_FOUND,
      );
    }
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      settings.enterpriseId,
      'Configuración de empresa no encontrada',
      { resource: 'enterpriseSettings', action: 'read' },
    );
    if (settings.enterpriseId !== enterpriseId) {
      throw new HttpException(
        'Configuración de empresa no encontrada',
        HttpStatus.NOT_FOUND,
      );
    }
    return settings;
  }

  /** Actualiza únicamente el valor de una key propia. */
  async updateByKey(
    key: string,
    enterpriseId: string,
    dto: UpdateEnterpriseSettingsDto,
  ): Promise<EnterpriseSettings> {
    const current = await this.findByKey(key, enterpriseId, ['enterprise']);
    if (!current.editable) {
      throw new HttpException(
        `La key "${key}" no es editable por el usuario`,
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      return await this.settingsRepository.updateByKey(
        key,
        { value: dto.value.trim() },
        enterpriseId,
      );
    } catch (error) {
      this.logger.error(`Error al actualizar la configuración ${key}:`, error);
      throw error;
    }
  }
}
