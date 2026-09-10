import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserEnterpriseController } from './user-enterprise.controller';
import { UserEnterpriseService } from './user-enterprise.service';

describe('UserEnterpriseController', () => {
  let controller: UserEnterpriseController;
  let userEnterpriseService: {
    findByEnterpriseCardId: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';

  beforeEach(async () => {
    userEnterpriseService = {
      findByEnterpriseCardId: jest.fn(),
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
      await expect(controller.findByCardId('12', '')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(userEnterpriseService.findByEnterpriseCardId).not.toHaveBeenCalled();
    });

    it('rechaza un cardId no numérico o no positivo', async () => {
      await expect(controller.findByCardId('abc', enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'cardId inválido',
      });
      await expect(controller.findByCardId('0', enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'cardId inválido',
      });
      expect(userEnterpriseService.findByEnterpriseCardId).not.toHaveBeenCalled();
    });

    it('delega al servicio con el cardId parseado a entero', async () => {
      userEnterpriseService.findByEnterpriseCardId.mockResolvedValue({
        id: 'user-enterprise-uuid',
      });

      await expect(controller.findByCardId('42', enterpriseId)).resolves.toEqual({
        id: 'user-enterprise-uuid',
      });
      expect(userEnterpriseService.findByEnterpriseCardId).toHaveBeenCalledWith(
        enterpriseId,
        42,
      );
    });
  });
});
