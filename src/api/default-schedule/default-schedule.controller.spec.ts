import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DefaultScheduleController } from './default-schedule.controller';
import { DefaultScheduleService } from './default-schedule.service';
import { CreateDefaultScheduleDto } from './dto/create-default-schedule.dto';
import { UpdateDefaultScheduleDto } from './dto/update-default-schedule.dto';

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
  const defaultScheduleId = 'default-schedule-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  beforeEach(async () => {
    defaultScheduleService = {
      create: jest.fn().mockResolvedValue({ id: defaultScheduleId }),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
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

  describe('create', () => {
    const createDto: CreateDefaultScheduleDto = {
      name: 'Jornada oficina estándar',
      schedule: { weekdays: { mon: [{ start: '09:00', end: '17:00' }] } },
    };

    it('exige enterpriseId', async () => {
      await expect(controller.create('', createDto)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(defaultScheduleService.create).not.toHaveBeenCalled();
    });

    it('delega la creación al servicio', async () => {
      await expect(controller.create(enterpriseId, createDto)).resolves.toEqual({
        id: defaultScheduleId,
      });
      expect(defaultScheduleService.create).toHaveBeenCalledWith(enterpriseId, createDto);
    });
  });

  describe('findAll', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findAll('')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(defaultScheduleService.findAll).not.toHaveBeenCalled();
    });

    it('parsea el filtro JSON y fuerza el enterpriseId de la query', async () => {
      await controller.findAll(
        enterpriseId,
        2,
        20,
        'name',
        'DESC',
        JSON.stringify({ enterpriseId: 'empresa-atacante', name: 'Oficina' }),
        'enterprise',
      );

      expect(defaultScheduleService.findAll).toHaveBeenCalledWith(
        2,
        20,
        'name',
        'DESC',
        { name: 'Oficina', enterpriseId },
        ['enterprise'],
      );
    });

    it('conserva el enterpriseId si el filtro JSON es inválido', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await controller.findAll(enterpriseId, 1, 10, 'name', 'ASC', '{no-es-json');

      expect(console.error).toHaveBeenCalled();
      expect(defaultScheduleService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'name',
        'ASC',
        { enterpriseId },
        [],
      );
    });

    it('usa valores por defecto al omitir query opcionales', async () => {
      await controller.findAll(enterpriseId);

      expect(defaultScheduleService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'name',
        'ASC',
        { enterpriseId },
        [],
      );
    });
  });

  describe('findById', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findById(defaultScheduleId, '')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(defaultScheduleService.findById).not.toHaveBeenCalled();
    });

    it('delega al servicio parseando las relaciones', async () => {
      defaultScheduleService.findById.mockResolvedValue({ id: defaultScheduleId });

      await expect(
        controller.findById(defaultScheduleId, enterpriseId, 'enterprise'),
      ).resolves.toEqual({ id: defaultScheduleId });
      expect(defaultScheduleService.findById).toHaveBeenCalledWith(
        defaultScheduleId,
        enterpriseId,
        ['enterprise'],
      );
    });

    it('busca sin relaciones cuando no se informan', async () => {
      defaultScheduleService.findById.mockResolvedValue({ id: defaultScheduleId });

      await controller.findById(defaultScheduleId, enterpriseId);

      expect(defaultScheduleService.findById).toHaveBeenCalledWith(
        defaultScheduleId,
        enterpriseId,
        [],
      );
    });
  });

  describe('updateById', () => {
    const updateDto: UpdateDefaultScheduleDto = { name: 'Jornada intensiva' };

    it('exige enterpriseId', async () => {
      await expect(
        controller.updateById(defaultScheduleId, '', updateDto),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(defaultScheduleService.updateById).not.toHaveBeenCalled();
    });

    it('delega la actualización al servicio', async () => {
      defaultScheduleService.updateById.mockResolvedValue({
        id: defaultScheduleId,
        ...updateDto,
      });

      await expect(
        controller.updateById(defaultScheduleId, enterpriseId, updateDto),
      ).resolves.toEqual({ id: defaultScheduleId, name: 'Jornada intensiva' });
      expect(defaultScheduleService.updateById).toHaveBeenCalledWith(
        defaultScheduleId,
        enterpriseId,
        updateDto,
      );
    });
  });

  describe('delete', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.delete(defaultScheduleId, '')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(defaultScheduleService.deleteById).not.toHaveBeenCalled();
    });

    it('delega la eliminación al servicio', async () => {
      defaultScheduleService.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(controller.delete(defaultScheduleId, enterpriseId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
      expect(defaultScheduleService.deleteById).toHaveBeenCalledWith(
        defaultScheduleId,
        enterpriseId,
      );
    });
  });
});
