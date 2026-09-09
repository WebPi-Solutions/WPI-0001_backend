import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';

describe('UserController', () => {
  let controller: UserController;
  let userService: {
    findByEnterpriseCardId: jest.Mock;
  };

  beforeEach(async () => {
    userService = {
      findByEnterpriseCardId: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: userService,
        },
      ],
    }).compile();

    controller = testingModule.get(UserController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findByCardId', () => {
    it('exige enterpriseId para resolver la tarjeta', async () => {
      await expect(controller.findByCardId('12', '')).rejects.toMatchObject({
        status: 400,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(userService.findByEnterpriseCardId).not.toHaveBeenCalled();
    });

    it('rechaza un cardId no numérico o no positivo', async () => {
      await expect(controller.findByCardId('abc', 'enterprise-1')).rejects.toMatchObject({
        status: 400,
        message: 'cardId inválido',
      });
      await expect(controller.findByCardId('0', 'enterprise-1')).rejects.toMatchObject({
        status: 400,
        message: 'cardId inválido',
      });
      expect(userService.findByEnterpriseCardId).not.toHaveBeenCalled();
    });

    it('delega al servicio con el cardId parseado y las relaciones', async () => {
      userService.findByEnterpriseCardId.mockResolvedValue({ id: 'user-1' });

      await expect(
        controller.findByCardId('42', 'enterprise-1', 'userEnterprises,userEnterprises.enterprise'),
      ).resolves.toEqual({ id: 'user-1' });
      expect(userService.findByEnterpriseCardId).toHaveBeenCalledWith(
        'enterprise-1',
        42,
        ['userEnterprises', 'userEnterprises.enterprise'],
      );
    });
  });
});
