import { MODULE_METADATA } from '@nestjs/common/constants';
import { WorkScheduleRepository } from './work-schedule-repository.service';
import { WorkScheduleModule } from './work-schedule.module';

/**
 * Comprueba los metadatos de Nest de `WorkScheduleModule` sin instanciar TypeORM.
 */
describe('WorkScheduleModule', () => {
  it('debe estar definido', () => {
    expect(WorkScheduleModule).toBeDefined();
  });

  it('debe registrar y exportar WorkScheduleRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, WorkScheduleModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, WorkScheduleModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, WorkScheduleModule);

    expect(providers).toContain(WorkScheduleRepository);
    expect(exportedProviders).toContain(WorkScheduleRepository);
    expect(imports).toHaveLength(1);
  });
});
