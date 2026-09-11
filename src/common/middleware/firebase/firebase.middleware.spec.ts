jest.mock('./firebase.service', () => ({
  firebaseAdmin: {
    auth: jest.fn(),
  },
}));

import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { UserRepository } from 'src/entities/user/user-repository.service';
import { User } from 'src/entities/user/user.entity';
import { FirebaseMiddleware } from './firebase.middleware';
import { firebaseAdmin } from './firebase.service';

/**
 * Pruebas unitarias del middleware de autenticación Firebase.
 * No se conecta a Firebase ni a la base de datos: se simulan `firebaseAdmin` y `UserRepository`.
 */
describe('FirebaseMiddleware', () => {
  let middleware: FirebaseMiddleware;
  let userRepository: { findByEmail: jest.Mock };
  let nextFunction: jest.MockedFunction<NextFunction>;
  let response: Response;

  /**
   * Construye un objeto Request mínimo con el encabezado de autorización indicado.
   * @param authorizationHeader - Valor de `Authorization`, o undefined si no existe
   * @returns Petición simulada compatible con Express
   */
  function createRequest(authorizationHeader?: string): Request {
    const headers: Record<string, string> = {};
    if (authorizationHeader !== undefined) {
      headers.authorization = authorizationHeader;
    }
    return { headers } as unknown as Request;
  }

  beforeEach(() => {
    userRepository = { findByEmail: jest.fn() };
    middleware = new FirebaseMiddleware(userRepository as unknown as UserRepository);
    nextFunction = jest.fn();
    response = {} as Response;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('debe lanzar UnauthorizedException si falta el encabezado Authorization', async () => {
    const request = createRequest();

    await expect(middleware.use(request, response, nextFunction)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(middleware.use(request, response, nextFunction)).rejects.toThrow('Falta autenticación');
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('debe lanzar UnauthorizedException si el token Bearer está vacío', async () => {
    const request = createRequest('Bearer ');

    await expect(middleware.use(request, response, nextFunction)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(middleware.use(request, response, nextFunction)).rejects.toThrow(
      'Solicitud no autenticada',
    );
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('debe asignar req.user y llamar a next cuando el token es válido y el usuario existe', async () => {
    const foundUser = { id: 'user-1', email: 'user@test.com' } as User;
    const verifyIdToken = jest.fn().mockResolvedValue({ email: 'user@test.com' });
    (firebaseAdmin.auth as jest.Mock).mockReturnValue({ verifyIdToken });
    userRepository.findByEmail.mockResolvedValue(foundUser);

    const request = createRequest('Bearer valid-token');
    await middleware.use(request, response, nextFunction);

    expect(verifyIdToken).toHaveBeenCalledWith('valid-token');
    expect(userRepository.findByEmail).toHaveBeenCalledWith('user@test.com', [
      'userEnterprises',
      'userEnterprises.enterpriseRole',
    ]);
    expect(request.user).toBe(foundUser);
    expect(nextFunction).toHaveBeenCalledTimes(1);
  });

  it('debe lanzar ForbiddenException si el token es válido pero el usuario no existe', async () => {
    const verifyIdToken = jest.fn().mockResolvedValue({ email: 'unknown@test.com' });
    (firebaseAdmin.auth as jest.Mock).mockReturnValue({ verifyIdToken });
    userRepository.findByEmail.mockResolvedValue(null);

    const request = createRequest('Bearer valid-token');

    await expect(middleware.use(request, response, nextFunction)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(middleware.use(request, response, nextFunction)).rejects.toThrow('Usuario sin acceso');
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('debe lanzar ForbiddenException si verifyIdToken falla', async () => {
    const verifyIdToken = jest.fn().mockRejectedValue(new Error('token inválido'));
    (firebaseAdmin.auth as jest.Mock).mockReturnValue({ verifyIdToken });

    const request = createRequest('Bearer invalid-token');

    await expect(middleware.use(request, response, nextFunction)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(middleware.use(request, response, nextFunction)).rejects.toThrow('Usuario sin acceso');
    expect(nextFunction).not.toHaveBeenCalled();
  });
});
