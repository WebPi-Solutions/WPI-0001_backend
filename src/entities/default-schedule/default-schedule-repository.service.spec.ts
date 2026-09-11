jest.mock('src/common/helpers/query-builder/query-builder.service', () => ({
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
import { QueryBuilderService } from 'src/common/helpers/query-builder/query-builder.service';
import { DefaultSchedule } from './default-schedule.entity';
import { DefaultScheduleRepository } from './default-schedule-repository.service';

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

describe('DefaultScheduleRepository', () => {
  let defaultScheduleRepositoryService: DefaultScheduleRepository;
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
        DefaultScheduleRepository,
        {
          provide: getRepositoryToken(DefaultSchedule),
          useValue: typeOrmRepositoryMock,
        },
      ],
    }).compile();

    defaultScheduleRepositoryService = testingModule.get(DefaultScheduleRepository);
  });

  it('debería estar definido', () => {
    expect(defaultScheduleRepositoryService).toBeDefined();
  });

  describe('create', () => {
    it('persiste la plantilla de horario', async () => {
      const scheduleToCreate = { name: 'Mañana' } as Partial<DefaultSchedule>;
      typeOrmRepositoryMock.save.mockResolvedValue({
        id: 'schedule-uuid',
        ...scheduleToCreate,
      });

      const result = await defaultScheduleRepositoryService.create(scheduleToCreate);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith(scheduleToCreate);
      expect(result.id).toBe('schedule-uuid');
    });
  });

  describe('findAll', () => {
    it('lista plantillas paginadas usando QueryBuilderService', async () => {
      const result = await defaultScheduleRepositoryService.findAll(
        1,
        10,
        'name',
        'ASC',
        {},
        ['enterprise'],
      );

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'defaultSchedule',
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

    it('lista plantillas con valores por defecto y sin relaciones', async () => {
      await defaultScheduleRepositoryService.findAll();

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'defaultSchedule',
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          sort: 'name',
          order: 'ASC',
          filter: {},
          relations: [],
        }),
      );
    });
  });

  describe('findById', () => {
    it('busca una plantilla por identificador', async () => {
      const foundSchedule = { id: 'schedule-uuid' } as DefaultSchedule;
      typeOrmRepositoryMock.findOne.mockResolvedValue(foundSchedule);

      const result = await defaultScheduleRepositoryService.findById('schedule-uuid');

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'schedule-uuid' },
        relations: undefined,
      });
      expect(result).toEqual(foundSchedule);
    });

    it('busca una plantilla incluyendo relaciones', async () => {
      await defaultScheduleRepositoryService.findById('schedule-uuid', ['enterprise']);

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'schedule-uuid' },
        relations: ['enterprise'],
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si la plantilla no existe', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue(null);

      const thrownError = await expectHttpException(
        defaultScheduleRepositoryService.updateById('missing-id', {}),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('fusiona y recarga la plantilla con empresa', async () => {
      const existingSchedule = { id: 'schedule-uuid', name: 'Antigua' } as DefaultSchedule;
      const payload = { name: 'Nueva' } as Partial<DefaultSchedule>;
      const reloadedSchedule = { ...existingSchedule, ...payload } as DefaultSchedule;

      typeOrmRepositoryMock.findOne
        .mockResolvedValueOnce(existingSchedule)
        .mockResolvedValueOnce(reloadedSchedule);
      typeOrmRepositoryMock.save.mockResolvedValue(reloadedSchedule);

      const result = await defaultScheduleRepositoryService.updateById(
        'schedule-uuid',
        payload,
      );

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith({
        ...existingSchedule,
        ...payload,
      });
      expect(typeOrmRepositoryMock.findOne).toHaveBeenLastCalledWith({
        where: { id: 'schedule-uuid' },
        relations: ['enterprise'],
      });
      expect(result).toEqual(reloadedSchedule);
    });
  });

  describe('deleteById', () => {
    it('elimina la plantilla por identificador', async () => {
      const deleteResult = { affected: 1, raw: [] };
      typeOrmRepositoryMock.delete.mockResolvedValue(deleteResult);

      const result = await defaultScheduleRepositoryService.deleteById('schedule-uuid');

      expect(typeOrmRepositoryMock.delete).toHaveBeenCalledWith('schedule-uuid');
      expect(result).toEqual(deleteResult);
    });
  });
});
