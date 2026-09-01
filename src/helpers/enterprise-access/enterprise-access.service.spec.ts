import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRepository } from 'src/entities/user/user-repository.service';
import { EnterpriseAccessService } from './enterprise-access.service';

describe('EnterpriseAccessService', () => {
  let service: EnterpriseAccessService;
  let userRepository: {
    findUserEnterpriseByUserAndEnterprise: jest.Mock;
    findUserEnterpriseByIdAndEnterprise: jest.Mock;
  };

  const userId = 'user-uuid';
  const enterpriseId = 'enterprise-uuid';
  const userEnterpriseId = 'user-enterprise-uuid';
  const existingLink = {
    id: userEnterpriseId,
    userId,
    enterpriseId,
  };

  beforeEach(async () => {
    userRepository = {
      findUserEnterpriseByUserAndEnterprise: jest.fn(),
      findUserEnterpriseByIdAndEnterprise: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        EnterpriseAccessService,
        { provide: UserRepository, useValue: userRepository },
      ],
    }).compile();

    service = testingModule.get(EnterpriseAccessService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('assertUserBelongsToEnterprise', () => {
    it('no lanza error cuando el usuario está vinculado a la empresa', async () => {
      userRepository.findUserEnterpriseByUserAndEnterprise.mockResolvedValue(existingLink);

      await expect(
        service.assertUserBelongsToEnterprise(userId, enterpriseId, {
          operationContext: 'user.update',
          notFoundMessage: 'Usuario no encontrado en esta empresa.',
        }),
      ).resolves.toBeUndefined();
    });

    it('lanza 404 con el mensaje indicado cuando no existe el vínculo', async () => {
      userRepository.findUserEnterpriseByUserAndEnterprise.mockResolvedValue(null);

      await expect(
        service.assertUserBelongsToEnterprise(userId, enterpriseId, {
          operationContext: 'signing',
          notFoundMessage: 'Fichaje no encontrado',
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Fichaje no encontrado',
      });
    });
  });

  describe('assertUserEnterpriseLinkExists', () => {
    it('lanza 400 por defecto si se exige un vínculo que no existe', async () => {
      userRepository.findUserEnterpriseByUserAndEnterprise.mockResolvedValue(null);

      await expect(
        service.assertUserEnterpriseLinkExists(userId, enterpriseId, {
          operationContext: 'user.unlink',
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El usuario no está vinculado a esta empresa',
      });
    });

    it('usa el mensaje personalizado de solicitud incorrecta cuando se informa', async () => {
      userRepository.findUserEnterpriseByUserAndEnterprise.mockResolvedValue(null);

      await expect(
        service.assertUserEnterpriseLinkExists(userId, enterpriseId, {
          badRequestMessage: 'No hay vínculo que deshacer',
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'No hay vínculo que deshacer',
      });
    });

    it('resuelve cuando el vínculo sí existe', async () => {
      userRepository.findUserEnterpriseByUserAndEnterprise.mockResolvedValue(existingLink);

      await expect(
        service.assertUserEnterpriseLinkExists(userId, enterpriseId),
      ).resolves.toBeUndefined();
    });
  });

  describe('assertUserEnterpriseBelongsToEnterprise', () => {
    it('devuelve el vínculo cuando pertenece a la empresa', async () => {
      userRepository.findUserEnterpriseByIdAndEnterprise.mockResolvedValue(existingLink);

      await expect(
        service.assertUserEnterpriseBelongsToEnterprise(userEnterpriseId, enterpriseId, {
          operationContext: 'work-schedule',
          notFoundMessage: 'Franja de horario no encontrada',
        }),
      ).resolves.toEqual({
        id: userEnterpriseId,
        userId,
        enterpriseId,
      });
    });

    it('lanza 404 cuando el vínculo no pertenece a la empresa', async () => {
      userRepository.findUserEnterpriseByIdAndEnterprise.mockResolvedValue(null);

      await expect(
        service.assertUserEnterpriseBelongsToEnterprise(userEnterpriseId, enterpriseId, {
          notFoundMessage: 'Franja de horario no encontrada',
        }),
      ).rejects.toBeInstanceOf(HttpException);
    });
  });
});
