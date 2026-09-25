import { MODULE_METADATA } from '@nestjs/common/constants';
import { SpentCategoryRepository } from './spent-category-repository.service';
import { SpentCategoryModule } from './spent-category.module';

describe('SpentCategoryModule', () => {
  it('registra y exporta el repositorio', () => {
    expect(SpentCategoryModule).toBeDefined();
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, SpentCategoryModule)).toContain(SpentCategoryRepository);
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, SpentCategoryModule)).toContain(SpentCategoryRepository);
  });
});
