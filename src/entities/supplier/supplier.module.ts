import { Module } from '@nestjs/common';
import { SupplierRepository } from './supplier-repository.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supplier } from './supplier.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Supplier])],
  providers: [SupplierRepository],
  exports: [SupplierRepository]
})
export class SupplierModule {}
