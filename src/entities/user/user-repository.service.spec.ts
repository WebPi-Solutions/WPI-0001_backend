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
import { CreateUserEnterpriseDto } from './dto/create-user-enterprise.dto';
import { User, UserStatusTypes } from './user.entity';
import { UserEnterprise } from './user-enterprise.entity';
import { UserRepository } from './user-repository.service';

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

/**
 * Construye un QueryBuilder encadenable para las pruebas.
 * @returns Mock de QueryBuilder
 */
function createQueryBuilderMock() {
  return {
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
}

describe('UserRepository', () => {
  let userRepositoryService: UserRepository;
  let userQueryBuilder: ReturnType<typeof createQueryBuilderMock>;
  let userEnterpriseQueryBuilder: ReturnType<typeof createQueryBuilderMock>;
  let userTypeOrmMock: {
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let userEnterpriseTypeOrmMock: {
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
    count: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  /**
   * Crea el módulo de pruebas inyectando los dos repositorios TypeORM.
   */
  beforeEach(async () => {
    jest.clearAllMocks();
    (QueryBuilderService.getCount as jest.Mock).mockResolvedValue(0);
    (QueryBuilderService.getPaginatedResults as jest.Mock).mockResolvedValue({
      items: [],
      total: 0,
      currentPage: 1,
      totalPages: 0,
    });

    userQueryBuilder = createQueryBuilderMock();
    userEnterpriseQueryBuilder = createQueryBuilderMock();

    userTypeOrmMock = {
      save: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(userQueryBuilder),
    };
    userEnterpriseTypeOrmMock = {
      save: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(userEnterpriseQueryBuilder),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        UserRepository,
        {
          provide: getRepositoryToken(User),
          useValue: userTypeOrmMock,
        },
        {
          provide: getRepositoryToken(UserEnterprise),
          useValue: userEnterpriseTypeOrmMock,
        },
      ],
    }).compile();

    userRepositoryService = testingModule.get(UserRepository);
  });

  it('debería estar definido', () => {
    expect(userRepositoryService).toBeDefined();
  });

  describe('create', () => {
    it('persiste el usuario mediante save', async () => {
      const userToCreate = { email: 'user@example.com' } as Partial<User>;
      userTypeOrmMock.save.mockResolvedValue({ id: 'user-uuid', ...userToCreate });

      const result = await userRepositoryService.create(userToCreate);

      expect(userTypeOrmMock.save).toHaveBeenCalledWith(userToCreate);
      expect(result.id).toBe('user-uuid');
    });
  });

  describe('getNextCardIdForEnterprise', () => {
    it('devuelve 1 cuando no hay máximo de card_id', async () => {
      userEnterpriseQueryBuilder.getRawOne.mockResolvedValue(null);

      const result = await userRepositoryService.getNextCardIdForEnterprise('enterprise-uuid');

      expect(userEnterpriseTypeOrmMock.createQueryBuilder).toHaveBeenCalledWith('ue');
      expect(userEnterpriseQueryBuilder.where).toHaveBeenCalledWith(
        'ue.enterpriseId = :enterpriseId',
        { enterpriseId: 'enterprise-uuid' },
      );
      expect(result).toBe(1);
    });

    it('devuelve el máximo más uno cuando existe un card_id', async () => {
      userEnterpriseQueryBuilder.getRawOne.mockResolvedValue({ maxCardId: '5' });

      const result = await userRepositoryService.getNextCardIdForEnterprise('enterprise-uuid');

      expect(result).toBe(6);
    });

    it('usa maxcardid en minúsculas si el alias llega así', async () => {
      userEnterpriseQueryBuilder.getRawOne.mockResolvedValue({ maxcardid: '3' });

      const result = await userRepositoryService.getNextCardIdForEnterprise('enterprise-uuid');

      expect(result).toBe(4);
    });

    it('usa el primer valor del raw si no hay alias conocido', async () => {
      userEnterpriseQueryBuilder.getRawOne.mockResolvedValue({ otro: '8' });

      const result = await userRepositoryService.getNextCardIdForEnterprise('enterprise-uuid');

      expect(result).toBe(9);
    });

    it('fuerza 1 si el máximo no es un número finito', async () => {
      userEnterpriseQueryBuilder.getRawOne.mockResolvedValue({ maxCardId: 'no-numero' });

      const result = await userRepositoryService.getNextCardIdForEnterprise('enterprise-uuid');

      expect(result).toBe(1);
    });
  });

  describe('count', () => {
    it('cuenta usuarios con filtros y relaciones', async () => {
      (QueryBuilderService.getCount as jest.Mock).mockResolvedValue(4);
      const filter = { status: UserStatusTypes.ACTIVE };

      const result = await userRepositoryService.count(filter, ['userEnterprises']);

      expect(QueryBuilderService.getCount).toHaveBeenCalledWith(
        userTypeOrmMock,
        'user',
        filter,
        [
          {
            property: 'userEnterprises',
            alias: 'userEnterprises',
            isLeftJoinAndSelect: false,
          },
        ],
      );
      expect(result).toBe(4);
    });

    it('cuenta usuarios sin filtros ni relaciones', async () => {
      await userRepositoryService.count();

      expect(QueryBuilderService.getCount).toHaveBeenCalledWith(
        userTypeOrmMock,
        'user',
        {},
        undefined,
      );
    });
  });

  describe('getListViewCounts', () => {
    it('devuelve total, activos e inactivos con tres conteos', async () => {
      (QueryBuilderService.getCount as jest.Mock)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(7)
        .mockResolvedValueOnce(3);

      const result = await userRepositoryService.getListViewCounts('enterprise-uuid', {
        name_ilike: 'ana',
      });

      expect(QueryBuilderService.getCount).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ total: 10, active: 7, inactive: 3 });
    });

    it('usa filtro vacío por defecto', async () => {
      await userRepositoryService.getListViewCounts('enterprise-uuid');

      expect(QueryBuilderService.getCount).toHaveBeenCalledTimes(3);
    });
  });

  describe('countActiveNonSigningsUsersForEnterprise', () => {
    it('devuelve 0 si el identificador de empresa está vacío', async () => {
      const result = await userRepositoryService.countActiveNonSigningsUsersForEnterprise('  ');

      expect(result).toBe(0);
      expect(userTypeOrmMock.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('cuenta usuarios activos excluyendo el rol signings', async () => {
      userQueryBuilder.getCount.mockResolvedValue(8);

      const result =
        await userRepositoryService.countActiveNonSigningsUsersForEnterprise('enterprise-uuid');

      expect(userTypeOrmMock.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(userQueryBuilder.innerJoin).toHaveBeenCalledWith(
        'user.userEnterprises',
        'userEnterprise',
        'userEnterprise.enterpriseId = :enterpriseId',
        { enterpriseId: 'enterprise-uuid' },
      );
      expect(userQueryBuilder.where).toHaveBeenCalledWith('user.status = :activeStatus', {
        activeStatus: UserStatusTypes.ACTIVE,
      });
      expect(userQueryBuilder.andWhere).toHaveBeenCalledWith(
        'userEnterprise.role != :signingsRole',
        { signingsRole: 'signings' },
      );
      expect(result).toBe(8);
    });

    it('devuelve 0 si getCount retorna null', async () => {
      userQueryBuilder.getCount.mockResolvedValue(null);

      const result =
        await userRepositoryService.countActiveNonSigningsUsersForEnterprise('enterprise-uuid');

      expect(result).toBe(0);
    });

    it('devuelve 0 si la consulta lanza un error no Error', async () => {
      userQueryBuilder.getCount.mockRejectedValue('fallo textual');

      const result =
        await userRepositoryService.countActiveNonSigningsUsersForEnterprise('enterprise-uuid');

      expect(result).toBe(0);
    });

    it('devuelve 0 si la consulta lanza un error', async () => {
      userQueryBuilder.getCount.mockRejectedValue(new Error('fallo de consulta'));

      const result =
        await userRepositoryService.countActiveNonSigningsUsersForEnterprise('enterprise-uuid');

      expect(result).toBe(0);
    });
  });

  describe('findAll', () => {
    it('lista usuarios paginados usando QueryBuilderService', async () => {
      const result = await userRepositoryService.findAll(
        1,
        10,
        'name',
        'ASC',
        {},
        ['userEnterprises'],
      );

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        userTypeOrmMock,
        'user',
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          relations: [
            {
              property: 'userEnterprises',
              alias: 'userEnterprises',
              isLeftJoinAndSelect: true,
            },
          ],
        }),
      );
      expect(result.total).toBe(0);
    });

    it('lista usuarios con valores por defecto y sin relaciones', async () => {
      await userRepositoryService.findAll();

      expect(QueryBuilderService.getPaginatedResults).toHaveBeenCalledWith(
        userTypeOrmMock,
        'user',
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
    it('busca un usuario por identificador', async () => {
      const foundUser = { id: 'user-uuid' } as User;
      userTypeOrmMock.findOne.mockResolvedValue(foundUser);

      const result = await userRepositoryService.findById('user-uuid', ['userEnterprises']);

      expect(userTypeOrmMock.findOne).toHaveBeenCalledWith({
        where: { id: 'user-uuid' },
        relations: ['userEnterprises'],
      });
      expect(result).toEqual(foundUser);
    });

    it('busca un usuario sin relaciones opcionales', async () => {
      await userRepositoryService.findById('user-uuid');

      expect(userTypeOrmMock.findOne).toHaveBeenCalledWith({
        where: { id: 'user-uuid' },
        relations: undefined,
      });
    });
  });

  describe('findByEmail', () => {
    it('devuelve el usuario cuando existe', async () => {
      const foundUser = { id: 'user-uuid', email: 'user@example.com' } as User;
      userTypeOrmMock.findOne.mockResolvedValue(foundUser);

      const result = await userRepositoryService.findByEmail('user@example.com');

      expect(userTypeOrmMock.findOne).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
        relations: undefined,
      });
      expect(result).toEqual(foundUser);
    });

    it('devuelve null cuando no existe', async () => {
      userTypeOrmMock.findOne.mockResolvedValue(null);

      const result = await userRepositoryService.findByEmail('missing@example.com');

      expect(result).toBeNull();
    });

    it('busca por email incluyendo relaciones', async () => {
      userTypeOrmMock.findOne.mockResolvedValue({ id: 'user-uuid' } as User);

      await userRepositoryService.findByEmail('user@example.com', ['userEnterprises']);

      expect(userTypeOrmMock.findOne).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
        relations: ['userEnterprises'],
      });
    });
  });

  describe('findByEnterpriseCardId', () => {
    it('devuelve null si no hay vínculo con ese card_id', async () => {
      userQueryBuilder.getOne.mockResolvedValue(null);

      const result = await userRepositoryService.findByEnterpriseCardId(
        'enterprise-uuid',
        12,
      );

      expect(userQueryBuilder.innerJoinAndSelect).toHaveBeenCalledWith(
        'user.userEnterprises',
        'ue',
        'ue.enterpriseId = :enterpriseId',
        { enterpriseId: 'enterprise-uuid' },
      );
      expect(userTypeOrmMock.findOne).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('devuelve el usuario del query builder si no se piden relaciones extra', async () => {
      const foundUser = { id: 'user-uuid' } as User;
      userQueryBuilder.getOne.mockResolvedValue(foundUser);

      const result = await userRepositoryService.findByEnterpriseCardId(
        'enterprise-uuid',
        12,
      );

      expect(userTypeOrmMock.findOne).not.toHaveBeenCalled();
      expect(result).toEqual(foundUser);
    });

    it('recarga el usuario con relaciones extra tras encontrarlo', async () => {
      const foundUser = { id: 'user-uuid' } as User;
      const reloadedUser = { id: 'user-uuid', userEnterprises: [] } as User;
      userQueryBuilder.getOne.mockResolvedValue(foundUser);
      userTypeOrmMock.findOne.mockResolvedValue(reloadedUser);

      const result = await userRepositoryService.findByEnterpriseCardId(
        'enterprise-uuid',
        12,
        ['userEnterprises.enterprise'],
      );

      expect(userTypeOrmMock.findOne).toHaveBeenCalledWith({
        where: { id: 'user-uuid' },
        relations: expect.arrayContaining(['userEnterprises', 'userEnterprises.enterprise']),
      });
      expect(result).toEqual(reloadedUser);
    });
  });

  describe('findUserEnterpriseByEnterpriseAndCardId', () => {
    it('busca el vínculo por empresa y card_id', async () => {
      const link = { id: 'link-uuid', cardId: 3 } as UserEnterprise;
      userEnterpriseTypeOrmMock.findOne.mockResolvedValue(link);

      const result = await userRepositoryService.findUserEnterpriseByEnterpriseAndCardId(
        'enterprise-uuid',
        3,
        ['user'],
      );

      expect(userEnterpriseTypeOrmMock.findOne).toHaveBeenCalledWith({
        where: { enterpriseId: 'enterprise-uuid', cardId: 3 },
        relations: ['user'],
      });
      expect(result).toEqual(link);
    });
  });

  describe('updateById', () => {
    it('lanza 404 si el usuario no existe', async () => {
      userTypeOrmMock.findOne.mockResolvedValue(null);

      const thrownError = await expectHttpException(
        userRepositoryService.updateById('missing-id', { name: 'Nuevo' }),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('fusiona y persiste el usuario existente', async () => {
      const existingUser = { id: 'user-uuid', name: 'Antiguo' } as User;
      const payload = { name: 'Nuevo' };
      const reloadedUser = { ...existingUser, ...payload } as User;

      userTypeOrmMock.findOne
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValueOnce(reloadedUser);
      userTypeOrmMock.save.mockResolvedValue(reloadedUser);

      const result = await userRepositoryService.updateById('user-uuid', payload);

      expect(userTypeOrmMock.save).toHaveBeenCalledWith({ ...existingUser, ...payload });
      expect(result).toEqual(reloadedUser);
    });
  });

  describe('countUserEnterprisesByUserId', () => {
    it('cuenta las vinculaciones del usuario', async () => {
      userEnterpriseTypeOrmMock.count.mockResolvedValue(2);

      const result = await userRepositoryService.countUserEnterprisesByUserId('user-uuid');

      expect(userEnterpriseTypeOrmMock.count).toHaveBeenCalledWith({
        where: { userId: 'user-uuid' },
      });
      expect(result).toBe(2);
    });
  });

  describe('removeUserFromEnterprise', () => {
    it('elimina el vínculo usuario–empresa', async () => {
      const deleteResult = { affected: 1, raw: [] };
      userEnterpriseTypeOrmMock.delete.mockResolvedValue(deleteResult);

      const result = await userRepositoryService.removeUserFromEnterprise(
        'user-uuid',
        'enterprise-uuid',
      );

      expect(userEnterpriseTypeOrmMock.delete).toHaveBeenCalledWith({
        userId: 'user-uuid',
        enterpriseId: 'enterprise-uuid',
      });
      expect(result).toEqual(deleteResult);
    });
  });

  describe('deleteById', () => {
    it('elimina primero user_enterprise y después el usuario', async () => {
      const deleteResult = { affected: 1, raw: [] };
      userEnterpriseTypeOrmMock.delete.mockResolvedValue(deleteResult);
      userTypeOrmMock.delete.mockResolvedValue(deleteResult);

      const result = await userRepositoryService.deleteById('user-uuid');

      expect(userEnterpriseTypeOrmMock.delete).toHaveBeenCalledWith({ userId: 'user-uuid' });
      expect(userTypeOrmMock.delete).toHaveBeenCalledWith('user-uuid');
      expect(result).toEqual(deleteResult);
    });
  });

  describe('findUserEnterpriseByUserAndEnterprise', () => {
    it('devuelve el vínculo si existe', async () => {
      const link = { id: 'link-uuid' } as UserEnterprise;
      userEnterpriseTypeOrmMock.findOne.mockResolvedValue(link);

      const result = await userRepositoryService.findUserEnterpriseByUserAndEnterprise(
        'user-uuid',
        'enterprise-uuid',
      );

      expect(userEnterpriseTypeOrmMock.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-uuid', enterpriseId: 'enterprise-uuid' },
      });
      expect(result).toEqual(link);
    });

    it('devuelve null cuando no hay vínculo', async () => {
      userEnterpriseTypeOrmMock.findOne.mockResolvedValue(null);

      const result = await userRepositoryService.findUserEnterpriseByUserAndEnterprise(
        'user-uuid',
        'enterprise-uuid',
      );

      expect(result).toBeNull();
    });
  });

  describe('findUserEnterpriseById', () => {
    it('busca el vínculo por identificador', async () => {
      const link = { id: 'link-uuid' } as UserEnterprise;
      userEnterpriseTypeOrmMock.findOne.mockResolvedValue(link);

      const result = await userRepositoryService.findUserEnterpriseById('link-uuid', ['user']);

      expect(userEnterpriseTypeOrmMock.findOne).toHaveBeenCalledWith({
        where: { id: 'link-uuid' },
        relations: ['user'],
      });
      expect(result).toEqual(link);
    });

    it('busca el vínculo por identificador sin relaciones', async () => {
      await userRepositoryService.findUserEnterpriseById('link-uuid');

      expect(userEnterpriseTypeOrmMock.findOne).toHaveBeenCalledWith({
        where: { id: 'link-uuid' },
        relations: undefined,
      });
    });
  });

  describe('findUserEnterpriseByIdAndEnterprise', () => {
    it('busca el vínculo por identificador y empresa', async () => {
      const link = { id: 'link-uuid' } as UserEnterprise;
      userEnterpriseTypeOrmMock.findOne.mockResolvedValue(link);

      const result = await userRepositoryService.findUserEnterpriseByIdAndEnterprise(
        'link-uuid',
        'enterprise-uuid',
      );

      expect(userEnterpriseTypeOrmMock.findOne).toHaveBeenCalledWith({
        where: { id: 'link-uuid', enterpriseId: 'enterprise-uuid' },
      });
      expect(result).toEqual(link);
    });
  });

  describe('addUserToEnterprise', () => {
    it('persiste el vínculo usuario–empresa', async () => {
      const payload = {
        userId: 'user-uuid',
        enterpriseId: 'enterprise-uuid',
        role: 'admin',
        cardId: 1,
      } as CreateUserEnterpriseDto;
      const savedLink = { id: 'link-uuid', ...payload } as UserEnterprise;
      userEnterpriseTypeOrmMock.save.mockResolvedValue(savedLink);

      const result = await userRepositoryService.addUserToEnterprise(payload);

      expect(userEnterpriseTypeOrmMock.save).toHaveBeenCalledWith(payload);
      expect(result).toEqual(savedLink);
    });

    it('propaga el error si el guardado falla', async () => {
      const payload = {
        userId: 'user-uuid',
        enterpriseId: 'enterprise-uuid',
        role: 'admin',
        cardId: 1,
      } as CreateUserEnterpriseDto;
      userEnterpriseTypeOrmMock.save.mockRejectedValue(new Error('duplicado'));

      await expect(userRepositoryService.addUserToEnterprise(payload)).rejects.toThrow(
        'duplicado',
      );
    });

    it('propaga el error aunque no tenga message', async () => {
      const payload = {
        userId: 'user-uuid',
        enterpriseId: 'enterprise-uuid',
        role: 'admin',
        cardId: 1,
      } as CreateUserEnterpriseDto;
      userEnterpriseTypeOrmMock.save.mockRejectedValue({ code: '23505' });

      await expect(userRepositoryService.addUserToEnterprise(payload)).rejects.toEqual({
        code: '23505',
      });
    });
  });

  describe('updateUserEnterpriseDefaultSchedule', () => {
    it('lanza 404 si no existe el vínculo', async () => {
      userEnterpriseTypeOrmMock.findOne.mockResolvedValue(null);

      const thrownError = await expectHttpException(
        userRepositoryService.updateUserEnterpriseDefaultSchedule(
          'user-uuid',
          'enterprise-uuid',
          'schedule-uuid',
        ),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('desasigna la plantilla cuando el identificador es null', async () => {
      const link = { id: 'link-uuid', defaultSchedule: { id: 'old-uuid' } } as UserEnterprise;
      userEnterpriseTypeOrmMock.findOne.mockResolvedValue(link);
      userEnterpriseTypeOrmMock.save.mockResolvedValue(link);

      await userRepositoryService.updateUserEnterpriseDefaultSchedule(
        'user-uuid',
        'enterprise-uuid',
        null,
      );

      expect(link.defaultSchedule).toBeNull();
      expect(userEnterpriseTypeOrmMock.save).toHaveBeenCalledWith(link);
    });

    it('asigna la plantilla por identificador', async () => {
      const link = { id: 'link-uuid', defaultSchedule: null } as UserEnterprise;
      userEnterpriseTypeOrmMock.findOne.mockResolvedValue(link);
      userEnterpriseTypeOrmMock.save.mockResolvedValue(link);

      await userRepositoryService.updateUserEnterpriseDefaultSchedule(
        'user-uuid',
        'enterprise-uuid',
        'schedule-uuid',
      );

      expect(link.defaultSchedule).toEqual({ id: 'schedule-uuid' });
      expect(userEnterpriseTypeOrmMock.save).toHaveBeenCalledWith(link);
    });
  });

  describe('updateUserEnterpriseRole', () => {
    it('lanza 404 si no existe el vínculo', async () => {
      userEnterpriseTypeOrmMock.findOne.mockResolvedValue(null);

      const thrownError = await expectHttpException(
        userRepositoryService.updateUserEnterpriseRole(
          'user-uuid',
          'enterprise-uuid',
          'admin',
        ),
      );

      expect(thrownError.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('actualiza el rol del vínculo', async () => {
      const link = { id: 'link-uuid', role: 'user' } as UserEnterprise;
      userEnterpriseTypeOrmMock.findOne.mockResolvedValue(link);
      userEnterpriseTypeOrmMock.save.mockResolvedValue(link);

      await userRepositoryService.updateUserEnterpriseRole(
        'user-uuid',
        'enterprise-uuid',
        'admin',
      );

      expect(link.role).toBe('admin');
      expect(userEnterpriseTypeOrmMock.save).toHaveBeenCalledWith(link);
    });
  });
});
