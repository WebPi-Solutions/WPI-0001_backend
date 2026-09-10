import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { SigningAction } from 'src/entities/signing/signing.entity';
import { CreateSigningDto } from './dto/create-signing.dto';
import { UpdateSigningDto } from './dto/update-signing.dto';
import { SigningController } from './signing.controller';
import { SigningService } from './signing.service';

describe('SigningController', () => {
  let controller: SigningController;
  let signingService: {
    create: jest.Mock;
    findAll: jest.Mock;
    getSigningUpdatesForSigning: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const signingId = 'signing-uuid';
  const userEnterpriseId = 'user-enterprise-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  /**
   * Construye una petición HTTP autenticada o anónima.
   * @param userId - Identificador del usuario; si se omite, la petición no está autenticada
   * @returns Petición simulada
   */
  const buildRequest = (userId?: string): Request =>
    ({ user: userId ? { id: userId } : undefined } as Request);

  beforeEach(async () => {
    signingService = {
      create: jest.fn().mockResolvedValue({ id: signingId }),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      getSigningUpdatesForSigning: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [SigningController],
      providers: [{ provide: SigningService, useValue: signingService }],
    }).compile();

    controller = testingModule.get(SigningController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    const createDto: CreateSigningDto = {
      userEnterpriseId,
      action: SigningAction.START,
    };

    it('exige enterpriseId', async () => {
      await expect(controller.create('', createDto)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(signingService.create).not.toHaveBeenCalled();
    });

    it('delega la creación al servicio', async () => {
      await expect(controller.create(enterpriseId, createDto)).resolves.toEqual({
        id: signingId,
      });
      expect(signingService.create).toHaveBeenCalledWith(enterpriseId, createDto);
    });
  });

  describe('findAll', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findAll('')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(signingService.findAll).not.toHaveBeenCalled();
    });

    it('incluye userEnterpriseId y fuerza el filtro de empresa', async () => {
      await controller.findAll(
        enterpriseId,
        userEnterpriseId,
        2,
        20,
        'moment',
        'ASC',
        JSON.stringify({
          'userEnterprise.enterpriseId': 'empresa-atacante',
          action: SigningAction.START,
        }),
        'userEnterprise',
      );

      expect(signingService.findAll).toHaveBeenCalledWith(
        2,
        20,
        'moment',
        'ASC',
        {
          action: SigningAction.START,
          'userEnterprise.enterpriseId': enterpriseId,
          userEnterpriseId,
        },
        ['userEnterprise'],
      );
    });

    it('conserva enterpriseId y userEnterpriseId si el filtro JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await controller.findAll(
        enterpriseId,
        userEnterpriseId,
        1,
        10,
        'moment',
        'DESC',
        '{no-es-json',
      );

      expect(console.error).toHaveBeenCalled();
      expect(signingService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'moment',
        'DESC',
        {
          'userEnterprise.enterpriseId': enterpriseId,
          userEnterpriseId,
        },
        [],
      );
    });

    it('usa valores por defecto y omite userEnterpriseId si no se informa', async () => {
      await controller.findAll(enterpriseId);

      expect(signingService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'moment',
        'DESC',
        { 'userEnterprise.enterpriseId': enterpriseId },
        [],
      );
    });

    it('fusiona un filtro JSON válido sin userEnterpriseId', async () => {
      await controller.findAll(
        enterpriseId,
        undefined,
        1,
        10,
        'moment',
        'DESC',
        JSON.stringify({ action: SigningAction.END }),
      );

      expect(signingService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'moment',
        'DESC',
        {
          action: SigningAction.END,
          'userEnterprise.enterpriseId': enterpriseId,
        },
        [],
      );
    });
  });

  describe('getSigningUpdates', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.getSigningUpdates(signingId, '')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(signingService.getSigningUpdatesForSigning).not.toHaveBeenCalled();
    });

    it('delega el histórico al servicio', async () => {
      signingService.getSigningUpdatesForSigning.mockResolvedValue([]);

      await expect(controller.getSigningUpdates(signingId, enterpriseId)).resolves.toEqual([]);
      expect(signingService.getSigningUpdatesForSigning).toHaveBeenCalledWith(
        signingId,
        enterpriseId,
      );
    });
  });

  describe('findById', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findById(signingId, '')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(signingService.findById).not.toHaveBeenCalled();
    });

    it('delega al servicio parseando las relaciones', async () => {
      signingService.findById.mockResolvedValue({ id: signingId });

      await expect(
        controller.findById(signingId, enterpriseId, 'userEnterprise'),
      ).resolves.toEqual({ id: signingId });
      expect(signingService.findById).toHaveBeenCalledWith(signingId, enterpriseId, [
        'userEnterprise',
      ]);
    });

    it('busca sin relaciones cuando no se informan', async () => {
      signingService.findById.mockResolvedValue({ id: signingId });

      await controller.findById(signingId, enterpriseId);

      expect(signingService.findById).toHaveBeenCalledWith(signingId, enterpriseId, []);
    });
  });

  describe('updateById', () => {
    const updateDto: UpdateSigningDto = { action: SigningAction.END };

    it('exige enterpriseId', async () => {
      await expect(
        controller.updateById(signingId, '', updateDto, buildRequest('user-uuid')),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(signingService.updateById).not.toHaveBeenCalled();
    });

    it('lanza 401 si falta el usuario autenticado', async () => {
      await expect(
        controller.updateById(signingId, enterpriseId, updateDto, buildRequest()),
      ).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
        message: 'No se pudo identificar al usuario autenticado',
      });
      expect(signingService.updateById).not.toHaveBeenCalled();
    });

    it('delega la actualización con el actorUserId del request', async () => {
      signingService.updateById.mockResolvedValue({ id: signingId });

      await expect(
        controller.updateById(signingId, enterpriseId, updateDto, buildRequest('user-uuid')),
      ).resolves.toEqual({ id: signingId });
      expect(signingService.updateById).toHaveBeenCalledWith(
        signingId,
        enterpriseId,
        updateDto,
        'user-uuid',
      );
    });
  });

  describe('delete', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.delete(signingId, '')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(signingService.deleteById).not.toHaveBeenCalled();
    });

    it('delega la anulación al servicio', async () => {
      signingService.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(controller.delete(signingId, enterpriseId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
      expect(signingService.deleteById).toHaveBeenCalledWith(signingId, enterpriseId);
    });
  });
});
