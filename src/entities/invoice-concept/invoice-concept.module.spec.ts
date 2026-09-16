import { MODULE_METADATA } from '@nestjs/common/constants';
import { InvoiceConceptRepository } from './invoice-concept-repository.service';
import { InvoiceConceptModule } from './invoice-concept.module';

describe('InvoiceConceptModule', () => {
  it('debe estar definido', () => {
    expect(InvoiceConceptModule).toBeDefined();
  });

  it('debe registrar y exportar InvoiceConceptRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, InvoiceConceptModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, InvoiceConceptModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, InvoiceConceptModule);

    expect(providers).toContain(InvoiceConceptRepository);
    expect(exportedProviders).toContain(InvoiceConceptRepository);
    expect(imports).toHaveLength(1);
  });
});
