import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SpentConcept } from './spent-concept.entity';
import { SpentConceptRepository } from './spent-concept-repository.service';

/**
 * Módulo de persistencia de líneas de gasto.
 */
@Module({
  imports: [TypeOrmModule.forFeature([SpentConcept])],
  providers: [SpentConceptRepository],
  exports: [SpentConceptRepository],
})
export class SpentConceptModule {}
