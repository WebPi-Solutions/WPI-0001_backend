import { MODULE_METADATA } from '@nestjs/common/constants';
import { EnterpriseRepository } from './enterprise-repository.service';
import { EnterpriseModule } from './enterprise.module';

/**
 * Comprueba los metadatos de Nest de `EnterpriseModule` sin instanciar TypeORM.
 */
describe('EnterpriseModule', () => {
  it('debe estar definido', () => {
    expect(EnterpriseModule).toBeDefined();
  });

  it('debe registrar y exportar EnterpriseRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, EnterpriseModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, EnterpriseModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, EnterpriseModule);

    expect(providers).toContain(EnterpriseRepository);
    expect(exportedProviders).toContain(EnterpriseRepository);
    expect(imports).toHaveLength(1);
  });
});
