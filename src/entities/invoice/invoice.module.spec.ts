import { MODULE_METADATA } from '@nestjs/common/constants';
import { InvoiceRepository } from './invoice-repository.service';
import { InvoiceModule } from './invoice.module';

/**
 * Comprueba los metadatos de Nest de `InvoiceModule` sin instanciar TypeORM.
 */
describe('InvoiceModule', () => {
  it('debe estar definido', () => {
    expect(InvoiceModule).toBeDefined();
  });

  it('debe registrar y exportar InvoiceRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, InvoiceModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, InvoiceModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, InvoiceModule);

    expect(providers).toContain(InvoiceRepository);
    expect(exportedProviders).toContain(InvoiceRepository);
    expect(imports).toHaveLength(1);
  });
});
