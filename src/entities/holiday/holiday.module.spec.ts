import { MODULE_METADATA } from '@nestjs/common/constants';
import { HolidayRepository } from './holiday-repository.service';
import { HolidayModule } from './holiday.module';

/**
 * Comprueba los metadatos de Nest de `HolidayModule` sin instanciar TypeORM.
 */
describe('HolidayModule', () => {
  it('debe estar definido', () => {
    expect(HolidayModule).toBeDefined();
  });

  it('debe registrar y exportar HolidayRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, HolidayModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, HolidayModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, HolidayModule);

    expect(providers).toContain(HolidayRepository);
    expect(exportedProviders).toContain(HolidayRepository);
    expect(imports).toHaveLength(1);
  });
});
