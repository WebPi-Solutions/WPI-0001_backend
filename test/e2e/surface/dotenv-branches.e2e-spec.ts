/**
 * Cubre las ramas `dotenv.config()` que los e2e no ejecutan porque `E2E_TEST=true`.
 * No arranca Nest ni Postgres: solo reevalúa los módulos con el flag desactivado.
 */
describe('Ramas dotenv fuera de e2e', () => {
  it('ejecuta dotenv.config en Firebase, Dropbox y AppModule', () => {
    const previousE2eFlag = process.env.E2E_TEST;
    delete process.env.E2E_TEST;
    process.env.FIREBASE_PRIVATE_KEY =
      process.env.FIREBASE_PRIVATE_KEY ||
      '-----BEGIN PRIVATE KEY-----\\nMII\\n-----END PRIVATE KEY-----\\n';

    try {
      jest.isolateModules(() => {
        jest.doMock('firebase-admin', () => ({
          initializeApp: jest.fn(),
          credential: { cert: jest.fn().mockReturnValue({}) },
        }));
        jest.doMock('axios', () => ({
          __esModule: true,
          default: {
            post: jest.fn().mockRejectedValue(new Error('e2e-skip-dropbox-token')),
          },
        }));
        jest.doMock('dropbox', () => ({ Dropbox: jest.fn() }));
        jest.doMock('dotenv', () => ({ config: jest.fn() }));
        require('src/middleware/firebase/firebase.service');
        require('src/services/dropbox/dropbox.service');
        require('src/app.module');
      });
    } finally {
      process.env.E2E_TEST = previousE2eFlag;
    }
  });
});
