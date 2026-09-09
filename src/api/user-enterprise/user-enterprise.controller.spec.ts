import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserEnterprise } from 'src/entities/user/user-enterprise.entity';
import { UserEnterpriseController } from './user-enterprise.controller';
import { UserEnterpriseService } from './user-enterprise.service';

describe('UserEnterpriseController', () => {
  let controller: UserEnterpriseController;
  let userEnterpriseService: {
    findByEnterpriseCardId: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const existingLink = {
    id: 'user-enterprise-uuid',
    userId: 'user-uuid',
    enterpriseId,
    cardId: 42,
  } as UserEnterprise;

  beforeEach(async () => {
    userEnterpriseService = {
      findByEnterpriseCardId: jest.fn().mockResolvedValue(existingLink),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [UserEnterpriseController],
      providers: [{ provide: UserEnterpriseService, useValue: userEnterpriseService }],
    }).compile();

    controller = testingModule.get(UserEnterpriseController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findByCardId', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findByCardId('42', '')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(userEnterpriseService.findByEnterpriseCardId).not.toHaveBeenCalled();
    });

    it('rechaza un cardId no numérico', async () => {
      await expect(controller.findByCardId('abc', enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'cardId inválido',
      });
      expect(userEnterpriseService.findByEnterpriseCardId).not.toHaveBeenCalled();
    });

    it('rechaza un cardId menor o igual a cero', async () => {
      await expect(controller.findByCardId('0', enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'cardId inválido',
      });
      await expect(controller.findByCardId('-3', enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      expect(userEnterpriseService.findByEnterpriseCardId).not.toHaveBeenCalled();
    });

    it('parsea el cardId y consulta el vínculo de la empresa', async () => {
      await expect(controller.findByCardId('42', enterpriseId)).resolves.toEqual(existingLink);
      expect(userEnterpriseService.findByEnterpriseCardId).toHaveBeenCalledWith(enterpriseId, 42);
    });
  });
});
