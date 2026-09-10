import { MODULE_METADATA } from '@nestjs/common/constants';
import { OpenaiService } from './openai.service';
import { OpenaiModule } from './openai.module';

/**
 * Comprueba los metadatos de Nest de `OpenaiModule`.
 */
describe('OpenaiModule', () => {
  it('debe estar definido', () => {
    expect(OpenaiModule).toBeDefined();
  });

  it('debe registrar y exportar OpenaiService', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, OpenaiModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, OpenaiModule);

    expect(providers).toContain(OpenaiService);
    expect(exportedProviders).toContain(OpenaiService);
  });
});
