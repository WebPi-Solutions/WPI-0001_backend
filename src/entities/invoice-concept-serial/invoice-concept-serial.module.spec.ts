import { MODULE_METADATA } from '@nestjs/common/constants';
import { InvoiceConceptSerialRepository } from './invoice-concept-serial-repository.service';
import { InvoiceConceptSerialModule } from './invoice-concept-serial.module';

describe('InvoiceConceptSerialModule', () => {
  it('debe estar definido', () => {
    expect(InvoiceConceptSerialModule).toBeDefined();
  });

  it('debe registrar y exportar InvoiceConceptSerialRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, InvoiceConceptSerialModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, InvoiceConceptSerialModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, InvoiceConceptSerialModule);

    expect(providers).toContain(InvoiceConceptSerialRepository);
    expect(exportedProviders).toContain(InvoiceConceptSerialRepository);
    expect(imports).toHaveLength(1);
  });
});
