import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DefaultScheduleController } from './default-schedule.controller';
import { DefaultScheduleService } from './default-schedule.service';

describe('DefaultScheduleController', () => {
  let controller: DefaultScheduleController;
  let defaultScheduleService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';

  beforeEach(async () => {
    defaultScheduleService = {
      create: jest.fn(),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0, currentPage: 1, totalPages: 0 }),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [DefaultScheduleController],
      providers: [{ provide: DefaultScheduleService, useValue: defaultScheduleService }],
    }).compile();

    controller = testingModule.get(DefaultScheduleController);
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
      expect(defaultScheduleService.findAll).not.toHaveBeenCalled();
    });

    it('impide que el filtro JSON sustituya el enterpriseId de la query', async () => {
      await controller.findAll(
        enterpriseId,
        1,
        10,
        'name',
        'ASC',
        JSON.stringify({ enterpriseId: 'empresa-atacante', name: 'Mañana' }),
      );

      expect(defaultScheduleService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'name',
        'ASC',
        { enterpriseId, name: 'Mañana' },
        [],
      );
    });

    it('conserva el enterpriseId de la query si el filtro JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId, 4, 15, 'createdAt', 'DESC', '{no-es-json');

      expect(defaultScheduleService.findAll).toHaveBeenCalledWith(
        4,
        15,
        'createdAt',
        'DESC',
        { enterpriseId },
        [],
      );
    });
  });
});
