import { MODULE_METADATA } from '@nestjs/common/constants';
import { SigningRepository } from './signing-repository.service';
import { SigningUpdateRepository } from './signing-update-repository.service';
import { SigningModule } from './signing.module';

/**
 * Comprueba los metadatos de Nest de `SigningModule` sin instanciar TypeORM.
 */
describe('SigningModule', () => {
  it('debe estar definido', () => {
    expect(SigningModule).toBeDefined();
  });

  it('debe registrar y exportar SigningRepository y SigningUpdateRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, SigningModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, SigningModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, SigningModule);

    expect(providers).toEqual(
      expect.arrayContaining([SigningRepository, SigningUpdateRepository]),
    );
    expect(exportedProviders).toEqual(
      expect.arrayContaining([SigningRepository, SigningUpdateRepository]),
    );
    expect(imports).toHaveLength(1);
  });
});
