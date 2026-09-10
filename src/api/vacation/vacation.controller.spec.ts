import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CreateVacationDto } from './dto/create-vacation.dto';
import { UpdateVacationDto } from './dto/update-vacation.dto';
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
  const vacationId = 'vacation-uuid';
  const userEnterpriseId = 'user-enterprise-uuid';
  const emptyPaginatedResponse = { items: [], total: 0, currentPage: 1, totalPages: 0 };

  beforeEach(async () => {
    vacationService = {
      create: jest.fn().mockResolvedValue({ id: vacationId }),
      findAll: jest.fn().mockResolvedValue(emptyPaginatedResponse),
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

  describe('create', () => {
    const createDto: CreateVacationDto = {
      userEnterpriseId,
      calendarDate: '2026-08-15',
    };

    it('exige enterpriseId', async () => {
      await expect(controller.create('', createDto)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(vacationService.create).not.toHaveBeenCalled();
    });

    it('delega la creación al servicio', async () => {
      await expect(controller.create(enterpriseId, createDto)).resolves.toEqual({
        id: vacationId,
      });
      expect(vacationService.create).toHaveBeenCalledWith(enterpriseId, createDto);
    });
  });

  describe('findAll', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findAll('')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(vacationService.findAll).not.toHaveBeenCalled();
    });

    it('incluye userEnterpriseId y fuerza el filtro de empresa', async () => {
      await controller.findAll(
        enterpriseId,
        userEnterpriseId,
        2,
        20,
        'calendarDate',
        'DESC',
        JSON.stringify({
          'userEnterprise.enterpriseId': 'empresa-atacante',
          name: 'Vacaciones',
        }),
        'userEnterprise',
      );

      expect(vacationService.findAll).toHaveBeenCalledWith(
        2,
        20,
        'calendarDate',
        'DESC',
        {
          name: 'Vacaciones',
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
        'calendarDate',
        'ASC',
        '{no-es-json',
      );

      expect(console.error).toHaveBeenCalled();
      expect(vacationService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'calendarDate',
        'ASC',
        {
          'userEnterprise.enterpriseId': enterpriseId,
          userEnterpriseId,
        },
        [],
      );
    });

    it('usa valores por defecto y omite userEnterpriseId si no se informa', async () => {
      await controller.findAll(enterpriseId);

      expect(vacationService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'calendarDate',
        'ASC',
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
        'calendarDate',
        'ASC',
        JSON.stringify({ name: 'Verano' }),
      );

      expect(vacationService.findAll).toHaveBeenCalledWith(
        1,
        10,
        'calendarDate',
        'ASC',
        {
          name: 'Verano',
          'userEnterprise.enterpriseId': enterpriseId,
        },
        [],
      );
    });
  });

  describe('findById', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.findById(vacationId, '')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(vacationService.findById).not.toHaveBeenCalled();
    });

    it('delega al servicio parseando las relaciones', async () => {
      vacationService.findById.mockResolvedValue({ id: vacationId });

      await expect(
        controller.findById(vacationId, enterpriseId, 'userEnterprise'),
      ).resolves.toEqual({ id: vacationId });
      expect(vacationService.findById).toHaveBeenCalledWith(vacationId, enterpriseId, [
        'userEnterprise',
      ]);
    });

    it('busca sin relaciones cuando no se informan', async () => {
      vacationService.findById.mockResolvedValue({ id: vacationId });

      await controller.findById(vacationId, enterpriseId);

      expect(vacationService.findById).toHaveBeenCalledWith(vacationId, enterpriseId, []);
    });
  });

  describe('updateById', () => {
    const updateDto: UpdateVacationDto = { name: 'Permiso' };

    it('exige enterpriseId', async () => {
      await expect(controller.updateById(vacationId, '', updateDto)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(vacationService.updateById).not.toHaveBeenCalled();
    });

    it('delega la actualización al servicio', async () => {
      vacationService.updateById.mockResolvedValue({ id: vacationId, ...updateDto });

      await expect(
        controller.updateById(vacationId, enterpriseId, updateDto),
      ).resolves.toEqual({ id: vacationId, name: 'Permiso' });
      expect(vacationService.updateById).toHaveBeenCalledWith(
        vacationId,
        enterpriseId,
        updateDto,
      );
    });
  });

  describe('delete', () => {
    it('exige enterpriseId', async () => {
      await expect(controller.delete(vacationId, '')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Es obligatorio especificar el ID de la empresa',
      });
      expect(vacationService.deleteById).not.toHaveBeenCalled();
    });

    it('delega la eliminación al servicio', async () => {
      vacationService.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(controller.delete(vacationId, enterpriseId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
      expect(vacationService.deleteById).toHaveBeenCalledWith(vacationId, enterpriseId);
    });
  });
});
