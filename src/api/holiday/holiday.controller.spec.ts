import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';
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
  const holidayId = 'holiday-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  beforeEach(async () => {
    holidayService = {
      create: jest.fn().mockResolvedValue({ id: holidayId }),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
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

  describe('create', () => {
    const createDto: CreateHolidayDto = {
      name: 'Navidad',
      calendarDate: '2026-12-25',
    };

    it('exige enterpriseId', async () => {
      await expect(controller.create('', createDto)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(holidayService.create).not.toHaveBeenCalled();
    });

    it('delega la creación al servicio', async () => {
      await expect(controller.create(enterpriseId, createDto)).resolves.toEqual({
        id: holidayId,
      });
      expect(holidayService.create).toHaveBeenCalledWith(enterpriseId, createDto);
    });
  });

  describe('findAll', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findAll('')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(holidayService.findAll).not.toHaveBeenCalled();
    });

    it('parsea el filtro JSON y fuerza el enterpriseId de la query', async () => {
      await controller.findAll(
        enterpriseId,
        2,
        20,
        'calendarDate',
        'DESC',
        JSON.stringify({ enterpriseId: 'empresa-atacante', name: 'Navidad' }),
        'enterprise',
      );

      expect(holidayService.findAll).toHaveBeenCalledWith(
        2,
        20,
        'calendarDate',
        'DESC',
        { name: 'Navidad', enterpriseId },
        ['enterprise'],
      );
    });

    it('conserva el enterpriseId si el filtro JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId, 1, 10, 'calendarDate', 'ASC', '{no-es-json');

      expect(console.error).toHaveBeenCalled();
      expect(holidayService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'calendarDate',
        'ASC',
        { enterpriseId },
        [],
      );
    });

    it('usa valores por defecto al omitir query opcionales', async () => {
      await controller.findAll(enterpriseId);

      expect(holidayService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'calendarDate',
        'ASC',
        { enterpriseId },
        [],
      );
    });
  });

  describe('findById', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findById(holidayId, '')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(holidayService.findById).not.toHaveBeenCalled();
    });

    it('delega al servicio parseando las relaciones', async () => {
      holidayService.findById.mockResolvedValue({ id: holidayId });

      await expect(
        controller.findById(holidayId, enterpriseId, 'enterprise'),
      ).resolves.toEqual({ id: holidayId });
      expect(holidayService.findById).toHaveBeenCalledWith(holidayId, enterpriseId, [
        'enterprise',
      ]);
    });

    it('busca sin relaciones cuando no se informan', async () => {
      holidayService.findById.mockResolvedValue({ id: holidayId });

      await controller.findById(holidayId, enterpriseId);

      expect(holidayService.findById).toHaveBeenCalledWith(holidayId, enterpriseId, []);
    });
  });

  describe('updateById', () => {
    const updateDto: UpdateHolidayDto = { name: 'Año Nuevo' };

    it('exige enterpriseId', async () => {
      await expect(controller.updateById(holidayId, '', updateDto)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(holidayService.updateById).not.toHaveBeenCalled();
    });

    it('delega la actualización al servicio', async () => {
      holidayService.updateById.mockResolvedValue({ id: holidayId, ...updateDto });

      await expect(controller.updateById(holidayId, enterpriseId, updateDto)).resolves.toEqual({
        id: holidayId,
        name: 'Año Nuevo',
      });
      expect(holidayService.updateById).toHaveBeenCalledWith(
        holidayId,
        enterpriseId,
        updateDto,
      );
    });
  });

  describe('delete', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.delete(holidayId, '')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(holidayService.deleteById).not.toHaveBeenCalled();
    });

    it('delega la eliminación al servicio', async () => {
      holidayService.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(controller.delete(holidayId, enterpriseId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
      expect(holidayService.deleteById).toHaveBeenCalledWith(holidayId, enterpriseId);
    });
  });
});
