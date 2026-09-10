import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EnterpriseAccessService } from 'src/helpers/enterprise-access/enterprise-access.service';
import { WorkScheduleRepository } from 'src/entities/work-schedule/work-schedule-repository.service';
import { WorkSchedule } from 'src/entities/work-schedule/work-schedule.entity';
import { WorkScheduleService } from './work-schedule.service';
import { CreateWorkScheduleDto } from './dto/create-work-schedule.dto';

describe('WorkScheduleService', () => {
  let service: WorkScheduleService;
  let workScheduleRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
    existsOverlapForUserEnterprise: jest.Mock;
  };
  let enterpriseAccessService: {
    assertUserEnterpriseBelongsToEnterprise: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const userEnterpriseId = 'user-enterprise-uuid';
  const scheduleId = 'schedule-uuid';

  /**
   * Construye una franja de trabajo de prueba.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad WorkSchedule simulada
   */
  const buildWorkSchedule = (overrides: Partial<WorkSchedule> = {}): WorkSchedule =>
    ({
      id: scheduleId,
      userEnterpriseId,
      startsAt: new Date('2026-04-13T08:00:00.000Z'),
      endsAt: new Date('2026-04-13T16:00:00.000Z'),
      ...overrides,
    }) as WorkSchedule;

  beforeEach(async () => {
    workScheduleRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
      existsOverlapForUserEnterprise: jest.fn().mockResolvedValue(false),
    };
    enterpriseAccessService = {
      assertUserEnterpriseBelongsToEnterprise: jest.fn().mockResolvedValue({
        id: userEnterpriseId,
        userId: 'user-uuid',
        enterpriseId,
      }),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        WorkScheduleService,
        { provide: WorkScheduleRepository, useValue: workScheduleRepository },
        { provide: EnterpriseAccessService, useValue: enterpriseAccessService },
      ],
    }).compile();

    service = testingModule.get(WorkScheduleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const validDto: CreateWorkScheduleDto = {
      userEnterpriseId,
      startsAt: '2026-04-13T08:00:00.000Z',
      endsAt: '2026-04-13T16:00:00.000Z',
    };

    it('rechaza una franja cuyo fin no es posterior al inicio', async () => {
      await expect(
        service.create(enterpriseId, {
          ...validDto,
          endsAt: '2026-04-13T08:00:00.000Z',
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'La hora de fin debe ser posterior a la hora de inicio',
      });
      expect(workScheduleRepository.create).not.toHaveBeenCalled();
    });

    it('rechaza una franja que se solapa con otra del mismo vínculo', async () => {
      workScheduleRepository.existsOverlapForUserEnterprise.mockResolvedValue(true);

      await expect(service.create(enterpriseId, validDto)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'La franja se solapa con otra franja existente para este usuario',
      });
      expect(workScheduleRepository.existsOverlapForUserEnterprise).toHaveBeenCalledWith(
        userEnterpriseId,
        new Date(validDto.startsAt),
        new Date(validDto.endsAt),
      );
      expect(workScheduleRepository.create).not.toHaveBeenCalled();
    });

    it('persiste la franja cuando el rango es válido y no hay solape', async () => {
      const created = buildWorkSchedule();
      workScheduleRepository.create.mockResolvedValue(created);

      await expect(service.create(enterpriseId, validDto)).resolves.toEqual(created);
      expect(enterpriseAccessService.assertUserEnterpriseBelongsToEnterprise).toHaveBeenCalledWith(
        userEnterpriseId,
        enterpriseId,
        expect.objectContaining({ operationContext: 'work-schedule' }),
      );
    });

    it('no crea la franja si el vínculo no pertenece a la empresa', async () => {
      enterpriseAccessService.assertUserEnterpriseBelongsToEnterprise.mockRejectedValue(
        new HttpException('Franja de horario no encontrada', HttpStatus.NOT_FOUND),
      );

      await expect(service.create(enterpriseId, validDto)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
      expect(workScheduleRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('updateById', () => {
    it('rechaza un rango invertido usando el inicio existente si no se envía startsAt', async () => {
      workScheduleRepository.findById.mockResolvedValue(buildWorkSchedule());

      await expect(
        service.updateById(scheduleId, enterpriseId, {
          endsAt: '2026-04-13T07:00:00.000Z',
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'La hora de fin debe ser posterior a la hora de inicio',
      });
      expect(workScheduleRepository.updateById).not.toHaveBeenCalled();
    });

    it('excluye la propia franja al comprobar solapes en actualización', async () => {
      workScheduleRepository.findById.mockResolvedValue(buildWorkSchedule());
      workScheduleRepository.existsOverlapForUserEnterprise.mockResolvedValue(true);

      await expect(
        service.updateById(scheduleId, enterpriseId, {
          startsAt: '2026-04-13T09:00:00.000Z',
          endsAt: '2026-04-13T17:00:00.000Z',
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      expect(workScheduleRepository.existsOverlapForUserEnterprise).toHaveBeenCalledWith(
        userEnterpriseId,
        new Date('2026-04-13T09:00:00.000Z'),
        new Date('2026-04-13T17:00:00.000Z'),
        scheduleId,
      );
    });
  });

  describe('findById', () => {
    it('lanza 404 cuando la franja no existe', async () => {
      workScheduleRepository.findById.mockResolvedValue(null);

      await expect(service.findById(scheduleId, enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Franja de horario no encontrada',
      });
    });

    it('devuelve la franja cuando existe y fusiona relaciones extra', async () => {
      const schedule = buildWorkSchedule();
      workScheduleRepository.findById.mockResolvedValue(schedule);

      await expect(service.findById(scheduleId, enterpriseId, ['custom'])).resolves.toEqual(
        schedule,
      );
    });
  });

  describe('findAll, update vacío y delete', () => {
    it('lista franjas fusionando relaciones por defecto', async () => {
      workScheduleRepository.findAll.mockResolvedValue({
        items: [],
        total: 0,
        currentPage: 1,
        totalPages: 0,
      });

      await service.findAll(1, 10, 'startsAt', 'DESC', {});

      expect(workScheduleRepository.findAll).toHaveBeenCalledWith(
        1,
        10,
        'startsAt',
        'DESC',
        {},
        expect.arrayContaining(['userEnterprise']),
      );
    });

    it('devuelve el registro actual si no hay campos editables', async () => {
      workScheduleRepository.findById.mockResolvedValue(buildWorkSchedule());

      await service.updateById(scheduleId, enterpriseId, {});

      expect(workScheduleRepository.updateById).not.toHaveBeenCalled();
    });

    it('actualiza la franja cuando el rango es válido', async () => {
      const updated = buildWorkSchedule({
        startsAt: new Date('2026-04-13T09:00:00.000Z'),
      });
      workScheduleRepository.findById.mockResolvedValue(buildWorkSchedule());
      workScheduleRepository.updateById.mockResolvedValue(updated);

      await expect(
        service.updateById(scheduleId, enterpriseId, {
          startsAt: '2026-04-13T09:00:00.000Z',
        }),
      ).resolves.toEqual(updated);
    });

    it('propaga el error al crear y al actualizar', async () => {
      workScheduleRepository.create.mockRejectedValue(new Error('fallo crear'));
      await expect(
        service.create(enterpriseId, {
          userEnterpriseId,
          startsAt: '2026-04-13T08:00:00.000Z',
          endsAt: '2026-04-13T16:00:00.000Z',
        }),
      ).rejects.toThrow('fallo crear');

      workScheduleRepository.findById.mockResolvedValue(buildWorkSchedule());
      workScheduleRepository.updateById.mockRejectedValue(new Error('fallo update'));
      await expect(
        service.updateById(scheduleId, enterpriseId, {
          endsAt: '2026-04-13T17:00:00.000Z',
        }),
      ).rejects.toThrow('fallo update');
    });

    it('elimina la franja y propaga el error de borrado', async () => {
      workScheduleRepository.findById.mockResolvedValue(buildWorkSchedule());
      workScheduleRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.deleteById(scheduleId, enterpriseId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });

      workScheduleRepository.deleteById.mockResolvedValue({ raw: [] });
      await expect(service.deleteById(scheduleId, enterpriseId)).resolves.toEqual({
        raw: [],
      });

      workScheduleRepository.deleteById.mockRejectedValue(new Error('fallo delete'));
      await expect(service.deleteById(scheduleId, enterpriseId)).rejects.toThrow('fallo delete');
    });
  });
});
