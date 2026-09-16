import { MODULE_METADATA } from '@nestjs/common/constants';
import { SpentConceptSerialRepository } from './spent-concept-serial-repository.service';
import { SpentConceptSerialModule } from './spent-concept-serial.module';

describe('SpentConceptSerialModule', () => {
  it('debe estar definido', () => {
    expect(SpentConceptSerialModule).toBeDefined();
  });

  it('debe registrar y exportar SpentConceptSerialRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, SpentConceptSerialModule);
    const exportedProviders = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      SpentConceptSerialModule,
    );
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, SpentConceptSerialModule);

    expect(providers).toContain(SpentConceptSerialRepository);
    expect(exportedProviders).toContain(SpentConceptSerialRepository);
    expect(imports).toHaveLength(1);
  });
});
