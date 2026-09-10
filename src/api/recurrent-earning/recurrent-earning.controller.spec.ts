import { HttpStatus, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RecurrentEarning } from 'src/entities/recurrent-earning/recurrent-earning.entity';
import { RecurrentEarningController } from './recurrent-earning.controller';
import { RecurrentEarningService } from './recurrent-earning.service';

describe('RecurrentEarningController', () => {
  let controller: RecurrentEarningController;
  let recurrentEarningService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const recurrentEarningId = 'recurrent-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  beforeEach(async () => {
    recurrentEarningService = {
      create: jest.fn().mockResolvedValue({ id: recurrentEarningId }),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [RecurrentEarningController],
      providers: [
        { provide: RecurrentEarningService, useValue: recurrentEarningService },
      ],
    }).compile();

    controller = testingModule.get(RecurrentEarningController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('exige enterpriseId', async () => {
      await expect(
        controller.create('', { name: 'Cuota' } as RecurrentEarning),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(recurrentEarningService.create).not.toHaveBeenCalled();
    });

    it('asigna el enterpriseId de la query al ingreso', async () => {
      const recurrentEarning = {
        name: 'Cuota mensual',
        enterpriseId: 'empresa-atacante',
      } as RecurrentEarning;

      await expect(controller.create(enterpriseId, recurrentEarning)).resolves.toEqual({
        id: recurrentEarningId,
      });
      expect(recurrentEarning.enterpriseId).toBe(enterpriseId);
      expect(recurrentEarningService.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Cuota mensual', enterpriseId }),
      );
    });
  });

  describe('findAll', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findAll('')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(recurrentEarningService.findAll).not.toHaveBeenCalled();
    });

    it('parsea el filtro JSON y fuerza el enterpriseId de la query', async () => {
      await controller.findAll(
        enterpriseId,
        2,
        20,
        'createdAt',
        'ASC',
        JSON.stringify({ enterpriseId: 'empresa-atacante', clientId: 'client-uuid' }),
        'client',
      );

      expect(recurrentEarningService.findAll).toHaveBeenCalledWith(
        2,
        20,
        'createdAt',
        'ASC',
        { clientId: 'client-uuid', enterpriseId },
        ['client'],
      );
    });

    it('conserva el enterpriseId si el filtro JSON es inválido', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId, 1, 10, 'createdAt', 'DESC', '{no-es-json');

      expect(recurrentEarningService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'createdAt',
        'DESC',
        { enterpriseId },
        [],
      );
    });

    it('usa valores por defecto al omitir query opcionales', async () => {
      await controller.findAll(enterpriseId);

      expect(recurrentEarningService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'createdAt',
        'DESC',
        { enterpriseId },
        [],
      );
    });
  });

  describe('findById', () => {
    it('delega al servicio parseando las relaciones', async () => {
      recurrentEarningService.findById.mockResolvedValue({ id: recurrentEarningId });

      await expect(
        controller.findById(recurrentEarningId, 'client,invoices'),
      ).resolves.toEqual({ id: recurrentEarningId });
      expect(recurrentEarningService.findById).toHaveBeenCalledWith(recurrentEarningId, [
        'client',
        'invoices',
      ]);
    });

    it('busca sin relaciones cuando no se informan', async () => {
      recurrentEarningService.findById.mockResolvedValue({ id: recurrentEarningId });

      await controller.findById(recurrentEarningId);

      expect(recurrentEarningService.findById).toHaveBeenCalledWith(recurrentEarningId, []);
    });
  });

  describe('updateById', () => {
    it('delega la actualización al servicio', async () => {
      const payload = { name: 'Cuota actualizada' } as RecurrentEarning;
      recurrentEarningService.updateById.mockResolvedValue({
        id: recurrentEarningId,
        ...payload,
      });

      await expect(controller.updateById(recurrentEarningId, payload)).resolves.toEqual({
        id: recurrentEarningId,
        name: 'Cuota actualizada',
      });
      expect(recurrentEarningService.updateById).toHaveBeenCalledWith(
        recurrentEarningId,
        payload,
      );
    });
  });

  describe('deleteById', () => {
    it('delega la eliminación al servicio', async () => {
      recurrentEarningService.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(controller.deleteById(recurrentEarningId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
      expect(recurrentEarningService.deleteById).toHaveBeenCalledWith(recurrentEarningId);
    });
  });
});
