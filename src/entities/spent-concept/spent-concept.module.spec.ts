import { MODULE_METADATA } from '@nestjs/common/constants';
import { SpentConceptRepository } from './spent-concept-repository.service';
import { SpentConceptModule } from './spent-concept.module';

describe('SpentConceptModule', () => {
  it('debe estar definido', () => {
    expect(SpentConceptModule).toBeDefined();
  });

  it('debe registrar y exportar SpentConceptRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, SpentConceptModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, SpentConceptModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, SpentConceptModule);

    expect(providers).toContain(SpentConceptRepository);
    expect(exportedProviders).toContain(SpentConceptRepository);
    expect(imports).toHaveLength(1);
  });
});
