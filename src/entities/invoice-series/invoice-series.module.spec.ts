import { MODULE_METADATA } from '@nestjs/common/constants';
import { InvoiceSeriesRepository } from './invoice-series-repository.service';
import { InvoiceSeriesModule } from './invoice-series.module';

/**
 * Comprueba los metadatos de Nest de `InvoiceSeriesModule` sin instanciar TypeORM.
 */
describe('InvoiceSeriesModule', () => {
  it('debe estar definido', () => {
    expect(InvoiceSeriesModule).toBeDefined();
  });

  it('debe registrar y exportar InvoiceSeriesRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, InvoiceSeriesModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, InvoiceSeriesModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, InvoiceSeriesModule);

    expect(providers).toContain(InvoiceSeriesRepository);
    expect(exportedProviders).toContain(InvoiceSeriesRepository);
    expect(imports).toHaveLength(1);
  });
});
