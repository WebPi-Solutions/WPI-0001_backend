import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemCategory } from './item-category.entity';
import { ItemCategoryRepository } from './item-category-repository.service';

/**
 * Módulo de persistencia de categorías de artículos.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ItemCategory])],
  providers: [ItemCategoryRepository],
  exports: [ItemCategoryRepository],
})
export class ItemCategoryModule {}
