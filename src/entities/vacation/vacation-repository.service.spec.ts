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
import { Vacation } from './vacation.entity';
import { VacationRepository } from './vacation-repository.service';

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

describe('VacationRepository', () => {
  let vacationRepositoryService: VacationRepository;
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
        VacationRepository,
        {
          provide: getRepositoryToken(Vacation),
          useValue: typeOrmRepositoryMock,
        },
      ],
    }).compile();

    vacationRepositoryService = testingModule.get(VacationRepository);
  });

  it('debería estar definido', () => {
    expect(vacationRepositoryService).toBeDefined();
  });

  describe('create', () => {
    it('persiste el registro de vacaciones', async () => {
      const vacationToCreate = { calendarDate: '2026-08-01' } as Partial<Vacation>;
      typeOrmRepositoryMock.save.mockResolvedValue({ id: 'vacation-uuid', ...vacationToCreate });

      const result = await vacationRepositoryService.create(vacationToCreate);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith(vacationToCreate);
      expect(result.id).toBe('vacation-uuid');
    });
  });

  describe('findAll', () => {
    it('lista vacaciones paginadas usando QueryBuilderService', async () => {
      const result = await vacationRepositoryService.findAll(
        1,
        10,
        'calendarDate',
        'ASC',
        {},
        ['userEnterprise'],
      );

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'vacation',
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

    it('lista vacaciones con valores por defecto y sin relaciones', async () => {
      await vacationRepositoryService.findAll();

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        typeOrmRepositoryMock,
        'vacation',
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
    it('busca un registro de vacaciones por identificador', async () => {
      const foundVacation = { id: 'vacation-uuid' } as Vacation;
      typeOrmRepositoryMock.findOne.mockResolvedValue(foundVacation);

      const result = await vacationRepositoryService.findById('vacation-uuid');

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'vacation-uuid' },
        relations: undefined,
      });
      expect(result).toEqual(foundVacation);
    });

    it('busca un registro incluyendo relaciones', async () => {
      await vacationRepositoryService.findById('vacation-uuid', ['userEnterprise']);

      expect(typeOrmRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'vacation-uuid' },
        relations: ['userEnterprise'],
      });
    });
  });

  describe('updateById', () => {
    it('lanza 404 si el registro no existe', async () => {
      typeOrmRepositoryMock.findOne.mockResolvedValue(null);

      const thrownError = await expectHttpException(
        vacationRepositoryService.updateById('missing-id', {}),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('fusiona y recarga el registro con relaciones', async () => {
      const existingVacation = { id: 'vacation-uuid' } as Vacation;
      const payload = { name: 'Permiso' } as Partial<Vacation>;
      const reloadedVacation = { ...existingVacation, ...payload } as Vacation;

      typeOrmRepositoryMock.findOne
        .mockResolvedValueOnce(existingVacation)
        .mockResolvedValueOnce(reloadedVacation);
      typeOrmRepositoryMock.save.mockResolvedValue(reloadedVacation);

      const result = await vacationRepositoryService.updateById('vacation-uuid', payload);

      expect(typeOrmRepositoryMock.save).toHaveBeenCalledWith({
        ...existingVacation,
        ...payload,
      });
      expect(typeOrmRepositoryMock.findOne).toHaveBeenLastCalledWith({
        where: { id: 'vacation-uuid' },
        relations: ['userEnterprise', 'userEnterprise.user', 'userEnterprise.enterprise'],
      });
      expect(result).toEqual(reloadedVacation);
    });
  });

  describe('deleteById', () => {
    it('elimina el registro por identificador', async () => {
      const deleteResult = { affected: 1, raw: [] };
      typeOrmRepositoryMock.delete.mockResolvedValue(deleteResult);

      const result = await vacationRepositoryService.deleteById('vacation-uuid');

      expect(typeOrmRepositoryMock.delete).toHaveBeenCalledWith('vacation-uuid');
      expect(result).toEqual(deleteResult);
    });
  });
});
