import { glob } from 'glob';
import { EntitiesModule } from './entities.module';

/**
 * Pruebas de `EntitiesModule.register()` sin compilar TypeORM.
 * El descubrimiento de módulos usa glob sobre `src/entities`.
 */
describe('EntitiesModule', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('debe estar definido', () => {
    expect(EntitiesModule).toBeDefined();
  });

  it('register debe ser una función', () => {
    expect(typeof EntitiesModule.register).toBe('function');
  });

  it('register debe devolver un módulo dinámico con imports y exports', async () => {
    const dynamicModule = await EntitiesModule.register();

    expect(dynamicModule.module).toBe(EntitiesModule);
    expect(Array.isArray(dynamicModule.imports)).toBe(true);
    expect(Array.isArray(dynamicModule.exports)).toBe(true);
    expect(dynamicModule.imports.length).toBeGreaterThan(0);
    expect(dynamicModule.exports).toEqual(dynamicModule.imports);
  });

  /**
   * Cubre el filtro de `entities.module.ts/js` y el `catch` de un import que falla.
   */
  it('debe omitir entities.module.ts/js y capturar un import fallido', async () => {
    jest.spyOn(glob, 'sync').mockReturnValue([
      '/virtual/entities.module.ts',
      '/virtual/entities.module.js',
      '/virtual/missing-feature.module.ts',
    ]);
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const dynamicModule = await EntitiesModule.register();

    expect(dynamicModule.imports).toEqual([]);
    expect(dynamicModule.exports).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error al importar el módulo desde /virtual/missing-feature.module.ts'),
      expect.anything(),
    );
  });
});

