import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemSerial } from './item-serial.entity';
import { ItemSerialRepository } from './item-serial-repository.service';

/**
 * Módulo de persistencia de números de serie canónicos de artículo.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ItemSerial])],
  providers: [ItemSerialRepository],
  exports: [ItemSerialRepository],
})
export class ItemSerialModule {}
