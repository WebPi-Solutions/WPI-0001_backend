import { MODULE_METADATA } from '@nestjs/common/constants';
import { DefaultScheduleRepository } from './default-schedule-repository.service';
import { DefaultScheduleModule } from './default-schedule.module';

/**
 * Comprueba los metadatos de Nest de `DefaultScheduleModule` sin instanciar TypeORM.
 */
describe('DefaultScheduleModule', () => {
  it('debe estar definido', () => {
    expect(DefaultScheduleModule).toBeDefined();
  });

  it('debe registrar y exportar DefaultScheduleRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, DefaultScheduleModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, DefaultScheduleModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, DefaultScheduleModule);

    expect(providers).toContain(DefaultScheduleRepository);
    expect(exportedProviders).toContain(DefaultScheduleRepository);
    expect(imports).toHaveLength(1);
  });
});
