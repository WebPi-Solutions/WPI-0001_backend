import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SpentCategory } from './spent-category.entity';
import { SpentCategoryRepository } from './spent-category-repository.service';

/** Módulo de persistencia de categorías de gastos. */
@Module({
  imports: [TypeOrmModule.forFeature([SpentCategory])],
  providers: [SpentCategoryRepository],
  exports: [SpentCategoryRepository],
})
export class SpentCategoryModule {}
