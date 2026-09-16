import { MODULE_METADATA } from '@nestjs/common/constants';
import { QuoteConceptRepository } from './quote-concept-repository.service';
import { QuoteConceptModule } from './quote-concept.module';

describe('QuoteConceptModule', () => {
  it('debe estar definido', () => {
    expect(QuoteConceptModule).toBeDefined();
  });

  it('debe registrar y exportar QuoteConceptRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, QuoteConceptModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, QuoteConceptModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, QuoteConceptModule);

    expect(providers).toContain(QuoteConceptRepository);
    expect(exportedProviders).toContain(QuoteConceptRepository);
    expect(imports).toHaveLength(1);
  });
});
