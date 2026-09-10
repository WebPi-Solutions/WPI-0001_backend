import { MODULE_METADATA } from '@nestjs/common/constants';
import { QuoteRepository } from './quote-repository.service';
import { QuoteModule } from './quote.module';

/**
 * Comprueba los metadatos de Nest de `QuoteModule` sin instanciar TypeORM.
 */
describe('QuoteModule', () => {
  it('debe estar definido', () => {
    expect(QuoteModule).toBeDefined();
  });

  it('debe registrar y exportar QuoteRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, QuoteModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, QuoteModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, QuoteModule);

    expect(providers).toContain(QuoteRepository);
    expect(exportedProviders).toContain(QuoteRepository);
    expect(imports).toHaveLength(1);
  });
});
