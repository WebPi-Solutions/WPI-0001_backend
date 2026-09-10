import { MODULE_METADATA } from '@nestjs/common/constants';
import { SupplierRepository } from './supplier-repository.service';
import { SupplierModule } from './supplier.module';

/**
 * Comprueba los metadatos de Nest de `SupplierModule` sin instanciar TypeORM.
 */
describe('SupplierModule', () => {
  it('debe estar definido', () => {
    expect(SupplierModule).toBeDefined();
  });

  it('debe registrar y exportar SupplierRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, SupplierModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, SupplierModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, SupplierModule);

    expect(providers).toContain(SupplierRepository);
    expect(exportedProviders).toContain(SupplierRepository);
    expect(imports).toHaveLength(1);
  });
});
