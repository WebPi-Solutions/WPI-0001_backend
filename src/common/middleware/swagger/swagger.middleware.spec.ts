import { NextFunction, Request, Response } from 'express';
import { swaggerMiddleware } from './swagger.middleware';

/**
 * Pruebas unitarias de la autenticación Basic del middleware de Swagger.
 */
describe('swaggerMiddleware', () => {
  const originalSwaggerUser = process.env.SWAGGER_USER;
  const originalSwaggerPassword = process.env.SWAGGER_PASSWORD;

  let request: Request;
  let response: {
    setHeader: jest.Mock;
    status: jest.Mock;
    send: jest.Mock;
  };
  let nextFunction: jest.MockedFunction<NextFunction>;

  /**
   * Restaura una variable de entorno a su valor original (o la elimina si no existía).
   * @param environmentKey - Nombre de la variable
   * @param originalValue - Valor capturado al inicio de la suite
   */
  function restoreEnvironmentVariable(environmentKey: string, originalValue: string | undefined): void {
    if (originalValue === undefined) {
      delete process.env[environmentKey];
      return;
    }
    process.env[environmentKey] = originalValue;
  }

  /**
   * Codifica credenciales Basic en Base64.
   * @param username - Usuario
   * @param password - Contraseña
   * @returns Encabezado Authorization completo
   */
  function buildBasicAuthorizationHeader(username: string, password: string): string {
    const encodedCredentials = Buffer.from(`${username}:${password}`).toString('base64');
    return `Basic ${encodedCredentials}`;
  }

  beforeEach(() => {
    delete process.env.SWAGGER_USER;
    delete process.env.SWAGGER_PASSWORD;
    request = { headers: {} } as Request;
    response = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
    nextFunction = jest.fn();
  });

  afterAll(() => {
    restoreEnvironmentVariable('SWAGGER_USER', originalSwaggerUser);
    restoreEnvironmentVariable('SWAGGER_PASSWORD', originalSwaggerPassword);
  });

  it('debe responder 401 y no llamar a next si falta Authorization', () => {
    swaggerMiddleware(request, response as unknown as Response, nextFunction);

    expect(response.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Basic realm="WebPi Solutions API Documentation"',
    );
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.send).toHaveBeenCalledWith(
      'Se requiere autenticación para acceder a esta documentación.',
    );
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('debe responder 401 si el esquema no es Basic', () => {
    request.headers.authorization = 'Bearer token';

    swaggerMiddleware(request, response as unknown as Response, nextFunction);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.send).toHaveBeenCalledWith(
      'Se requiere autenticación para acceder a esta documentación.',
    );
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('debe llamar a next con las credenciales por defecto admin:admin', () => {
    request.headers.authorization = buildBasicAuthorizationHeader('admin', 'admin');

    swaggerMiddleware(request, response as unknown as Response, nextFunction);

    expect(nextFunction).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
  });

  it('debe responder 401 con credenciales inválidas si la contraseña es incorrecta', () => {
    request.headers.authorization = buildBasicAuthorizationHeader('admin', 'wrong-password');

    swaggerMiddleware(request, response as unknown as Response, nextFunction);

    expect(response.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Basic realm="WebPi Solutions API Documentation"',
    );
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.send).toHaveBeenCalledWith('Credenciales inválidas.');
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('debe aceptar las credenciales definidas en SWAGGER_USER y SWAGGER_PASSWORD', () => {
    process.env.SWAGGER_USER = 'docs-user';
    process.env.SWAGGER_PASSWORD = 'docs-secret';
    request.headers.authorization = buildBasicAuthorizationHeader('docs-user', 'docs-secret');

    swaggerMiddleware(request, response as unknown as Response, nextFunction);

    expect(nextFunction).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
  });
});
