jest.mock('src/helpers/query-builder/query-builder.service', () => ({
  QueryBuilderService: {
    getCount: jest.fn().mockResolvedValue(0),
    getPaginatedResults: jest.fn().mockResolvedValue({
      items: [],
      total: 0,
      currentPage: 1,
      totalPages: 0,
    }),
  },
}));

import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryBuilderService } from 'src/helpers/query-builder/query-builder.service';
import { Holiday } from './holiday.entity';
import { HolidayRepository } from './holiday-repository.service';

/**
 * Extrae la HttpException lanzada por una promesa rechazada.
 * @param rejectedPromise - Promesa que debe fallar
 * @returns La excepción HTTP capturada
 */
async function expectHttpException(
  rejectedPromise: Promise<unknown>,
): Promise<HttpException> {
  try {
    await rejectedPromise;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HttpException);
    return error as HttpException;
  }
  throw new Error('Se esperaba una HttpException');
}

describe('HolidayRepository', () => {
  let holidayRepositoryService: HolidayRepository;
  let typeOrmRepositoryMock: {
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
  };

  /**
   * Crea el módulo de pruebas con repositorio TypeORM simulado.
   */
  beforeEach(async () => {
    jest.clearAllMocks();
    (QueryBuilderService.getPaginatedResults as jest.Mock).mockResolvedValue({
      items: [],
      total: 0,
      currentPage: 1,
      totalPages: 0,
    });

    typeOrmRepositoryMock = {
      save: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        HolidayRepository,
        {
          provide: getRepositoryToken(Holiday),
          useValue: typeOrmRepositoryMock,
        },
      ],
    }).compile();

    holidayRepositoryService = testingModule.get(HolidayRepository);
  });

  it('debería estar definido', () => {
    expect(holidayRepositoryService).toBeDefined();
  });

  describe('create', () => {
    it('persiste el festivo', async () => {
      const holidayToCreate = { name: 'Fiesta' } as Partial<Holiday>;
      typeOrmRepositoryMock.save.mockResolvedValue({ id: 'holiday-uuid', ...holidayToCreate });

      const result = await holidayRepositoryService.create(holidayToCreate);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith(holidayToCreate);
      expect(result.id).toBe('holiday-uuid');
    });
  });

  describe('findAll', () => {
    it('lista festivos paginados usando QueryBuilderService', async () => {
      const result = await holidayRepositoryService.findAll(
        1,
        10,
        'calendarDate',
        'ASC',
        {},
        ['enterprise'],
      );

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'holiday',
        expect.objectContaining({
          relations: [
            {
              property: 'enterprise',
              alias: 'enterprise',
              isLeftJoinAndSelect: true,
            },
          ],
        }),
      );
      expect(result.total).toBe(0);
    });

    it('lista festivos con valores por defecto y sin relaciones', async () => {
      await holidayRepositoryService.findAll();

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'holiday',
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          sort: 'calendarDate',
          order: 'ASC',
          filter: {},
          relations: [],
        }),
      );
    });
  });

  describe('findById', () => {
    it('busca un festivo por identificador', async () => {
      const foundHoliday = { id: 'holiday-uuid' } as Holiday;
      typeOrmRepositoryMock.findOne.mockResolvedValue(foundHoliday);

      const result = await holidayRepositoryService.findById('holiday-uuid');

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'holiday-uuid' },
        relations: undefined,
      });
      expect(result).toEqual(foundHoliday);
    });

    it('busca un festivo incluyendo relaciones', async () => {
      await holidayRepositoryService.findById('holiday-uuid', ['enterprise']);

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'holiday-uuid' },
        relations: ['enterprise'],
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si el festivo no existe', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue(null);

      const thrownError = await expectHttpException(
        holidayRepositoryService.updateById('missing-id', {}),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('fusiona y recarga el festivo con empresa', async () => {
      const existingHoliday = { id: 'holiday-uuid', name: 'Antiguo' } as Holiday;
      const payload = { name: 'Nuevo' } as Partial<Holiday>;
      const reloadedHoliday = { ...existingHoliday, ...payload } as Holiday;

      typeOrmRepositoryMock.findOne
        .mockResolvedValueOnce(existingHoliday)
        .mockResolvedValueOnce(reloadedHoliday);
      typeOrmRepositoryMock.save.mockResolvedValue(reloadedHoliday);

      const result = await holidayRepositoryService.updateById('holiday-uuid', payload);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith({
        ...existingHoliday,
        ...payload,
      });
      expect(typeOrmRepositoryMock.findOne).toHaveBeenLastCalledWith({
        where: { id: 'holiday-uuid' },
        relations: ['enterprise'],
      });
      expect(result).toEqual(reloadedHoliday);
    });
  });

  describe('deleteById', () => {
    it('elimina el festivo por identificador', async () => {
      const deleteResult = { affected: 1, raw: [] };
      typeOrmRepositoryMock.delete.mockResolvedValue(deleteResult);

      const result = await holidayRepositoryService.deleteById('holiday-uuid');

      expect(typeOrmRepositoryMock.delete).toHaveBeenCalledWith('holiday-uuid');
      expect(result).toEqual(deleteResult);
    });
  });
});
