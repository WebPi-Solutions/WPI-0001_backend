import { MODULE_METADATA } from '@nestjs/common/constants';
import { DropboxService } from './dropbox.service';
import { DropboxModule } from './dropbox.module';

/**
 * Comprueba los metadatos de Nest de `DropboxModule`.
 */
describe('DropboxModule', () => {
  it('debe estar definido', () => {
    expect(DropboxModule).toBeDefined();
  });

  it('debe registrar y exportar DropboxService', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, DropboxModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, DropboxModule);

    expect(providers).toContain(DropboxService);
    expect(exportedProviders).toContain(DropboxService);
  });
});
