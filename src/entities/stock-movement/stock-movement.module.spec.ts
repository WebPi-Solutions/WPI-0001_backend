import { MODULE_METADATA } from '@nestjs/common/constants';
import { StockMovementRepository } from './stock-movement-repository.service';
import { StockMovementModule } from './stock-movement.module';

describe('StockMovementModule', () => {
  it('debe estar definido', () => {
    expect(StockMovementModule).toBeDefined();
  });

  it('debe registrar y exportar StockMovementRepository', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, StockMovementModule);
    const exportedProviders = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      StockMovementModule,
    );
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, StockMovementModule);

    expect(providers).toContain(StockMovementRepository);
    expect(exportedProviders).toContain(StockMovementRepository);
    expect(imports).toHaveLength(1);
  });
});
