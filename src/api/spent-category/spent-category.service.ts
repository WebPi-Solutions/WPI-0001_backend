import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DeleteResult } from 'typeorm';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { PermissionAction } from 'src/common/helpers/enterprise-permission/permission.catalog';
import { SpentRepository } from 'src/entities/spent/spent-repository.service';
import { SpentCategoryRepository } from 'src/entities/spent-category/spent-category-repository.service';
import { SpentCategory } from 'src/entities/spent-category/spent-category.entity';

/** Servicio de API de categorías de gastos. */
@Injectable()
export class SpentCategoryService {
  private readonly logger = new Logger(SpentCategoryService.name);

  constructor(
    private readonly spentCategoryRepository: SpentCategoryRepository,
    private readonly spentRepository: SpentRepository,
    private readonly enterpriseAccessService: EnterpriseAccessService,
  ) {}

  async create(spentCategory: SpentCategory): Promise<SpentCategory> {
    this.stripNestedEnterprise(spentCategory);
    try {
      return await this.spentCategoryRepository.create(spentCategory);
    } catch (error) {
      this.logger.error(`Error al crear la categoría de gastos ${spentCategory.name}:`, error);
      throw error;
    }
  }

  async findAll(
    page: number,
    pageSize: number,
    sort: string,
    order: 'ASC' | 'DESC',
    filter: Record<string, unknown>,
    relations?: string[],
  ): Promise<PaginatedResponse<SpentCategory>> {
    return this.spentCategoryRepository.findAll(page, pageSize, sort, order, filter, relations);
  }

  async findById(id: string, relations?: string[]): Promise<SpentCategory> {
    const spentCategory = await this.spentCategoryRepository.findById(id, relations);
    if (!spentCategory) {
      throw new HttpException('Categoría de gastos no encontrada', HttpStatus.NOT_FOUND);
    }
    this.assertAccessible(spentCategory, 'read');
    return spentCategory;
  }

  async updateById(id: string, spentCategory: SpentCategory): Promise<SpentCategory> {
    const existing = await this.spentCategoryRepository.findById(id);
    if (!existing) {
      throw new HttpException('Categoría de gastos no encontrada', HttpStatus.NOT_FOUND);
    }
    this.assertAccessible(existing, 'write');
    const payload = { ...spentCategory, enterpriseId: existing.enterpriseId } as SpentCategory;
    this.stripNestedEnterprise(payload);
    return this.spentCategoryRepository.updateById(id, payload);
  }

  async deleteById(id: string): Promise<DeleteResult> {
    const existing = await this.spentCategoryRepository.findById(id);
    if (!existing) {
      throw new HttpException('Categoría de gastos no encontrada', HttpStatus.NOT_FOUND);
    }
    this.assertAccessible(existing, 'delete');
    const associatedSpents = await this.spentRepository.findAll(1, 1, 'issuedDate', 'ASC', {
      spentCategoryId: id,
    });
    if (associatedSpents.total > 0) {
      throw new HttpException(
        'No se puede eliminar la categoría de gastos porque tiene gastos asociados',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.spentCategoryRepository.deleteById(id);
  }

  private assertAccessible(spentCategory: SpentCategory, action: PermissionAction): void {
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      spentCategory.enterpriseId,
      'Categoría de gastos no encontrada',
      { resource: 'spentCategories', action },
    );
  }

  private stripNestedEnterprise(spentCategory: SpentCategory): void {
    delete (spentCategory as { enterprise?: unknown }).enterprise;
  }
}
