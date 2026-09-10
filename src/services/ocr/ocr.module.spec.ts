import { MODULE_METADATA } from '@nestjs/common/constants';
import { OcrService } from './ocr.service';
import { OcrModule } from './ocr.module';

/**
 * Comprueba los metadatos de Nest de `OcrModule`.
 */
describe('OcrModule', () => {
  it('debe estar definido', () => {
    expect(OcrModule).toBeDefined();
  });

  it('debe registrar y exportar OcrService', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, OcrModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, OcrModule);

    expect(providers).toContain(OcrService);
    expect(exportedProviders).toContain(OcrService);
  });
});
