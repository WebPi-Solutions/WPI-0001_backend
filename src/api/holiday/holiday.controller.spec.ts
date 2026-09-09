import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HolidayController } from './holiday.controller';
import { HolidayService } from './holiday.service';

describe('HolidayController', () => {
  let controller: HolidayController;
  let holidayService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';

  beforeEach(async () => {
    holidayService = {
      create: jest.fn(),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0, currentPage: 1, totalPages: 0 }),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [HolidayController],
      providers: [{ provide: HolidayService, useValue: holidayService }],
    }).compile();

    controller = testingModule.get(HolidayController);
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
      expect(holidayService.findAll).not.toHaveBeenCalled();
    });

    it('impide que el filtro JSON sustituya el enterpriseId de la query', async () => {
      await controller.findAll(
        enterpriseId,
        1,
        10,
        'calendarDate',
        'ASC',
        JSON.stringify({ enterpriseId: 'empresa-atacante', name: 'Navidad' }),
      );

      expect(holidayService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'calendarDate',
        'ASC',
        { enterpriseId, name: 'Navidad' },
        [],
      );
    });

    it('conserva el enterpriseId de la query si el filtro JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId, 2, 25, 'name', 'DESC', '{no-es-json');

      expect(holidayService.findAll).toHaveBeenCalledWith(
        2,
        25,
        'name',
        'DESC',
        { enterpriseId },
        [],
      );
    });
  });
});
