import { MiddlewareConsumer } from '@nestjs/common';
import { AppModule, buildTypeOrmRuntimeFlags } from './app.module';
import { FirebaseMiddleware } from './middleware/firebase/firebase.middleware';

jest.mock('./middleware/firebase/firebase.service', () => ({
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
});
