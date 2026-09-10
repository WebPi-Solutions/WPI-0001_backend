jest.mock('src/middleware/firebase/firebase.service', () => ({
  firebaseAdmin: {
    auth: jest.fn(),
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { firebaseAdmin } from 'src/middleware/firebase/firebase.service';
import { FirebaseService } from './firebase.service';

describe('FirebaseService', () => {
  let service: FirebaseService;
  let createUserMock: jest.Mock;
  let getUserByEmailMock: jest.Mock;
  let updateUserMock: jest.Mock;
  let deleteUserMock: jest.Mock;

  /**
   * Crea el módulo de pruebas con firebase-admin simulado.
   */
  beforeEach(async () => {
    createUserMock = jest.fn();
    getUserByEmailMock = jest.fn();
    updateUserMock = jest.fn();
    deleteUserMock = jest.fn();
    (firebaseAdmin.auth as jest.Mock).mockReturnValue({
      createUser: createUserMock,
      getUserByEmail: getUserByEmailMock,
      updateUser: updateUserMock,
      deleteUser: deleteUserMock,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [FirebaseService],
    }).compile();

    service = module.get<FirebaseService>(FirebaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateRandomPassword', () => {
    it('genera una contraseña alfanumérica de 12 caracteres', () => {
      const password = service.generateRandomPassword();

      expect(password).toHaveLength(12);
      expect(password).toMatch(/^[a-zA-Z0-9]+$/);
    });
  });

  describe('createUser', () => {
    it('crea el usuario en Firebase', async () => {
      const userRecord = { uid: 'firebase-uid', email: 'user@example.com' };
      createUserMock.mockResolvedValue(userRecord);

      const result = await service.createUser('user@example.com', 'secret');

      expect(createUserMock).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'secret',
      });
      expect(result).toEqual(userRecord);
    });

    it('envuelve el error de creación', async () => {
      createUserMock.mockRejectedValue({ message: 'email-exists' });

      await expect(service.createUser('user@example.com', 'secret')).rejects.toThrow(
        'Error creating user: email-exists',
      );
    });
  });

  describe('getUserByEmail', () => {
    it('devuelve el usuario de Firebase', async () => {
      const userRecord = { uid: 'firebase-uid', email: 'user@example.com' };
      getUserByEmailMock.mockResolvedValue(userRecord);

      await expect(service.getUserByEmail('user@example.com')).resolves.toEqual(userRecord);
    });

    it('envuelve el error de consulta', async () => {
      getUserByEmailMock.mockRejectedValue({ message: 'not-found' });

      await expect(service.getUserByEmail('missing@example.com')).rejects.toThrow(
        'Error fetching user by email: not-found',
      );
    });
  });

  describe('verifyUserExistsByEmail', () => {
    it('devuelve true si el usuario existe', async () => {
      getUserByEmailMock.mockResolvedValue({ uid: 'firebase-uid' });

      await expect(service.verifyUserExistsByEmail('user@example.com')).resolves.toBe(true);
    });

    it('devuelve false si Firebase no encuentra al usuario', async () => {
      getUserByEmailMock.mockRejectedValue(new Error('not-found'));

      await expect(service.verifyUserExistsByEmail('missing@example.com')).resolves.toBe(false);
    });
  });

  describe('updateUserPassword', () => {
    it('actualiza la contraseña del usuario', async () => {
      getUserByEmailMock.mockResolvedValue({ uid: 'firebase-uid' });
      updateUserMock.mockResolvedValue({ uid: 'firebase-uid' });
      jest.spyOn(console, 'log').mockImplementation(() => undefined);

      const result = await service.updateUserPassword('user@example.com', 'nueva');

      expect(updateUserMock).toHaveBeenCalledWith('firebase-uid', { password: 'nueva' });
      expect(result).toEqual({ uid: 'firebase-uid' });
    });

    it('envuelve el error de actualización de contraseña', async () => {
      getUserByEmailMock.mockRejectedValue({ message: 'not-found' });

      await expect(service.updateUserPassword('user@example.com', 'nueva')).rejects.toThrow(
        'Error updating user password: Error fetching user by email: not-found',
      );
    });
  });

  describe('updateUserEmail', () => {
    it('actualiza el correo del usuario', async () => {
      getUserByEmailMock.mockResolvedValue({ uid: 'firebase-uid' });
      updateUserMock.mockResolvedValue({ uid: 'firebase-uid', email: 'nuevo@example.com' });
      jest.spyOn(console, 'log').mockImplementation(() => undefined);

      const result = await service.updateUserEmail('old@example.com', 'nuevo@example.com');

      expect(updateUserMock).toHaveBeenCalledWith('firebase-uid', { email: 'nuevo@example.com' });
      expect(result.email).toBe('nuevo@example.com');
    });

    it('envuelve el error de actualización de correo', async () => {
      getUserByEmailMock.mockRejectedValue({ message: 'not-found' });

      await expect(service.updateUserEmail('old@example.com', 'nuevo@example.com')).rejects.toThrow(
        'Error updating user email: Error fetching user by email: not-found',
      );
    });
  });

  describe('deleteUser', () => {
    it('elimina el usuario de Firebase', async () => {
      getUserByEmailMock.mockResolvedValue({ uid: 'firebase-uid' });
      deleteUserMock.mockResolvedValue(undefined);
      jest.spyOn(console, 'log').mockImplementation(() => undefined);

      await service.deleteUser('user@example.com');

      expect(deleteUserMock).toHaveBeenCalledWith('firebase-uid');
    });

    it('envuelve el error de borrado', async () => {
      getUserByEmailMock.mockRejectedValue({ message: 'not-found' });

      await expect(service.deleteUser('user@example.com')).rejects.toThrow(
        'Error deleting user: Error fetching user by email: not-found',
      );
    });
  });
});
