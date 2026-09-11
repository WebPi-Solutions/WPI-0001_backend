import { MODULE_METADATA } from '@nestjs/common/constants';
import { EnterpriseRoleRepository } from './enterprise-role-repository.service';
import { EnterpriseRoleModule } from './enterprise-role.module';

/**
 * Comprueba los metadatos de Nest de `EnterpriseRoleModule` sin instanciar TypeORM.
 */
describe('EnterpriseRoleModule', () => {
  it('debe estar definido', () => {
    expect(EnterpriseRoleModule).toBeDefined();
  });

  it('debe registrar y exportar EnterpriseRoleRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, EnterpriseRoleModule);
    const exportedProviders = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      EnterpriseRoleModule,
    );
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, EnterpriseRoleModule);

    expect(providers).toContain(EnterpriseRoleRepository);
    expect(exportedProviders).toContain(EnterpriseRoleRepository);
    expect(imports).toHaveLength(1);
  });
});
