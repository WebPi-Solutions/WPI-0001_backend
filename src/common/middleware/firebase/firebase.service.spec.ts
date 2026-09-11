process.env.FIREBASE_PRIVATE_KEY = 'test-key';
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = 'test@test.com';

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn().mockReturnValue({ cert: true }),
  },
}));

jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

/**
 * Pruebas del módulo de inicialización de Firebase Admin.
 * No existe una clase `FirebaseService` en este archivo: se exporta `firebaseAdmin`.
 * La inicialización ocurre al importar el módulo, por eso se usa `isolateModulesAsync`.
 */
describe('firebaseAdmin', () => {
  const originalPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
  const originalProjectId = process.env.FIREBASE_PROJECT_ID;
  const originalClientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  beforeEach(() => {
    process.env.FIREBASE_PRIVATE_KEY = 'test-key';
    process.env.FIREBASE_PROJECT_ID = 'test-project';
    process.env.FIREBASE_CLIENT_EMAIL = 'test@test.com';
  });

  afterAll(() => {
    process.env.FIREBASE_PRIVATE_KEY = originalPrivateKey;
    process.env.FIREBASE_PROJECT_ID = originalProjectId;
    process.env.FIREBASE_CLIENT_EMAIL = originalClientEmail;
  });

  it('debe exportar firebaseAdmin e inicializar la aplicación con la cuenta de servicio', async () => {
    await jest.isolateModulesAsync(async () => {
      const admin = await import('firebase-admin');
      const firebaseServiceModule = await import('./firebase.service');

      expect(firebaseServiceModule.firebaseAdmin).toBeDefined();
      expect(admin.credential.cert).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'test-project',
          client_email: 'test@test.com',
          private_key: 'test-key',
        }),
      );
      expect(admin.initializeApp).toHaveBeenCalled();
    });
  });
});
