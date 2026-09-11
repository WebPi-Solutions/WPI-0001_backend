import { MODULE_METADATA } from '@nestjs/common/constants';
import { FirebaseService } from './firebase.service';
import { FirebaseModule } from './firebase.module';

jest.mock('src/common/middleware/firebase/firebase.service', () => ({
  firebaseAdmin: {
    auth: jest.fn(),
  },
}));

/**
 * Comprueba los metadatos de Nest de `FirebaseModule` (capa de servicios).
 */
describe('FirebaseModule', () => {
  it('debe estar definido', () => {
    expect(FirebaseModule).toBeDefined();
  });

  it('debe registrar y exportar FirebaseService', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, FirebaseModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, FirebaseModule);

    expect(providers).toContain(FirebaseService);
    expect(exportedProviders).toContain(FirebaseService);
  });
});
