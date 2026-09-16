import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoiceConceptSerial } from './invoice-concept-serial.entity';
import { InvoiceConceptSerialRepository } from './invoice-concept-serial-repository.service';

/**
 * Módulo de persistencia de números de serie de línea de factura.
 */
@Module({
  imports: [TypeOrmModule.forFeature([InvoiceConceptSerial])],
  providers: [InvoiceConceptSerialRepository],
  exports: [InvoiceConceptSerialRepository],
})
export class InvoiceConceptSerialModule {}
