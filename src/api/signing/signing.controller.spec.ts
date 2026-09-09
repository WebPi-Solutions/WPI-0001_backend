import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { SigningController } from './signing.controller';
import { SigningService } from './signing.service';

describe('SigningController', () => {
  let controller: SigningController;
  let signingService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
    getSigningUpdatesForSigning: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const signingId = 'signing-uuid';

  beforeEach(async () => {
    signingService = {
      create: jest.fn().mockResolvedValue({ id: signingId }),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0, currentPage: 1, totalPages: 0 }),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
      getSigningUpdatesForSigning: jest.fn().mockResolvedValue([]),
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

  describe('findAll', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findAll('')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(signingService.findAll).not.toHaveBeenCalled();
    });

    it('impide que el filtro JSON sustituya el enterpriseId de la query', async () => {
      await controller.findAll(
        enterpriseId,
        undefined,
        1,
        10,
        'moment',
        'DESC',
        JSON.stringify({
          'userEnterprise.enterpriseId': 'empresa-atacante',
          action: 'start',
        }),
      );

      expect(signingService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'moment',
        'DESC',
        {
          'userEnterprise.enterpriseId': enterpriseId,
          action: 'start',
        },
        [],
      );
    });

    it('fuerza el userEnterpriseId de la query sobre el del filtro JSON', async () => {
      await controller.findAll(
        enterpriseId,
        'vinculo-autorizado',
        1,
        10,
        'moment',
        'DESC',
        JSON.stringify({
          'userEnterprise.enterpriseId': 'empresa-atacante',
          userEnterpriseId: 'vinculo-atacante',
        }),
      );

      expect(signingService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'moment',
        'DESC',
        {
          'userEnterprise.enterpriseId': enterpriseId,
          userEnterpriseId: 'vinculo-autorizado',
        },
        [],
      );
    });

    it('conserva el enterpriseId de la query si el filtro JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId, undefined, 2, 25, 'moment', 'ASC', '{no-es-json');

      expect(signingService.findAll).toHaveBeenCalledWith(
        2,
        25,
        'moment',
        'ASC',
        { 'userEnterprise.enterpriseId': enterpriseId },
        [],
      );
    });
  });

  describe('getSigningUpdates', () => {
    it('exige enterpriseId antes de consultar el histórico', async () => {
      await expect(controller.getSigningUpdates(signingId, '')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      expect(signingService.getSigningUpdatesForSigning).not.toHaveBeenCalled();
    });
  });

  describe('updateById', () => {
    it('exige enterpriseId', async () => {
      await expect(
        controller.updateById(signingId, '', {}, { user: { id: 'actor-uuid' } } as Request),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      expect(signingService.updateById).not.toHaveBeenCalled();
    });

    it('rechaza la actualización si el middleware no identificó al usuario', async () => {
      await expect(
        controller.updateById(signingId, enterpriseId, {}, {} as Request),
      ).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
        message: 'No se pudo identificar al usuario autenticado',
      });
      expect(signingService.updateById).not.toHaveBeenCalled();
    });

    it('reenvía el actor autenticado al servicio', async () => {
      await controller.updateById(
        signingId,
        enterpriseId,
        { durationInSeconds: 3600 },
        { user: { id: 'actor-uuid' } } as Request,
      );

      expect(signingService.updateById).toHaveBeenCalledWith(
        signingId,
        enterpriseId,
        { durationInSeconds: 3600 },
        'actor-uuid',
      );
    });
  });
});
