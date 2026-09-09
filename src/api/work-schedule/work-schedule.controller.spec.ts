import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { WorkScheduleController } from './work-schedule.controller';
import { WorkScheduleService } from './work-schedule.service';

describe('WorkScheduleController', () => {
  let controller: WorkScheduleController;
  let workScheduleService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';

  beforeEach(async () => {
    workScheduleService = {
      create: jest.fn(),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0, currentPage: 1, totalPages: 0 }),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [WorkScheduleController],
      providers: [{ provide: WorkScheduleService, useValue: workScheduleService }],
    }).compile();

    controller = testingModule.get(WorkScheduleController);
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
      expect(workScheduleService.findAll).not.toHaveBeenCalled();
    });

    it('impide que el filtro JSON sustituya el enterpriseId de la query', async () => {
      await controller.findAll(
        enterpriseId,
        undefined,
        1,
        10,
        'startsAt',
        'DESC',
        JSON.stringify({
          'userEnterprise.enterpriseId': 'empresa-atacante',
          weekday: 1,
        }),
      );

      expect(workScheduleService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'startsAt',
        'DESC',
        {
          'userEnterprise.enterpriseId': enterpriseId,
          weekday: 1,
        },
        [],
      );
    });

    it('conserva el enterpriseId de la query si el filtro JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId, undefined, 1, 10, 'startsAt', 'DESC', '{no-es-json');

      expect(workScheduleService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'startsAt',
        'DESC',
        { 'userEnterprise.enterpriseId': enterpriseId },
        [],
      );
    });
  });
});
