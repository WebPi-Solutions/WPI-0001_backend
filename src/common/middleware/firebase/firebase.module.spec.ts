import { MODULE_METADATA } from '@nestjs/common/constants';
import { UserModule } from 'src/entities/user/user.module';
import { FirebaseMiddleware } from './firebase.middleware';
import { FirebaseModule } from './firebase.module';

jest.mock('./firebase.service', () => ({
  firebaseAdmin: {
    auth: jest.fn(),
  },
}));

/**
 * Comprueba los metadatos de Nest de `FirebaseModule` (capa de middleware).
 */
describe('FirebaseModule', () => {
  it('debe estar definido', () => {
    expect(FirebaseModule).toBeDefined();
  });

  it('debe importar UserModule y registrar FirebaseMiddleware', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, FirebaseModule);
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, FirebaseModule);
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, FirebaseModule);

    expect(imports).toContain(UserModule);
    expect(providers).toContain(FirebaseMiddleware);
    expect(exportedProviders).toContain(FirebaseMiddleware);
  });
});
