import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderConcept } from './order-concept.entity';
import { OrderConceptRepository } from './order-concept-repository.service';

/**
 * Módulo de persistencia de líneas de pedido.
 */
@Module({
  imports: [TypeOrmModule.forFeature([OrderConcept])],
  providers: [OrderConceptRepository],
  exports: [OrderConceptRepository],
})
export class OrderConceptModule {}
