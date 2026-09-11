import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { InvoiceModule } from '../../entities/invoice/invoice.module';
import { QuoteModule } from '../../entities/quote/quote.module';
import { SpentModule } from '../../entities/spent/spent.module';
import { UserModule } from '../../entities/user/user.module';
import { ClientModule } from '../../entities/client/client.module';
import { SupplierModule } from '../../entities/supplier/supplier.module';
import { InvoiceSeriesModule } from '../../entities/invoice-series/invoice-series.module';
import { AiRequestModule } from '../../entities/ai-request/ai-request.module';

@Module({
  imports: [
    InvoiceModule,
    QuoteModule,
    SpentModule,
    UserModule,
    ClientModule,
    SupplierModule,
    InvoiceSeriesModule,
    AiRequestModule,
  ],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService]
})
export class MetricsModule {}
