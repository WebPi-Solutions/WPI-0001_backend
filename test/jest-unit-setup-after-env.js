/**
 * Mock global de firebase-admin en la suite unitaria.
 * El módulo de producción inicializa el SDK al importarse; sin este mock
 * `credential.cert` intentaría parsear una clave real o ficticia.
 */
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn().mockReturnValue({}),
  },
  auth: jest.fn(() => ({
    verifyIdToken: jest.fn(),
    createUser: jest.fn(),
    getUserByEmail: jest.fn(),
    updateUser: jest.fn(),
    deleteUser: jest.fn(),
  })),
}));
