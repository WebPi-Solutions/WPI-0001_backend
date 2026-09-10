import { MODULE_METADATA } from '@nestjs/common/constants';
import { ClientModule } from '../../entities/client/client.module';
import { InvoiceSeriesModule } from '../../entities/invoice-series/invoice-series.module';
import { InvoiceModule } from '../../entities/invoice/invoice.module';
import { QuoteModule } from '../../entities/quote/quote.module';
import { SpentModule } from '../../entities/spent/spent.module';
import { SupplierModule } from '../../entities/supplier/supplier.module';
import { UserModule } from '../../entities/user/user.module';
import { MetricsController } from './metrics.controller';
import { MetricsModule } from './metrics.module';
import { MetricsService } from './metrics.service';

/**
 * Comprueba los metadatos de Nest de `MetricsModule` sin instanciar TypeORM.
 */
describe('MetricsModule', () => {
  it('debe estar definido', () => {
    expect(MetricsModule).toBeDefined();
  });

  it('debe declarar MetricsController y MetricsService', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, MetricsModule);
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, MetricsModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, MetricsModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, MetricsModule);

    expect(controllers).toContain(MetricsController);
    expect(providers).toContain(MetricsService);
    expect(exportedProviders).toContain(MetricsService);
    expect(imports).toEqual(
      expect.arrayContaining([
        InvoiceModule,
        QuoteModule,
        SpentModule,
        UserModule,
        ClientModule,
        SupplierModule,
        InvoiceSeriesModule,
      ]),
    );
  });
});
