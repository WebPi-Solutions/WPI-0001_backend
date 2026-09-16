import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './order.entity';
import { OrderRepository } from './order-repository.service';

/**
 * Módulo de dominio de pedidos: entidad TypeORM y repositorio.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Order])],
  providers: [OrderRepository],
  exports: [OrderRepository],
})
export class OrderModule {}
