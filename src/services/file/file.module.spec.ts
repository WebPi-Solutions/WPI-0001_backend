import { MODULE_METADATA } from '@nestjs/common/constants';
import { OcrModule } from '../ocr/ocr.module';
import { FileService } from './file.service';
import { FileModule } from './file.module';

/**
 * Comprueba los metadatos de Nest de `FileModule`.
 */
describe('FileModule', () => {
  it('debe estar definido', () => {
    expect(FileModule).toBeDefined();
  });

  it('debe importar OcrModule y registrar FileService', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, FileModule);
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, FileModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, FileModule);

    expect(imports).toContain(OcrModule);
    expect(providers).toContain(FileService);
    expect(exportedProviders).toContain(FileService);
  });
});
