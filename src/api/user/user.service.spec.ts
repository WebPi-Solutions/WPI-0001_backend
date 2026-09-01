import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EnterpriseAccessService } from 'src/helpers/enterprise-access/enterprise-access.service';
import { DefaultScheduleRepository } from 'src/entities/default-schedule/default-schedule-repository.service';
import { UserRepository } from 'src/entities/user/user-repository.service';
import { User } from 'src/entities/user/user.entity';
import { FirebaseService } from 'src/services/firebase/firebase.service';
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;
  let userRepository: {
    updateById: jest.Mock;
    updateUserEnterpriseRole: jest.Mock;
    updateUserEnterpriseDefaultSchedule: jest.Mock;
    findById: jest.Mock;
  };
  let enterpriseAccessService: {
    assertUserBelongsToEnterprise: jest.Mock;
  };

  const userId = 'user-uuid';
  const enterpriseId = 'enterprise-uuid';
  const updatedUser = { id: userId, name: 'Ana' } as User;

  beforeEach(async () => {
    userRepository = {
      updateById: jest.fn().mockResolvedValue(updatedUser),
      updateUserEnterpriseRole: jest.fn().mockResolvedValue(undefined),
      updateUserEnterpriseDefaultSchedule: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
    };
    enterpriseAccessService = {
      assertUserBelongsToEnterprise: jest.fn().mockResolvedValue(undefined),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: UserRepository, useValue: userRepository },
        { provide: FirebaseService, useValue: {} },
        { provide: EnterpriseAccessService, useValue: enterpriseAccessService },
        { provide: DefaultScheduleRepository, useValue: {} },
      ],
    }).compile();

    service = testingModule.get(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateById — rol en user_enterprise', () => {
    it('actualiza el rol del vínculo y no lo persiste como relación del usuario', async () => {
      await service.updateById(
        userId,
        {
          name: 'Ana',
          userEnterprises: [{ role: '  manager  ' }],
        } as unknown as User,
        enterpriseId,
      );

      expect(enterpriseAccessService.assertUserBelongsToEnterprise).toHaveBeenCalledWith(
        userId,
        enterpriseId,
        expect.objectContaining({ operationContext: 'user.update' }),
      );
      expect(userRepository.updateUserEnterpriseRole).toHaveBeenCalledWith(
        userId,
        enterpriseId,
        'manager',
      );
      const patch = userRepository.updateById.mock.calls[0][1] as Record<string, unknown>;
      expect(patch.userEnterprises).toBeUndefined();
      expect(patch.name).toBe('Ana');
    });

    it('exige enterpriseId cuando se envía un rol', async () => {
      await expect(
        service.updateById(userId, {
          userEnterprises: [{ role: 'admin' }],
        } as unknown as User),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message:
          'Se requiere el parámetro enterpriseId en la URL para modificar el rol del usuario en la empresa.',
      });
      expect(userRepository.updateUserEnterpriseRole).not.toHaveBeenCalled();
    });

    it('no actualiza el rol si llega vacío o en blanco', async () => {
      await service.updateById(
        userId,
        {
          name: 'Ana',
          userEnterprises: [{ role: '   ' }],
        } as unknown as User,
        enterpriseId,
      );

      expect(userRepository.updateUserEnterpriseRole).not.toHaveBeenCalled();
      expect(userRepository.updateById).toHaveBeenCalled();
    });
  });
});
