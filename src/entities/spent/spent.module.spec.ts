import { MODULE_METADATA } from '@nestjs/common/constants';
import { SpentRepository } from './spent-repository.service';
import { SpentModule } from './spent.module';

/**
 * Comprueba los metadatos de Nest de `SpentModule` sin instanciar TypeORM.
 */
describe('SpentModule', () => {
  it('debe estar definido', () => {
    expect(SpentModule).toBeDefined();
  });

  it('debe registrar y exportar SpentRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, SpentModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, SpentModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, SpentModule);

    expect(providers).toContain(SpentRepository);
    expect(exportedProviders).toContain(SpentRepository);
    expect(imports).toHaveLength(1);
  });
});
