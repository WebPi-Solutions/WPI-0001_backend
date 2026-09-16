import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuoteConcept } from './quote-concept.entity';
import { QuoteConceptRepository } from './quote-concept-repository.service';

/**
 * Módulo de persistencia de líneas de presupuesto.
 */
@Module({
  imports: [TypeOrmModule.forFeature([QuoteConcept])],
  providers: [QuoteConceptRepository],
  exports: [QuoteConceptRepository],
})
export class QuoteConceptModule {}
