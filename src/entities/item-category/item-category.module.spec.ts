import { MODULE_METADATA } from '@nestjs/common/constants';
import { ItemCategoryRepository } from './item-category-repository.service';
import { ItemCategoryModule } from './item-category.module';

/**
 * Comprueba los metadatos de Nest de `ItemCategoryModule` sin instanciar TypeORM.
 */
describe('ItemCategoryModule', () => {
  it('debe estar definido', () => {
    expect(ItemCategoryModule).toBeDefined();
  });

  it('debe registrar y exportar ItemCategoryRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ItemCategoryModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, ItemCategoryModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, ItemCategoryModule);

    expect(providers).toContain(ItemCategoryRepository);
    expect(exportedProviders).toContain(ItemCategoryRepository);
    expect(imports).toHaveLength(1);
  });
});
