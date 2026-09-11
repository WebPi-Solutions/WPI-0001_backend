import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { CreateUserDto } from 'src/entities/user/dto/create-user.dto';
import { User } from 'src/entities/user/user.entity';
import { UserController } from './user.controller';
import { UserService } from './user.service';

describe('UserController', () => {
  let controller: UserController;
  let userService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findByEmail: jest.Mock;
    findById: jest.Mock;
    findByEnterpriseCardId: jest.Mock;
    updateById: jest.Mock;
    unlinkUserFromEnterprise: jest.Mock;
  };

  const userId = 'user-uuid';
  const enterpriseId = 'enterprise-1';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  beforeEach(async () => {
    userService = {
      create: jest.fn().mockResolvedValue({ id: userId }),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findByEnterpriseCardId: jest.fn(),
      updateById: jest.fn(),
      unlinkUserFromEnterprise: jest.fn(),
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

  describe('create', () => {
    it('delega la creación al servicio', async () => {
      const payload = { email: 'ana@example.com', name: 'Ana' } as CreateUserDto;

      await expect(controller.create(payload)).resolves.toEqual({ id: userId });
      expect(userService.create).toHaveBeenCalledWith(payload);
    });
  });

  describe('findAll', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findAll('')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(userService.findAll).not.toHaveBeenCalled();
    });

    it('usa valores por defecto y fuerza el filtro de empresa', async () => {
      jest.spyOn(console, 'log').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId);

      expect(userService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'name',
        'ASC',
        { 'userEnterprises.enterpriseId': enterpriseId },
        [],
      );
    });

    it('parsea el filtro JSON y las relaciones, imponiendo la empresa activa', async () => {
      jest.spyOn(console, 'log').mockImplementation(() => undefined);

      await controller.findAll(
        enterpriseId,
        2,
        20,
        'email',
        'DESC',
        JSON.stringify({ 'userEnterprises.enterpriseId': 'empresa-atacante', status: 'active' }),
        'userEnterprises,userEnterprises.enterprise',
      );

      expect(userService.findAll).toHaveBeenCalledWith(
        2,
        20,
        'email',
        'DESC',
        { status: 'active', 'userEnterprises.enterpriseId': enterpriseId },
        ['userEnterprises', 'userEnterprises.enterprise'],
      );
    });

    it('conserva el filtro de empresa si el JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      jest.spyOn(console, 'log').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId, 1, 10, 'name', 'ASC', '{no-es-json');

      expect(console.error).toHaveBeenCalled();
      expect(userService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'name',
        'ASC',
        { 'userEnterprises.enterpriseId': enterpriseId },
        [],
      );
    });
  });

  describe('findMyself', () => {
    it('busca al usuario autenticado por email con las empresas', async () => {
      userService.findByEmail.mockResolvedValue({ id: userId });
      const request = { user: { email: 'ana@example.com' } } as unknown as Request;

      await expect(controller.findMyself(request)).resolves.toEqual({ id: userId });
      expect(userService.findByEmail).toHaveBeenCalledWith('ana@example.com', [
        'userEnterprises',
        'userEnterprises.enterprise',
        'userEnterprises.enterpriseRole',
      ]);
    });
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

    it('envía relaciones vacías cuando no se informan', async () => {
      userService.findByEnterpriseCardId.mockResolvedValue({ id: 'user-1' });

      await controller.findByCardId('42', enterpriseId);

      expect(userService.findByEnterpriseCardId).toHaveBeenCalledWith(enterpriseId, 42, []);
    });
  });

  describe('findByEmail', () => {
    it('delega al servicio parseando las relaciones', async () => {
      userService.findByEmail.mockResolvedValue({ id: userId });

      await expect(
        controller.findByEmail('ana@example.com', 'userEnterprises'),
      ).resolves.toEqual({ id: userId });
      expect(userService.findByEmail).toHaveBeenCalledWith('ana@example.com', ['userEnterprises']);
    });

    it('consulta sin relaciones cuando no se informan', async () => {
      userService.findByEmail.mockResolvedValue({ id: userId });

      await controller.findByEmail('ana@example.com');

      expect(userService.findByEmail).toHaveBeenCalledWith('ana@example.com', []);
    });
  });

  describe('findById', () => {
    it('delega al servicio parseando las relaciones', async () => {
      userService.findById.mockResolvedValue({ id: userId });

      await expect(controller.findById(userId, 'userEnterprises')).resolves.toEqual({ id: userId });
      expect(userService.findById).toHaveBeenCalledWith(userId, ['userEnterprises']);
    });

    it('consulta sin relaciones cuando no se informan', async () => {
      userService.findById.mockResolvedValue({ id: userId });

      await controller.findById(userId);

      expect(userService.findById).toHaveBeenCalledWith(userId, []);
    });
  });

  describe('updateById', () => {
    it('delega la actualización incluyendo el enterpriseId opcional', async () => {
      const payload = { name: 'Ana' } as User;
      userService.updateById.mockResolvedValue({ id: userId, name: 'Ana' });

      await expect(controller.updateById(userId, payload, enterpriseId)).resolves.toEqual({
        id: userId,
        name: 'Ana',
      });
      expect(userService.updateById).toHaveBeenCalledWith(userId, payload, enterpriseId);
    });

    it('delega sin enterpriseId cuando no se informa', async () => {
      const payload = { name: 'Ana' } as User;
      userService.updateById.mockResolvedValue({ id: userId });

      await controller.updateById(userId, payload);

      expect(userService.updateById).toHaveBeenCalledWith(userId, payload, undefined);
    });
  });

  describe('unlinkUserFromEnterprise', () => {
    it('delega la desvinculación al servicio', async () => {
      userService.unlinkUserFromEnterprise.mockResolvedValue({ affected: 1, raw: [] });

      await expect(controller.unlinkUserFromEnterprise(userId, enterpriseId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
      expect(userService.unlinkUserFromEnterprise).toHaveBeenCalledWith(userId, enterpriseId);
    });
  });
});
