import { MiddlewareConsumer } from '@nestjs/common';
import { AppModule, buildTypeOrmConnectionOptions, buildTypeOrmRuntimeFlags } from './app.module';
import { FirebaseMiddleware } from './common/middleware/firebase/firebase.middleware';

jest.mock('./common/middleware/firebase/firebase.service', () => ({
  firebaseAdmin: {
    auth: jest.fn(),
  },
}));

/**
 * Pruebas de `AppModule` sin compilar el módulo (evitaría `TypeOrmModule.forRoot` y Postgres).
 */
describe('AppModule', () => {
  it('debe estar definido', () => {
    expect(AppModule).toBeDefined();
  });

  it('configure debe aplicar FirebaseMiddleware a todas las rutas salvo la raíz', () => {
    const appModule = new AppModule();
    const consumer = {
      apply: jest.fn().mockReturnThis(),
      exclude: jest.fn().mockReturnThis(),
      forRoutes: jest.fn().mockReturnThis(),
    };

    appModule.configure(consumer as unknown as MiddlewareConsumer);

    expect(consumer.apply).toHaveBeenCalledWith(FirebaseMiddleware);
    expect(consumer.exclude).toHaveBeenCalledWith('');
    expect(consumer.forRoutes).toHaveBeenCalledWith('*');
  });

  /**
   * Cubre las tres combinaciones de flags: sync por `TYPEORM_SYNCHRONIZE`,
   * sync por `E2E_TEST`, y entorno de producción sin sincronizar.
   */
  it('buildTypeOrmRuntimeFlags cubre sincronización por TYPEORM_SYNCHRONIZE, E2E_TEST y logging', () => {
    const previousSynchronize = process.env.TYPEORM_SYNCHRONIZE;
    const previousE2e = process.env.E2E_TEST;
    const previousLogging = process.env.TYPEORM_LOGGING;

    try {
      process.env.TYPEORM_SYNCHRONIZE = 'true';
      process.env.E2E_TEST = 'false';
      process.env.TYPEORM_LOGGING = 'false';
      expect(buildTypeOrmRuntimeFlags()).toEqual({
        synchronize: true,
        dropSchema: false,
        logging: false,
      });

      process.env.TYPEORM_SYNCHRONIZE = 'false';
      process.env.E2E_TEST = 'true';
      process.env.TYPEORM_LOGGING = 'true';
      expect(buildTypeOrmRuntimeFlags()).toEqual({
        synchronize: true,
        dropSchema: true,
        logging: true,
      });

      process.env.TYPEORM_SYNCHRONIZE = 'false';
      process.env.E2E_TEST = 'false';
      process.env.TYPEORM_LOGGING = 'false';
      expect(buildTypeOrmRuntimeFlags()).toEqual({
        synchronize: false,
        dropSchema: false,
        logging: false,
      });
    } finally {
      process.env.TYPEORM_SYNCHRONIZE = previousSynchronize;
      process.env.E2E_TEST = previousE2e;
      process.env.TYPEORM_LOGGING = previousLogging;
    }
  });

  /**
   * Cubre la lectura de host, puerto y credenciales (incluido `parseInt` del puerto).
   */
  it('buildTypeOrmConnectionOptions lee host, puerto y credenciales de entorno', () => {
    const previousHost = process.env.DATABASE_HOST;
    const previousPort = process.env.DATABASE_PORT;
    const previousUsername = process.env.DATABASE_USERNAME;
    const previousPassword = process.env.DATABASE_PASSWORD;
    const previousDatabase = process.env.DATABASE_NAME;

    try {
      process.env.DATABASE_HOST = 'localhost';
      process.env.DATABASE_PORT = '5432';
      process.env.DATABASE_USERNAME = 'webpi';
      process.env.DATABASE_PASSWORD = 'secret';
      process.env.DATABASE_NAME = 'webpi_test';

      const connectionOptions = buildTypeOrmConnectionOptions();

      expect(connectionOptions.type).toBe('postgres');
      expect(connectionOptions.host).toBe('localhost');
      expect(connectionOptions.port).toBe(5432);
      expect(connectionOptions.username).toBe('webpi');
      expect(connectionOptions.password).toBe('secret');
      expect(connectionOptions.database).toBe('webpi_test');
      expect(connectionOptions.entities[0]).toContain('*.entity');
    } finally {
      process.env.DATABASE_HOST = previousHost;
      process.env.DATABASE_PORT = previousPort;
      process.env.DATABASE_USERNAME = previousUsername;
      process.env.DATABASE_PASSWORD = previousPassword;
      process.env.DATABASE_NAME = previousDatabase;
    }
  });
});
