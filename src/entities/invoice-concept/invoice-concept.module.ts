import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoiceConcept } from './invoice-concept.entity';
import { InvoiceConceptRepository } from './invoice-concept-repository.service';

/**
 * Módulo de persistencia de líneas de factura.
 */
@Module({
  imports: [TypeOrmModule.forFeature([InvoiceConcept])],
  providers: [InvoiceConceptRepository],
  exports: [InvoiceConceptRepository],
})
export class InvoiceConceptModule {}
