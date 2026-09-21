import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockMovement } from './stock-movement.entity';
import { StockMovementRepository } from './stock-movement-repository.service';

/**
 * Módulo de persistencia del kardex de artículos.
 */
@Module({
  imports: [TypeOrmModule.forFeature([StockMovement])],
  providers: [StockMovementRepository],
  exports: [StockMovementRepository],
})
export class StockMovementModule {}
