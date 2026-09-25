import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import {
  QueryBuilderService,
  QueryFilterOptions,
} from 'src/common/helpers/query-builder/query-builder.service';
import { EnterpriseSettings } from './enterprise-settings.entity';
import { DEFAULT_ENTERPRISE_SETTINGS } from './default-settings';

/** Acceso a datos de las configuraciones de empresa. */
@Injectable()
export class EnterpriseSettingsRepository {
  constructor(
    @InjectRepository(EnterpriseSettings)
    private readonly settingsRepository: Repository<EnterpriseSettings>,
  ) {}

  /** Persiste la configuración base de una empresa nueva. */
  seedDefaultsForEnterprise(
    enterpriseId: string,
  ): Promise<EnterpriseSettings[]> {
    return this.settingsRepository.save(
      DEFAULT_ENTERPRISE_SETTINGS.map((setting) => ({
        enterpriseId,
        ...setting,
      })),
    );
  }

  /** Lista configuraciones paginadas y filtradas. */
  findAll(
    page = 1,
    pageSize = 10,
    sort = 'key',
    order: 'ASC' | 'DESC' = 'ASC',
    filter: Record<string, unknown> = {},
    relations?: string[],
  ): Promise<PaginatedResponse<EnterpriseSettings>> {
    const options: QueryFilterOptions = {
      page,
      pageSize,
      sort,
      order,
      filter,
      relations: (relations ?? []).map((relation) => ({
        property: relation,
        alias: relation,
        isLeftJoinAndSelect: true,
      })),
    };
    return QueryBuilderService.getPaginatedResults(
      this.settingsRepository,
      'enterpriseSettings',
      options,
    );
  }

  /** Obtiene una configuración por id. */
  findById(
    id: string,
    relations?: string[],
  ): Promise<EnterpriseSettings | null> {
    return this.settingsRepository.findOne({ where: { id }, relations });
  }

  /** Obtiene una configuración por clave y empresa. */
  findByKey(
    key: string,
    enterpriseId: string,
    relations?: string[],
  ): Promise<EnterpriseSettings | null> {
    return this.findByKeyWithDefault(key, enterpriseId, relations);
  }

  private async findByKeyWithDefault(
    key: string,
    enterpriseId: string,
    relations?: string[],
  ): Promise<EnterpriseSettings | null> {
    const setting = await this.settingsRepository.findOne({
      where: { key, enterpriseId },
      relations,
    });
    return setting ?? this.buildDefaultSetting(key, enterpriseId);
  }

  private buildDefaultSetting(
    key: string,
    enterpriseId: string,
  ): EnterpriseSettings | null {
    const defaultSetting = DEFAULT_ENTERPRISE_SETTINGS.find(
      (setting) => setting.key === key,
    );
    if (!defaultSetting) return null;
    return Object.assign(new EnterpriseSettings(), {
      enterpriseId,
      ...defaultSetting,
    });
  }

  /** Actualiza una configuración por key y devuelve la versión recargada. */
  async updateByKey(
    key: string,
    partial: Partial<EnterpriseSettings>,
    enterpriseId: string,
  ): Promise<EnterpriseSettings> {
    const existing = await this.settingsRepository.findOne({
      where: { key, enterpriseId },
    });
    if (existing) {
      await this.settingsRepository.save({ ...existing, ...partial });
      return this.settingsRepository.findOne({
        where: { key, enterpriseId },
        relations: ['enterprise'],
      });
    }

    const defaultSetting = DEFAULT_ENTERPRISE_SETTINGS.find(
      (setting) => setting.key === key,
    );
    if (!defaultSetting || !defaultSetting.editable) {
      throw new HttpException(
        'Configuración de empresa no encontrada',
        HttpStatus.NOT_FOUND,
      );
    }

    const created = await this.settingsRepository.save({
      enterpriseId,
      key,
      editable: defaultSetting.editable,
      value: partial.value ?? defaultSetting.value,
    });
    return this.settingsRepository
      .findOne({
        where: { key, enterpriseId },
        relations: ['enterprise'],
      })
      .then((setting) => setting ?? created);
  }
}
