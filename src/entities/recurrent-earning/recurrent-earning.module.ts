import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecurrentEarning } from './recurrent-earning.entity';
import { RecurrentEarningRepository } from './recurrent-earning-repository.service';

/**
 * Módulo de persistencia de ingresos recurrentes.
 * Expone el repositorio para su uso desde la capa API.
 */
@Module({
  imports: [TypeOrmModule.forFeature([RecurrentEarning])],
  providers: [RecurrentEarningRepository],
  exports: [RecurrentEarningRepository],
})
export class RecurrentEarningModule {}
