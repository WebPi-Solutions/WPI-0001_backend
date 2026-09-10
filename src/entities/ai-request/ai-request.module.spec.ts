import { MODULE_METADATA } from '@nestjs/common/constants';
import { AiRequestRepository } from './ai-request-repository.service';
import { AiRequestModule } from './ai-request.module';

/**
 * Comprueba los metadatos de Nest de `AiRequestModule` sin instanciar TypeORM.
 */
describe('AiRequestModule', () => {
  it('debe estar definido', () => {
    expect(AiRequestModule).toBeDefined();
  });

  it('debe registrar y exportar AiRequestRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AiRequestModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, AiRequestModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AiRequestModule);

    expect(providers).toContain(AiRequestRepository);
    expect(exportedProviders).toContain(AiRequestRepository);
    expect(imports).toHaveLength(1);
  });
});
