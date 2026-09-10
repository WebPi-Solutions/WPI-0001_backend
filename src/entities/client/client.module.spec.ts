import { MODULE_METADATA } from '@nestjs/common/constants';
import { ClientRepository } from './client-repository.service';
import { ClientModule } from './client.module';

/**
 * Comprueba los metadatos de Nest de `ClientModule` sin instanciar TypeORM.
 */
describe('ClientModule', () => {
  it('debe estar definido', () => {
    expect(ClientModule).toBeDefined();
  });

  it('debe registrar y exportar ClientRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ClientModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, ClientModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, ClientModule);

    expect(providers).toContain(ClientRepository);
    expect(exportedProviders).toContain(ClientRepository);
    expect(imports).toHaveLength(1);
  });
});
