import { Module } from '@nestjs/common';
import { InvoiceRepository } from './invoice-repository.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from './invoice.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Invoice])],
  providers: [InvoiceRepository],
  exports: [InvoiceRepository]
})
export class InvoiceModule {}
