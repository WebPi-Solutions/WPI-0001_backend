import { MODULE_METADATA } from '@nestjs/common/constants';
import { VacationRepository } from './vacation-repository.service';
import { VacationModule } from './vacation.module';

/**
 * Comprueba los metadatos de Nest de `VacationModule` sin instanciar TypeORM.
 */
describe('VacationModule', () => {
  it('debe estar definido', () => {
    expect(VacationModule).toBeDefined();
  });

  it('debe registrar y exportar VacationRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, VacationModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, VacationModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, VacationModule);

    expect(providers).toContain(VacationRepository);
    expect(exportedProviders).toContain(VacationRepository);
    expect(imports).toHaveLength(1);
  });
});
