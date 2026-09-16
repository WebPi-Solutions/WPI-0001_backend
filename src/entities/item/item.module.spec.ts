import { MODULE_METADATA } from '@nestjs/common/constants';
import { ItemRepository } from './item-repository.service';
import { ItemModule } from './item.module';

/**
 * Comprueba los metadatos de Nest de `ItemModule` sin instanciar TypeORM.
 */
describe('ItemModule', () => {
  it('debe estar definido', () => {
    expect(ItemModule).toBeDefined();
  });

  it('debe registrar y exportar ItemRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ItemModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, ItemModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, ItemModule);

    expect(providers).toContain(ItemRepository);
    expect(exportedProviders).toContain(ItemRepository);
    expect(imports).toHaveLength(1);
  });
});
