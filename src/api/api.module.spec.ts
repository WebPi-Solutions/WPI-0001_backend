import { glob } from 'glob';
import { MulterModule } from '@nestjs/platform-express';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { StripeService } from 'src/services/stripe/stripe.service';
import { ApiModule } from './api.module';

jest.mock('src/common/middleware/firebase/firebase.service', () => ({
  firebaseAdmin: {
    auth: jest.fn(),
  },
}));

/**
 * Configuración de Multer capturada al registrar el módulo.
 */
let capturedMulterConfig: {
  fileFilter?: (
    request: unknown,
    file: { mimetype: string },
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => void;
} | undefined;

const actualMulterRegister = MulterModule.register.bind(MulterModule);
jest.spyOn(MulterModule, 'register').mockImplementation((options) => {
  capturedMulterConfig = options;
  return actualMulterRegister(options);
});

/**
 * Pruebas de `ApiModule.register()` sin compilar el grafo de TypeORM.
 * El descubrimiento de controladores y servicios usa glob sobre `src/api`.
 */
describe('ApiModule', () => {
  it('debe estar definido', () => {
    expect(ApiModule).toBeDefined();
  });

  it('register debe ser una función', () => {
    expect(typeof ApiModule.register).toBe('function');
  });

  it('register debe devolver controladores y los proveedores auxiliares', async () => {
    const dynamicModule = await ApiModule.register();

    expect(dynamicModule.module).toBe(ApiModule);
    expect(Array.isArray(dynamicModule.controllers)).toBe(true);
    expect(dynamicModule.controllers.length).toBeGreaterThan(0);
    expect(dynamicModule.providers).toEqual(
      expect.arrayContaining([EnterpriseAccessService, StripeService]),
    );
  });

  it('acepta PDF e imágenes y rechaza otros tipos en fileFilter', async () => {
    process.env.MAX_FILE_SIZE = '10';
    await ApiModule.register();

    expect(capturedMulterConfig?.fileFilter).toBeDefined();
    const fileFilter = capturedMulterConfig!.fileFilter!;

    const accepted = await new Promise<boolean>((resolve, reject) => {
      fileFilter({}, { mimetype: 'application/pdf' }, (error, acceptFile) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(acceptFile);
      });
    });
    expect(accepted).toBe(true);

    await new Promise<void>((resolve) => {
      fileFilter({}, { mimetype: 'image/jpeg' }, (_error, acceptFile) => {
        expect(acceptFile).toBe(true);
        resolve();
      });
    });
    await new Promise<void>((resolve) => {
      fileFilter({}, { mimetype: 'image/jpg' }, (_error, acceptFile) => {
        expect(acceptFile).toBe(true);
        resolve();
      });
    });
    await new Promise<void>((resolve) => {
      fileFilter({}, { mimetype: 'image/png' }, (_error, acceptFile) => {
        expect(acceptFile).toBe(true);
        resolve();
      });
    });

    await expect(
      new Promise((resolve, reject) => {
        fileFilter({}, { mimetype: 'text/plain' }, (error, acceptFile) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(acceptFile);
        });
      }),
    ).rejects.toThrow('Solo se permiten archivos PDF');
  });

  it('cubre el catch de importación cuando glob devuelve una ruta inválida', async () => {
    const originalSync = glob.sync.bind(glob);
    const syncSpy = jest.spyOn(glob, 'sync').mockImplementation((pattern: string) => {
      const realFiles = originalSync(pattern);
      return [
        ...realFiles,
        '/ruta/inexistente.controller.ts',
        '/ruta/inexistente.service.ts',
      ];
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const dynamicModule = await ApiModule.register();

    expect(dynamicModule.controllers.length).toBeGreaterThan(0);
    expect(console.error).toHaveBeenCalled();
    syncSpy.mockRestore();
  });
});
