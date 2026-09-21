import { MODULE_METADATA } from '@nestjs/common/constants';
import { ItemSerialRepository } from './item-serial-repository.service';
import { ItemSerialModule } from './item-serial.module';

describe('ItemSerialModule', () => {
  it('debe estar definido', () => {
    expect(ItemSerialModule).toBeDefined();
  });

  it('debe registrar y exportar ItemSerialRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ItemSerialModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, ItemSerialModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, ItemSerialModule);

    expect(providers).toContain(ItemSerialRepository);
    expect(exportedProviders).toContain(ItemSerialRepository);
    expect(imports).toHaveLength(1);
  });
});
