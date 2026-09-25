import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeleteResult, Repository } from 'typeorm';
import { PaginatedResponse } from 'src/common/helpers/query-builder/Pagination';
import { QueryBuilderService, QueryFilterOptions } from 'src/common/helpers/query-builder/query-builder.service';
import { SpentCategory } from './spent-category.entity';

/** Repositorio de categorías de gastos. */
@Injectable()
export class SpentCategoryRepository {
  private readonly logger = new Logger(SpentCategoryRepository.name);

  constructor(
    @InjectRepository(SpentCategory)
    private readonly spentCategoryRepository: Repository<SpentCategory>,
  ) {}

  create(entity: Partial<SpentCategory>): Promise<SpentCategory> {
    this.logger.log(`Creando categoría de gastos: ${entity.name}`);
    return this.spentCategoryRepository.save(entity);
  }

  findAll(
    page = 1,
    pageSize = 10,
    sort = 'name',
    order: 'ASC' | 'DESC' = 'ASC',
    filter: Record<string, unknown> = {},
    relations?: string[],
  ): Promise<PaginatedResponse<SpentCategory>> {
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
    return QueryBuilderService.getPaginatedResults(this.spentCategoryRepository, 'spentCategory', options);
  }

  findById(id: string, relations?: string[]): Promise<SpentCategory | null> {
    this.logger.log(`Buscando categoría de gastos por id: ${id}`);
    return this.spentCategoryRepository.findOne({ where: { id }, relations });
  }

  async updateById(id: string, partial: Partial<SpentCategory>): Promise<SpentCategory> {
    const existing = await this.spentCategoryRepository.findOne({ where: { id } });
    if (!existing) {
      throw new HttpException('Categoría de gastos no encontrada', HttpStatus.NOT_FOUND);
    }
    await this.spentCategoryRepository.save({ ...existing, ...partial });
    return this.findById(id, ['enterprise']);
  }

  deleteById(id: string): Promise<DeleteResult> {
    this.logger.log(`Eliminando categoría de gastos id: ${id}`);
    return this.spentCategoryRepository.delete(id);
  }
}
