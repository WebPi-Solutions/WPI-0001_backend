import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { InvoiceModule } from '../../entities/invoice/invoice.module';
import { SpentModule } from '../../entities/spent/spent.module';

@Module({
  imports: [InvoiceModule, SpentModule],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService]
})
export class MetricsModule {}
