import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { VacationController } from './vacation.controller';
import { VacationService } from './vacation.service';

describe('VacationController', () => {
  let controller: VacationController;
  let vacationService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';

  beforeEach(async () => {
    vacationService = {
      create: jest.fn(),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0, currentPage: 1, totalPages: 0 }),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [VacationController],
      providers: [{ provide: VacationService, useValue: vacationService }],
    }).compile();

    controller = testingModule.get(VacationController);
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
      expect(vacationService.findAll).not.toHaveBeenCalled();
    });

    it('impide que el filtro JSON sustituya el enterpriseId de la query', async () => {
      await controller.findAll(
        enterpriseId,
        undefined,
        1,
        10,
        'calendarDate',
        'ASC',
        JSON.stringify({
          'userEnterprise.enterpriseId': 'empresa-atacante',
          name: 'Permiso',
        }),
      );

      expect(vacationService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'calendarDate',
        'ASC',
        {
          'userEnterprise.enterpriseId': enterpriseId,
          name: 'Permiso',
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
        'calendarDate',
        'ASC',
        JSON.stringify({
          'userEnterprise.enterpriseId': 'empresa-atacante',
          userEnterpriseId: 'vinculo-atacante',
        }),
      );

      expect(vacationService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'calendarDate',
        'ASC',
        {
          'userEnterprise.enterpriseId': enterpriseId,
          userEnterpriseId: 'vinculo-autorizado',
        },
        [],
      );
    });

    it('conserva el enterpriseId de la query si el filtro JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId, undefined, 3, 20, 'calendarDate', 'DESC', '{no-es-json');

      expect(vacationService.findAll).toHaveBeenCalledWith(
        3,
        20,
        'calendarDate',
        'DESC',
        { 'userEnterprise.enterpriseId': enterpriseId },
        [],
      );
    });
  });
});
