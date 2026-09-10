/**
 * Mock global de firebase-admin para los specs de src que importan
 * FirebaseService sin mockear el SDK (el e2e no carga .env de develop).
 */
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn().mockReturnValue({}),
  },
}));

jest.retryTimes(1);
