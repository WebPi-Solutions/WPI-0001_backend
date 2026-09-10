import { MODULE_METADATA } from '@nestjs/common/constants';
import { UserRepository } from './user-repository.service';
import { UserModule } from './user.module';

/**
 * Comprueba los metadatos de Nest de `UserModule` sin instanciar TypeORM.
 */
describe('UserModule', () => {
  it('debe estar definido', () => {
    expect(UserModule).toBeDefined();
  });

  it('debe registrar y exportar UserRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, UserModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, UserModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, UserModule);

    expect(providers).toContain(UserRepository);
    expect(exportedProviders).toContain(UserRepository);
    expect(imports).toHaveLength(1);
  });
});
