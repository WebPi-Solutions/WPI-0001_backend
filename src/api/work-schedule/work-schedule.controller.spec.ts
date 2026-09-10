import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CreateWorkScheduleDto } from './dto/create-work-schedule.dto';
import { UpdateWorkScheduleDto } from './dto/update-work-schedule.dto';
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
  const workScheduleId = 'work-schedule-uuid';
  const userEnterpriseId = 'user-enterprise-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  beforeEach(async () => {
    workScheduleService = {
      create: jest.fn().mockResolvedValue({ id: workScheduleId }),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
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

  describe('create', () => {
    const createDto: CreateWorkScheduleDto = {
      userEnterpriseId,
      startsAt: '2026-04-13T08:00:00.000Z',
      endsAt: '2026-04-13T16:00:00.000Z',
    };

    it('exige enterpriseId', async () => {
      await expect(controller.create('', createDto)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(workScheduleService.create).not.toHaveBeenCalled();
    });

    it('delega la creación al servicio', async () => {
      await expect(controller.create(enterpriseId, createDto)).resolves.toEqual({
        id: workScheduleId,
      });
      expect(workScheduleService.create).toHaveBeenCalledWith(enterpriseId, createDto);
    });
  });

  describe('findAll', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findAll('')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(workScheduleService.findAll).not.toHaveBeenCalled();
    });

    it('incluye userEnterpriseId y fuerza el filtro de empresa', async () => {
      await controller.findAll(
        enterpriseId,
        userEnterpriseId,
        2,
        20,
        'startsAt',
        'ASC',
        JSON.stringify({
          'userEnterprise.enterpriseId': 'empresa-atacante',
          startsAt: '2026-04-13T08:00:00.000Z',
        }),
        'userEnterprise',
      );

      expect(workScheduleService.findAll).toHaveBeenCalledWith(
        2,
        20,
        'startsAt',
        'ASC',
        {
          startsAt: '2026-04-13T08:00:00.000Z',
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
        'startsAt',
        'DESC',
        '{no-es-json',
      );

      expect(console.error).toHaveBeenCalled();
      expect(workScheduleService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'startsAt',
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

      expect(workScheduleService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'startsAt',
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
        'startsAt',
        'DESC',
        JSON.stringify({ weekday: 1 }),
      );

      expect(workScheduleService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'startsAt',
        'DESC',
        {
          weekday: 1,
          'userEnterprise.enterpriseId': enterpriseId,
        },
        [],
      );
    });
  });

  describe('findById', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findById(workScheduleId, '')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(workScheduleService.findById).not.toHaveBeenCalled();
    });

    it('delega al servicio parseando las relaciones', async () => {
      workScheduleService.findById.mockResolvedValue({ id: workScheduleId });

      await expect(
        controller.findById(workScheduleId, enterpriseId, 'userEnterprise'),
      ).resolves.toEqual({ id: workScheduleId });
      expect(workScheduleService.findById).toHaveBeenCalledWith(
        workScheduleId,
        enterpriseId,
        ['userEnterprise'],
      );
    });

    it('busca sin relaciones cuando no se informan', async () => {
      workScheduleService.findById.mockResolvedValue({ id: workScheduleId });

      await controller.findById(workScheduleId, enterpriseId);

      expect(workScheduleService.findById).toHaveBeenCalledWith(
        workScheduleId,
        enterpriseId,
        [],
      );
    });
  });

  describe('updateById', () => {
    const updateDto: UpdateWorkScheduleDto = { endsAt: '2026-04-13T18:00:00.000Z' };

    it('exige enterpriseId', async () => {
      await expect(
        controller.updateById(workScheduleId, '', updateDto),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(workScheduleService.updateById).not.toHaveBeenCalled();
    });

    it('delega la actualización al servicio', async () => {
      workScheduleService.updateById.mockResolvedValue({ id: workScheduleId, ...updateDto });

      await expect(
        controller.updateById(workScheduleId, enterpriseId, updateDto),
      ).resolves.toEqual({ id: workScheduleId, endsAt: '2026-04-13T18:00:00.000Z' });
      expect(workScheduleService.updateById).toHaveBeenCalledWith(
        workScheduleId,
        enterpriseId,
        updateDto,
      );
    });
  });

  describe('delete', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.delete(workScheduleId, '')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(workScheduleService.deleteById).not.toHaveBeenCalled();
    });

    it('delega la eliminación al servicio', async () => {
      workScheduleService.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(controller.delete(workScheduleId, enterpriseId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
      expect(workScheduleService.deleteById).toHaveBeenCalledWith(
        workScheduleId,
        enterpriseId,
      );
    });
  });
});
