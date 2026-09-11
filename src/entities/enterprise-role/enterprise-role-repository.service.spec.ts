import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EnterpriseRole } from './enterprise-role.entity';
import { EnterpriseRoleRepository } from './enterprise-role-repository.service';

/**
 * Extrae la HttpException lanzada por una promesa rechazada.
 *
 * @param rejectedPromise - Promesa que debe fallar
 * @returns La excepción HTTP capturada
 */
async function expectHttpException(
  rejectedPromise: Promise<unknown>,
): Promise<{ getStatus: () => number }> {
  try {
    await rejectedPromise;
  } catch (error: unknown) {
    return error as { getStatus: () => number };
  }
  throw new Error('Se esperaba una HttpException');
}

/**
 * Pruebas del repositorio de roles de empresa.
 */
describe('EnterpriseRoleRepository', () => {
  let repositoryService: EnterpriseRoleRepository;
  let typeOrmRepository: {
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let queryBuilder: {
    leftJoin: jest.Mock;
    select: jest.Mock;
    addSelect: jest.Mock;
    where: jest.Mock;
    groupBy: jest.Mock;
    getRawMany: jest.Mock;
  };

  const roleId = 'role-uuid';
  const enterpriseId = 'enterprise-uuid';
  const existingRole = {
    id: roleId,
    enterpriseId,
    role: 'empleado',
    permissions: {},
    userCount: 0,
  } as EnterpriseRole;

  /**
   * Construye el mock encadenable del query builder de recuento.
   *
   * @returns Query builder stub
   */
  function buildCountQueryBuilder(): typeof queryBuilder {
    const chainedQueryBuilder = {
      leftJoin: jest.fn(),
      select: jest.fn(),
      addSelect: jest.fn(),
      where: jest.fn(),
      groupBy: jest.fn(),
      getRawMany: jest.fn().mockResolvedValue([{ roleId, userCount: '3' }]),
    };
    chainedQueryBuilder.leftJoin.mockReturnValue(chainedQueryBuilder);
    chainedQueryBuilder.select.mockReturnValue(chainedQueryBuilder);
    chainedQueryBuilder.addSelect.mockReturnValue(chainedQueryBuilder);
    chainedQueryBuilder.where.mockReturnValue(chainedQueryBuilder);
    chainedQueryBuilder.groupBy.mockReturnValue(chainedQueryBuilder);
    return chainedQueryBuilder;
  }

  beforeEach(async () => {
    queryBuilder = buildCountQueryBuilder();
    typeOrmRepository = {
      save: jest.fn().mockImplementation(() => Promise.resolve({ ...existingRole })),
      find: jest.fn().mockImplementation(() => Promise.resolve([{ ...existingRole }])),
      findOne: jest.fn().mockImplementation(() => Promise.resolve({ ...existingRole })),
      delete: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        EnterpriseRoleRepository,
        { provide: getRepositoryToken(EnterpriseRole), useValue: typeOrmRepository },
      ],
    }).compile();

    repositoryService = testingModule.get(EnterpriseRoleRepository);
  });

  it('should be defined', () => {
    expect(repositoryService).toBeDefined();
  });

  it('persiste un rol', async () => {
    await expect(repositoryService.create({ role: 'empleado' })).resolves.toEqual(existingRole);
    expect(typeOrmRepository.save).toHaveBeenCalled();
  });

  it('asigna userCount 0 si save no lo trae', async () => {
    typeOrmRepository.save.mockResolvedValueOnce({
      id: roleId,
      enterpriseId,
      role: 'empleado',
      permissions: {},
    });

    await expect(repositoryService.create({ role: 'empleado' })).resolves.toEqual(
      expect.objectContaining({ userCount: 0 }),
    );
  });

  it('trata un recuento no numérico como 0', async () => {
    queryBuilder.getRawMany.mockResolvedValueOnce([{ roleId, userCount: '' }]);

    await expect(repositoryService.findByEnterpriseId(enterpriseId)).resolves.toEqual([
      { ...existingRole, userCount: 0 },
    ]);
  });

  it('devuelve lista vacía sin consultar recuentos', async () => {
    typeOrmRepository.find.mockResolvedValueOnce([]);

    await expect(repositoryService.findByEnterpriseId(enterpriseId)).resolves.toEqual([]);
    expect(typeOrmRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('pone userCount a 0 si el recuento no trae la fila del rol', async () => {
    queryBuilder.getRawMany.mockResolvedValueOnce([]);

    await expect(repositoryService.findByEnterpriseId(enterpriseId)).resolves.toEqual([
      { ...existingRole, userCount: 0 },
    ]);
  });

  it('lista los roles de una empresa con el recuento de usuarios', async () => {
    await expect(repositoryService.findByEnterpriseId(enterpriseId)).resolves.toEqual([
      { ...existingRole, userCount: 3 },
    ]);
    expect(typeOrmRepository.find).toHaveBeenCalledWith({
      where: { enterpriseId },
      order: { role: 'ASC' },
    });
    expect(typeOrmRepository.createQueryBuilder).toHaveBeenCalledWith('enterpriseRole');
  });

  it('busca por id con recuento y por empresa+nombre', async () => {
    await expect(repositoryService.findById(roleId)).resolves.toEqual({
      ...existingRole,
      userCount: 3,
    });
    await expect(
      repositoryService.findByEnterpriseIdAndRoleName(enterpriseId, 'empleado'),
    ).resolves.toEqual(existingRole);
    expect(typeOrmRepository.findOne).toHaveBeenCalledWith({
      where: { enterpriseId, role: 'empleado' },
    });
  });

  it('actualiza un rol existente', async () => {
    await expect(
      repositoryService.updateById(roleId, { role: 'Contable' }),
    ).resolves.toEqual({ ...existingRole, userCount: 3 });
    expect(typeOrmRepository.save).toHaveBeenCalled();
  });

  it('lanza 404 al actualizar o borrar un rol inexistente', async () => {
    typeOrmRepository.findOne.mockResolvedValue(null);

    const updateError = await expectHttpException(
      repositoryService.updateById(roleId, { role: 'X' }),
    );
    expect(updateError.getStatus()).toBe(HttpStatus.NOT_FOUND);

    const deleteError = await expectHttpException(repositoryService.deleteById(roleId));
    expect(deleteError.getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it('elimina un rol existente', async () => {
    await expect(repositoryService.deleteById(roleId)).resolves.toEqual({
      affected: 1,
      raw: [],
    });
  });
});
