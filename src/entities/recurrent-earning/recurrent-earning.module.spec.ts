import { MODULE_METADATA } from '@nestjs/common/constants';
import { RecurrentEarningRepository } from './recurrent-earning-repository.service';
import { RecurrentEarningModule } from './recurrent-earning.module';

/**
 * Comprueba los metadatos de Nest de `RecurrentEarningModule` sin instanciar TypeORM.
 */
describe('RecurrentEarningModule', () => {
  it('debe estar definido', () => {
    expect(RecurrentEarningModule).toBeDefined();
  });

  it('debe registrar y exportar RecurrentEarningRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, RecurrentEarningModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, RecurrentEarningModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, RecurrentEarningModule);

    expect(providers).toContain(RecurrentEarningRepository);
    expect(exportedProviders).toContain(RecurrentEarningRepository);
    expect(imports).toHaveLength(1);
  });
});
