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
import { WorkSchedule } from './work-schedule.entity';
import { WorkScheduleRepository } from './work-schedule-repository.service';

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

describe('WorkScheduleRepository', () => {
  let workScheduleRepositoryService: WorkScheduleRepository;
  let queryBuilder: {
    where: jest.Mock;
    andWhere: jest.Mock;
    leftJoin: jest.Mock;
    innerJoin: jest.Mock;
    innerJoinAndSelect: jest.Mock;
    select: jest.Mock;
    distinct: jest.Mock;
    getMany: jest.Mock;
    getOne: jest.Mock;
    getCount: jest.Mock;
    getRawOne: jest.Mock;
  };
  let typeOrmRepositoryMock: {
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
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

    queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
      getOne: jest.fn(),
      getCount: jest.fn(),
      getRawOne: jest.fn(),
    };

    typeOrmRepositoryMock = {
      save: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        WorkScheduleRepository,
        {
          provide: getRepositoryToken(WorkSchedule),
          useValue: typeOrmRepositoryMock,
        },
      ],
    }).compile();

    workScheduleRepositoryService = testingModule.get(WorkScheduleRepository);
  });

  it('debería estar definido', () => {
    expect(workScheduleRepositoryService).toBeDefined();
  });

  describe('create', () => {
    it('persiste la franja de horario', async () => {
      const scheduleToCreate = { userEnterpriseId: 'link-uuid' } as Partial<WorkSchedule>;
      typeOrmRepositoryMock.save.mockResolvedValue({
        id: 'work-schedule-uuid',
        ...scheduleToCreate,
      });

      const result = await workScheduleRepositoryService.create(scheduleToCreate);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith(scheduleToCreate);
      expect(result.id).toBe('work-schedule-uuid');
    });
  });

  describe('findAll', () => {
    it('lista franjas paginadas usando QueryBuilderService', async () => {
      const result = await workScheduleRepositoryService.findAll(
        1,
        10,
        'startsAt',
        'DESC',
        {},
        ['userEnterprise'],
      );

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'workSchedule',
        expect.objectContaining({
          relations: [
            {
              property: 'userEnterprise',
              alias: 'userEnterprise',
              isLeftJoinAndSelect: true,
            },
          ],
        }),
      );
      expect(result.total).toBe(0);
    });

    it('lista franjas con valores por defecto y sin relaciones', async () => {
      await workScheduleRepositoryService.findAll();

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'workSchedule',
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          sort: 'startsAt',
          order: 'DESC',
          filter: {},
          relations: [],
        }),
      );
    });
  });

  describe('findById', () => {
    it('busca una franja por identificador', async () => {
      const foundSchedule = { id: 'work-schedule-uuid' } as WorkSchedule;
      typeOrmRepositoryMock.findOne.mockResolvedValue(foundSchedule);

      const result = await workScheduleRepositoryService.findById('work-schedule-uuid');

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'work-schedule-uuid' },
        relations: undefined,
      });
      expect(result).toEqual(foundSchedule);
    });

    it('busca una franja incluyendo relaciones', async () => {
      await workScheduleRepositoryService.findById('work-schedule-uuid', ['userEnterprise']);

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'work-schedule-uuid' },
        relations: ['userEnterprise'],
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si la franja no existe', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue(null);

      const thrownError = await expectHttpException(
        workScheduleRepositoryService.updateById('missing-id', {}),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('fusiona y recarga la franja con relaciones', async () => {
      const existingSchedule = { id: 'work-schedule-uuid' } as WorkSchedule;
      const payload = { startsAt: new Date('2026-09-10T09:00:00.000Z') } as Partial<WorkSchedule>;
      const reloadedSchedule = { ...existingSchedule, ...payload } as WorkSchedule;

      typeOrmRepositoryMock.findOne
        .mockResolvedValueOnce(existingSchedule)
        .mockResolvedValueOnce(reloadedSchedule);
      typeOrmRepositoryMock.save.mockResolvedValue(reloadedSchedule);

      const result = await workScheduleRepositoryService.updateById(
        'work-schedule-uuid',
        payload,
      );

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith({
        ...existingSchedule,
        ...payload,
      });
      expect(typeOrmRepositoryMock.findOne).toHaveBeenLastCalledWith({
        where: { id: 'work-schedule-uuid' },
        relations: ['userEnterprise', 'userEnterprise.user', 'userEnterprise.enterprise'],
      });
      expect(result).toEqual(reloadedSchedule);
    });
  });

  describe('deleteById', () => {
    it('elimina la franja por identificador', async () => {
      const deleteResult = { affected: 1, raw: [] };
      typeOrmRepositoryMock.delete.mockResolvedValue(deleteResult);

      const result = await workScheduleRepositoryService.deleteById('work-schedule-uuid');

      expect(typeOrmRepositoryMock.delete).toHaveBeenCalledWith('work-schedule-uuid');
      expect(result).toEqual(deleteResult);
    });
  });

  describe('existsOverlapForUserEnterprise', () => {
    it('devuelve true cuando existe otra franja solapada', async () => {
      queryBuilder.getOne.mockResolvedValue({ id: 'other-uuid' });
      const startsAt = new Date('2026-09-10T08:00:00.000Z');
      const endsAt = new Date('2026-09-10T16:00:00.000Z');

      const result = await workScheduleRepositoryService.existsOverlapForUserEnterprise(
        'link-uuid',
        startsAt,
        endsAt,
      );

      expect(typeOrmRepositoryMock.createQueryBuilder).toHaveBeenCalledWith('schedule');
      expect(queryBuilder.where).toHaveBeenCalledWith(
        'schedule.userEnterpriseId = :userEnterpriseId',
        { userEnterpriseId: 'link-uuid' },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('schedule.startsAt < :endsAt', {
        endsAt,
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('schedule.endsAt > :startsAt', {
        startsAt,
      });
      expect(result).toBe(true);
    });

    it('excluye el identificador indicado en actualizaciones', async () => {
      queryBuilder.getOne.mockResolvedValue(null);

      const result = await workScheduleRepositoryService.existsOverlapForUserEnterprise(
        'link-uuid',
        new Date('2026-09-10T08:00:00.000Z'),
        new Date('2026-09-10T16:00:00.000Z'),
        'work-schedule-uuid',
      );

      expect(queryBuilder.andWhere).toHaveBeenCalledWith('schedule.id <> :excludeId', {
        excludeId: 'work-schedule-uuid',
      });
      expect(result).toBe(false);
    });

    it('no excluye id si excludeId está vacío o solo espacios', async () => {
      queryBuilder.getOne.mockResolvedValue(null);

      await workScheduleRepositoryService.existsOverlapForUserEnterprise(
        'link-uuid',
        new Date('2026-09-10T08:00:00.000Z'),
        new Date('2026-09-10T16:00:00.000Z'),
        '   ',
      );

      expect(queryBuilder.andWhere).not.toHaveBeenCalledWith(
        'schedule.id <> :excludeId',
        expect.anything(),
      );
    });
  });
});
