import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoiceSeries } from './invoice-series.entity';
import { InvoiceSeriesRepository } from './invoice-series-repository.service';

@Module({
  imports: [TypeOrmModule.forFeature([InvoiceSeries])],
  providers: [InvoiceSeriesRepository],
  exports: [InvoiceSeriesRepository]
})
export class InvoiceSeriesModule {}
