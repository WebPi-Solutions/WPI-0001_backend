import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SpentConceptSerial } from './spent-concept-serial.entity';
import { SpentConceptSerialRepository } from './spent-concept-serial-repository.service';

/**
 * Módulo de persistencia de números de serie de línea de gasto.
 */
@Module({
  imports: [TypeOrmModule.forFeature([SpentConceptSerial])],
  providers: [SpentConceptSerialRepository],
  exports: [SpentConceptSerialRepository],
})
export class SpentConceptSerialModule {}
