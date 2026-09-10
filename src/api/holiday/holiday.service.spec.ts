import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HolidayRepository } from 'src/entities/holiday/holiday-repository.service';
import { Holiday } from 'src/entities/holiday/holiday.entity';
import { HolidayService } from './holiday.service';
import { CreateHolidayDto } from './dto/create-holiday.dto';

describe('HolidayService', () => {
  let service: HolidayService;
  let holidayRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const holidayId = 'holiday-uuid';

  /**
   * Construye un festivo de prueba con valores deterministas.
   * @param overrides - Campos a sobrescribir
   * @returns Entidad Holiday simulada
   */
  const buildHoliday = (overrides: Partial<Holiday> = {}): Holiday =>
    ({
      id: holidayId,
      enterpriseId,
      name: 'Festivo',
      calendarDate: '2026-12-25',
      calendarColor: '#00A76F',
      ...overrides,
    }) as Holiday;

  beforeEach(async () => {
    holidayRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        HolidayService,
        { provide: HolidayRepository, useValue: holidayRepository },
      ],
    }).compile();

    service = testingModule.get(HolidayService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('aplica nombre y color por defecto cuando no se informan', async () => {
      const dto: CreateHolidayDto = { calendarDate: '2026-12-25' };
      holidayRepository.create.mockImplementation((payload) =>
        Promise.resolve({ ...payload, id: holidayId }),
      );

      await service.create(enterpriseId, dto);

      expect(holidayRepository.create).toHaveBeenCalledWith({
        enterpriseId,
        name: 'Festivo',
        calendarDate: '2026-12-25',
        calendarColor: '#00A76F',
      });
    });
  });

  describe('findById', () => {
    it('devuelve el festivo cuando pertenece a la empresa', async () => {
      holidayRepository.findById.mockResolvedValue(buildHoliday());

      await expect(service.findById(holidayId, enterpriseId)).resolves.toEqual(buildHoliday());
      expect(holidayRepository.findById).toHaveBeenCalledWith(holidayId, undefined);
    });

    it('lanza 404 si el festivo no existe', async () => {
      holidayRepository.findById.mockResolvedValue(null);

      await expect(service.findById(holidayId, enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Festivo no encontrado',
      });
    });

    it('lanza 404 si el festivo pertenece a otra empresa', async () => {
      holidayRepository.findById.mockResolvedValue(buildHoliday({ enterpriseId: 'otra-empresa' }));

      await expect(service.findById(holidayId, enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Festivo no encontrado',
      });
    });
  });

  describe('updateById', () => {
    it('no persiste nada y reconsulta si no hay campos editables', async () => {
      holidayRepository.findById.mockResolvedValue(buildHoliday());

      await expect(service.updateById(holidayId, enterpriseId, {})).resolves.toEqual(buildHoliday());
      expect(holidayRepository.updateById).not.toHaveBeenCalled();
      expect(holidayRepository.findById).toHaveBeenLastCalledWith(holidayId, ['enterprise']);
    });

    it('actualiza solo los campos permitidos de la empresa', async () => {
      const updated = buildHoliday({ name: 'Navidad', calendarColor: '#FF5630' });
      holidayRepository.findById.mockResolvedValue(buildHoliday());
      holidayRepository.updateById.mockResolvedValue(updated);

      await expect(
        service.updateById(holidayId, enterpriseId, {
          name: 'Navidad',
          calendarColor: '#FF5630',
        }),
      ).resolves.toEqual(updated);
      expect(holidayRepository.updateById).toHaveBeenCalledWith(holidayId, {
        name: 'Navidad',
        calendarColor: '#FF5630',
      });
    });

    it('no actualiza si el festivo no pertenece a la empresa', async () => {
      holidayRepository.findById.mockResolvedValue(buildHoliday({ enterpriseId: 'otra-empresa' }));

      await expect(
        service.updateById(holidayId, enterpriseId, { name: 'Navidad' }),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
      expect(holidayRepository.updateById).not.toHaveBeenCalled();
    });
  });

  describe('deleteById', () => {
    it('elimina tras comprobar la titularidad de la empresa', async () => {
      holidayRepository.findById.mockResolvedValue(buildHoliday());
      holidayRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.deleteById(holidayId, enterpriseId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
      expect(holidayRepository.deleteById).toHaveBeenCalledWith(holidayId);
    });

    it('registra 0 filas afectadas si el borrado no informa affected', async () => {
      holidayRepository.findById.mockResolvedValue(buildHoliday());
      holidayRepository.deleteById.mockResolvedValue({ raw: [] });

      await expect(service.deleteById(holidayId, enterpriseId)).resolves.toEqual({
        raw: [],
      });
    });

    it('no elimina un festivo de otra empresa', async () => {
      holidayRepository.findById.mockResolvedValue(buildHoliday({ enterpriseId: 'otra-empresa' }));

      await expect(service.deleteById(holidayId, enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
      expect(holidayRepository.deleteById).not.toHaveBeenCalled();
    });
  });

  describe('create error, findAll, update y delete errores', () => {
    it('propaga el error al crear', async () => {
      holidayRepository.create.mockRejectedValue(new Error('fallo crear'));

      await expect(
        service.create(enterpriseId, { calendarDate: '2026-12-25', name: 'Navidad' }),
      ).rejects.toThrow('fallo crear');
    });

    it('lista festivos delegando relaciones opcionales', async () => {
      holidayRepository.findAll.mockResolvedValue({
        items: [],
        total: 0,
        currentPage: 1,
        totalPages: 0,
      });

      await service.findAll(1, 10, 'calendarDate', 'ASC', { enterpriseId });

      expect(holidayRepository.findAll).toHaveBeenCalledWith(
        1,
        10,
        'calendarDate',
        'ASC',
        { enterpriseId },
        undefined,
      );
    });

    it('actualiza calendarDate y propaga el error de persistencia', async () => {
      holidayRepository.findById.mockResolvedValue(buildHoliday());
      holidayRepository.updateById.mockRejectedValue(new Error('fallo update'));

      await expect(
        service.updateById(holidayId, enterpriseId, { calendarDate: '2026-12-26' }),
      ).rejects.toThrow('fallo update');
    });

    it('propaga el error al eliminar', async () => {
      holidayRepository.findById.mockResolvedValue(buildHoliday());
      holidayRepository.deleteById.mockRejectedValue(new Error('fallo delete'));

      await expect(service.deleteById(holidayId, enterpriseId)).rejects.toThrow('fallo delete');
    });
  });
});
