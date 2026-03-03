import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { InvoiceModule } from '../../entities/invoice/invoice.module';
import { QuoteModule } from '../../entities/quote/quote.module';
import { SpentModule } from '../../entities/spent/spent.module';

@Module({
  imports: [InvoiceModule, QuoteModule, SpentModule],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService]
})
export class MetricsModule {}
