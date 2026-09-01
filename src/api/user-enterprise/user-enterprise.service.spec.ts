import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRepository } from 'src/entities/user/user-repository.service';
import { UserEnterprise } from 'src/entities/user/user-enterprise.entity';
import { UserEnterpriseService } from './user-enterprise.service';

describe('UserEnterpriseService', () => {
  let service: UserEnterpriseService;
  let userRepository: {
    findUserEnterpriseByEnterpriseAndCardId: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const cardId = 42;
  const existingLink = {
    id: 'user-enterprise-uuid',
    userId: 'user-uuid',
    enterpriseId,
    cardId,
  } as UserEnterprise;

  beforeEach(async () => {
    userRepository = {
      findUserEnterpriseByEnterpriseAndCardId: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        UserEnterpriseService,
        { provide: UserRepository, useValue: userRepository },
      ],
    }).compile();

    service = testingModule.get(UserEnterpriseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByEnterpriseCardId', () => {
    it('devuelve el vínculo cuando el card_id existe en la empresa', async () => {
      userRepository.findUserEnterpriseByEnterpriseAndCardId.mockResolvedValue(existingLink);

      await expect(service.findByEnterpriseCardId(enterpriseId, cardId)).resolves.toEqual(
        existingLink,
      );
      expect(userRepository.findUserEnterpriseByEnterpriseAndCardId).toHaveBeenCalledWith(
        enterpriseId,
        cardId,
        ['user', 'enterprise'],
      );
    });

    it('lanza 404 genérico si el card_id no está vinculado a la empresa', async () => {
      userRepository.findUserEnterpriseByEnterpriseAndCardId.mockResolvedValue(null);

      await expect(service.findByEnterpriseCardId(enterpriseId, cardId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Usuario no encontrado',
      });
    });
  });
});
