import { MODULE_METADATA } from '@nestjs/common/constants';
import { OrderConceptRepository } from './order-concept-repository.service';
import { OrderConceptModule } from './order-concept.module';

describe('OrderConceptModule', () => {
  it('debe estar definido', () => {
    expect(OrderConceptModule).toBeDefined();
  });

  it('debe registrar y exportar OrderConceptRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, OrderConceptModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, OrderConceptModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, OrderConceptModule);

    expect(providers).toContain(OrderConceptRepository);
    expect(exportedProviders).toContain(OrderConceptRepository);
    expect(imports).toHaveLength(1);
  });
});
