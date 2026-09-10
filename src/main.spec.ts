jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn().mockImplementation(() =>
      Promise.resolve({
        use: jest.fn(),
        listen: jest.fn().mockResolvedValue(undefined),
        enableCors: jest.fn(),
        useGlobalInterceptors: jest.fn(),
        get: jest.fn().mockReturnValue({}),
      }),
    ),
  },
  Reflector: class Reflector {},
}));

jest.mock('./app.module', () => ({
  AppModule: class AppModule {},
}));

jest.mock('express', () => {
  const json = jest.fn().mockReturnValue('json-mw');
  return { json };
});

jest.mock('@nestjs/swagger', () => ({
  DocumentBuilder: jest.fn().mockImplementation(() => ({
    setTitle: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    setVersion: jest.fn().mockReturnThis(),
    addBearerAuth: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({ title: 'docs' }),
  })),
  SwaggerModule: {
    createDocument: jest.fn().mockReturnValue({ openapi: '3.0.0' }),
    setup: jest.fn(),
  },
}));

jest.mock('./middleware/swagger/swagger.middleware', () => ({
  swaggerMiddleware: jest.fn(),
}));

import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import { swaggerMiddleware } from './middleware/swagger/swagger.middleware';

/**
 * Recupera la instancia de app mockeada que `bootstrap()` recibió de NestFactory.
 *
 * @returns Aplicación Nest simulada
 */
async function getBootstrappedApp(): Promise<{
  use: jest.Mock;
  listen: jest.Mock;
  enableCors: jest.Mock;
  useGlobalInterceptors: jest.Mock;
  get: jest.Mock;
}> {
  return (NestFactory.create as jest.Mock).mock.results[0].value;
}

/**
 * Pruebas de `bootstrap()` en `main.ts`.
 * El arranque se ejecuta al importar el módulo; los mocks deben registrarse antes.
 */
describe('main bootstrap', () => {
  beforeAll(async () => {
    await import('./main');
    await new Promise((resolve) => setImmediate(resolve));
  });

  /**
   * Comprueba que Nest escucha en el puerto 3000 y aplica el middleware JSON.
   */
  it('debe crear la app, aplicar express.json y escuchar en el puerto 3000', async () => {
    const app = await getBootstrappedApp();

    expect(NestFactory.create).toHaveBeenCalled();
    expect(express.json).toHaveBeenCalledWith({ limit: '50mb' });
    expect(app.use).toHaveBeenCalledWith('json-mw');
    expect(app.listen).toHaveBeenCalledWith(3000);
    expect(app.enableCors).toHaveBeenCalledWith({ origin: '*' });
    expect(app.useGlobalInterceptors).toHaveBeenCalled();
    expect(app.get).toHaveBeenCalled();
  });

  /**
   * El middleware CORS se registra con `app.use(fn)`; hay que invocarlo para cubrir las cabeceras.
   */
  it('debe registrar e invocar el middleware de cabeceras CORS', async () => {
    const app = await getBootstrappedApp();
    const corsMiddleware = app.use.mock.calls.find(
      (callArgs) => typeof callArgs[0] === 'function',
    )?.[0] as (request: unknown, response: { header: jest.Mock }, next: jest.Mock) => void;

    expect(corsMiddleware).toBeDefined();

    const response = { header: jest.fn() };
    const next = jest.fn();
    corsMiddleware({}, response, next);

    expect(response.header).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
    expect(response.header).toHaveBeenCalledWith(
      'Access-Control-Allow-Methods',
      'GET,PUT,POST,DELETE,PATCH',
    );
    expect(response.header).toHaveBeenCalledWith(
      'Access-Control-Allow-Headers',
      'Content-Type, Accept, Authorization',
    );
    expect(next).toHaveBeenCalled();
  });

  /**
   * Swagger se monta en `/documentation` y en las rutas estáticas asociadas.
   */
  it('debe configurar Swagger y proteger sus rutas con swaggerMiddleware', async () => {
    const app = await getBootstrappedApp();

    expect(SwaggerModule.createDocument).toHaveBeenCalled();
    expect(SwaggerModule.setup).toHaveBeenCalledWith('documentation', app, { openapi: '3.0.0' });
    expect(app.use).toHaveBeenCalledWith('/documentation', swaggerMiddleware);
    expect(app.use).toHaveBeenCalledWith('/documentation-json', swaggerMiddleware);
    expect(app.use).toHaveBeenCalledWith('/documentation-js', swaggerMiddleware);
    expect(app.use).toHaveBeenCalledWith('/documentation-css', swaggerMiddleware);
  });
});
