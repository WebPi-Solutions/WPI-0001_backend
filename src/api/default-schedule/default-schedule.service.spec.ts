import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DefaultScheduleRepository } from 'src/entities/default-schedule/default-schedule-repository.service';
import { DefaultSchedule } from 'src/entities/default-schedule/default-schedule.entity';
import { DefaultScheduleService } from './default-schedule.service';
import { CreateDefaultScheduleDto } from './dto/create-default-schedule.dto';

describe('DefaultScheduleService', () => {
  let service: DefaultScheduleService;
  let defaultScheduleRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const scheduleId = 'schedule-uuid';
  const scheduleDefinition = { weekdays: { mon: [{ start: '09:00', end: '17:00' }] } };

  /**
   * Construye una plantilla de horario de prueba.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad DefaultSchedule simulada
   */
  const buildDefaultSchedule = (overrides: Partial<DefaultSchedule> = {}): DefaultSchedule =>
    ({
      id: scheduleId,
      enterpriseId,
      name: 'Jornada oficina',
      description: 'Sede central',
      schedule: scheduleDefinition,
      ...overrides,
    }) as DefaultSchedule;

  beforeEach(async () => {
    defaultScheduleRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        DefaultScheduleService,
        { provide: DefaultScheduleRepository, useValue: defaultScheduleRepository },
      ],
    }).compile();

    service = testingModule.get(DefaultScheduleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('persiste la plantilla asociada a la empresa', async () => {
      const dto: CreateDefaultScheduleDto = {
        name: 'Jornada oficina',
        schedule: scheduleDefinition,
        description: '  Sede central  ',
      };
      defaultScheduleRepository.create.mockImplementation((payload) =>
        Promise.resolve({ ...payload, id: scheduleId }),
      );

      await service.create(enterpriseId, dto);

      expect(defaultScheduleRepository.create).toHaveBeenCalledWith({
        enterpriseId,
        name: 'Jornada oficina',
        schedule: scheduleDefinition,
        description: 'Sede central',
      });
    });

    it('guarda descripción nula cuando llega vacía o solo espacios', async () => {
      defaultScheduleRepository.create.mockImplementation((payload) =>
        Promise.resolve({ ...payload, id: scheduleId }),
      );

      await service.create(enterpriseId, {
        name: 'Jornada oficina',
        schedule: scheduleDefinition,
        description: '   ',
      });

      expect(defaultScheduleRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ description: null }),
      );
    });
  });

  describe('findById', () => {
    it('lanza 404 si la plantilla no existe', async () => {
      defaultScheduleRepository.findById.mockResolvedValue(null);

      await expect(service.findById(scheduleId, enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Plantilla de horario no encontrada',
      });
    });

    it('lanza 404 si la plantilla pertenece a otra empresa', async () => {
      defaultScheduleRepository.findById.mockResolvedValue(
        buildDefaultSchedule({ enterpriseId: 'otra-empresa' }),
      );

      await expect(service.findById(scheduleId, enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Plantilla de horario no encontrada',
      });
    });
  });

  describe('updateById', () => {
    it('no persiste nada si el cuerpo no tiene campos editables', async () => {
      defaultScheduleRepository.findById.mockResolvedValue(buildDefaultSchedule());

      await service.updateById(scheduleId, enterpriseId, {});

      expect(defaultScheduleRepository.updateById).not.toHaveBeenCalled();
      expect(defaultScheduleRepository.findById).toHaveBeenLastCalledWith(scheduleId, ['enterprise']);
    });

    it('normaliza la descripción vacía a nulo al actualizar', async () => {
      defaultScheduleRepository.findById.mockResolvedValue(buildDefaultSchedule());
      defaultScheduleRepository.updateById.mockResolvedValue(
        buildDefaultSchedule({ description: null }),
      );

      await service.updateById(scheduleId, enterpriseId, { description: '   ' });

      expect(defaultScheduleRepository.updateById).toHaveBeenCalledWith(scheduleId, {
        description: null,
      });
    });

    it('no actualiza una plantilla de otra empresa', async () => {
      defaultScheduleRepository.findById.mockResolvedValue(
        buildDefaultSchedule({ enterpriseId: 'otra-empresa' }),
      );

      await expect(
        service.updateById(scheduleId, enterpriseId, { name: 'Nueva' }),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
      expect(defaultScheduleRepository.updateById).not.toHaveBeenCalled();
    });
  });

  describe('deleteById', () => {
    it('elimina tras comprobar la titularidad', async () => {
      defaultScheduleRepository.findById.mockResolvedValue(buildDefaultSchedule());
      defaultScheduleRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.deleteById(scheduleId, enterpriseId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
      expect(defaultScheduleRepository.deleteById).toHaveBeenCalledWith(scheduleId);
    });

    it('registra 0 filas afectadas si el borrado no informa affected', async () => {
      defaultScheduleRepository.findById.mockResolvedValue(buildDefaultSchedule());
      defaultScheduleRepository.deleteById.mockResolvedValue({ raw: [] });

      await expect(service.deleteById(scheduleId, enterpriseId)).resolves.toEqual({
        raw: [],
      });
    });
  });

  describe('create sin descripción, findAll y errores', () => {
    it('crea sin descripción y propaga el error de alta', async () => {
      defaultScheduleRepository.create.mockResolvedValue(buildDefaultSchedule());

      await service.create(enterpriseId, {
        name: 'Jornada',
        schedule: scheduleDefinition,
      });

      expect(defaultScheduleRepository.create).toHaveBeenCalledWith({
        enterpriseId,
        name: 'Jornada',
        schedule: scheduleDefinition,
      });

      defaultScheduleRepository.create.mockRejectedValue(new Error('fallo crear'));
      await expect(
        service.create(enterpriseId, { name: 'Jornada', schedule: scheduleDefinition }),
      ).rejects.toThrow('fallo crear');
    });

    it('lista plantillas y actualiza name/schedule', async () => {
      defaultScheduleRepository.findAll.mockResolvedValue({
        items: [],
        total: 0,
        currentPage: 1,
        totalPages: 0,
      });
      await service.findAll(1, 10, 'name', 'ASC', { enterpriseId });
      expect(defaultScheduleRepository.findAll).toHaveBeenCalledWith(
        1,
        10,
        'name',
        'ASC',
        { enterpriseId },
        undefined,
      );

      defaultScheduleRepository.findById.mockResolvedValue(buildDefaultSchedule());
      defaultScheduleRepository.updateById.mockResolvedValue(buildDefaultSchedule());
      await service.updateById(scheduleId, enterpriseId, {
        name: 'Nueva',
        schedule: scheduleDefinition,
        description: 'texto',
      });
      expect(defaultScheduleRepository.updateById).toHaveBeenCalledWith(scheduleId, {
        name: 'Nueva',
        schedule: scheduleDefinition,
        description: 'texto',
      });
    });

    it('devuelve la plantilla cuando pertenece a la empresa y propaga errores', async () => {
      defaultScheduleRepository.findById.mockResolvedValue(buildDefaultSchedule());
      await expect(service.findById(scheduleId, enterpriseId)).resolves.toEqual(
        buildDefaultSchedule(),
      );

      defaultScheduleRepository.updateById.mockRejectedValue(new Error('fallo update'));
      await expect(
        service.updateById(scheduleId, enterpriseId, { name: 'X' }),
      ).rejects.toThrow('fallo update');

      defaultScheduleRepository.deleteById.mockRejectedValue(new Error('fallo delete'));
      await expect(service.deleteById(scheduleId, enterpriseId)).rejects.toThrow('fallo delete');
    });
  });
});
