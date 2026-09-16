import { MODULE_METADATA } from '@nestjs/common/constants';
import { OrderRepository } from './order-repository.service';
import { OrderModule } from './order.module';

/**
 * Comprueba los metadatos de Nest de `OrderModule` sin instanciar TypeORM.
 */
describe('OrderModule', () => {
  it('debe estar definido', () => {
    expect(OrderModule).toBeDefined();
  });

  it('debe registrar y exportar OrderRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, OrderModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, OrderModule);
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, OrderModule);

    expect(providers).toContain(OrderRepository);
    expect(exportedProviders).toContain(OrderRepository);
    expect(imports).toHaveLength(1);
  });
});
