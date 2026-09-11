import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { DefaultScheduleRepository } from 'src/entities/default-schedule/default-schedule-repository.service';
import { CreateUserDto } from 'src/entities/user/dto/create-user.dto';
import { UserRepository } from 'src/entities/user/user-repository.service';
import { UserEnterprise } from 'src/entities/user/user-enterprise.entity';
import { User, UserStatusTypes } from 'src/entities/user/user.entity';
import { FirebaseService } from 'src/services/firebase/firebase.service';
import { EnterpriseRoleService } from 'src/api/enterprise-role/enterprise-role.service';
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;
  let userRepository: {
    updateById: jest.Mock;
    updateUserEnterpriseRole: jest.Mock;
    updateUserEnterpriseDefaultSchedule: jest.Mock;
    findById: jest.Mock;
    findByEmail: jest.Mock;
    findByEnterpriseCardId: jest.Mock;
    findAll: jest.Mock;
    findUserEnterpriseByUserAndEnterprise: jest.Mock;
    getNextCardIdForEnterprise: jest.Mock;
    addUserToEnterprise: jest.Mock;
    countUserEnterprisesByUserId: jest.Mock;
    removeUserFromEnterprise: jest.Mock;
    deleteById: jest.Mock;
    create: jest.Mock;
  };
  let enterpriseAccessService: {
    assertUserBelongsToEnterprise: jest.Mock;
    assertUserEnterpriseLinkExists: jest.Mock;
    assertCurrentUserRecordAccessible: jest.Mock;
    getCurrentAccessContextOrThrow: jest.Mock;
    assertCanAccessEnterprise: jest.Mock;
    assertCurrentUserResourcePermission: jest.Mock;
    mergeRelationNames: jest.Mock;
  };
  let firebaseService: {
    verifyUserExistsByEmail: jest.Mock;
    createUser: jest.Mock;
    deleteUser: jest.Mock;
  };
  let defaultScheduleRepository: {
    findById: jest.Mock;
  };
  let enterpriseRoleService: {
    getOrCreateEmployeeRole: jest.Mock;
    assertRoleBelongsToEnterprise: jest.Mock;
  };

  const userId = 'user-uuid';
  const enterpriseId = 'enterprise-uuid';
  const scheduleId = 'schedule-uuid';
  const employeeRoleId = 'employee-role-uuid';
  const managerRoleId = 'manager-role-uuid';
  const updatedUser = { id: userId, name: 'Ana', email: 'ana@example.com' } as User;
  const existingUser = {
    id: userId,
    name: 'Ana',
    email: 'ana@example.com',
    userEnterprises: [],
  } as User;
  const createdUser = {
    id: 'new-user-uuid',
    name: 'Luis',
    email: 'luis@example.com',
  } as User;

  /**
   * Construye un DTO de creación de usuario con una única empresa.
   * @param overrides - Campos a sobrescribir
   * @returns DTO de creación listo para el servicio
   */
  const buildCreateUserDto = (overrides: Partial<CreateUserDto> = {}): CreateUserDto =>
    ({
      name: 'Luis',
      email: 'luis@example.com',
      phone: '666666666',
      password: 'secret-password',
      userEnterprises: [
        {
          enterpriseId,
        },
      ],
      ...overrides,
    }) as CreateUserDto;

  beforeEach(async () => {
    userRepository = {
      updateById: jest.fn().mockResolvedValue(updatedUser),
      updateUserEnterpriseRole: jest.fn().mockResolvedValue(undefined),
      updateUserEnterpriseDefaultSchedule: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(existingUser),
      findByEmail: jest.fn(),
      findByEnterpriseCardId: jest.fn(),
      findAll: jest.fn(),
      findUserEnterpriseByUserAndEnterprise: jest.fn(),
      getNextCardIdForEnterprise: jest.fn().mockResolvedValue(7),
      addUserToEnterprise: jest.fn(),
      countUserEnterprisesByUserId: jest.fn(),
      removeUserFromEnterprise: jest.fn(),
      deleteById: jest.fn(),
      create: jest.fn(),
    };
    enterpriseAccessService = {
      assertUserBelongsToEnterprise: jest.fn().mockResolvedValue(undefined),
      assertUserEnterpriseLinkExists: jest.fn().mockResolvedValue(undefined),
      assertCurrentUserRecordAccessible: jest.fn(),
      getCurrentAccessContextOrThrow: jest.fn().mockReturnValue({
        userId,
        isGlobalAdmin: false,
        allowedEnterpriseIds: [enterpriseId],
      }),
      assertCanAccessEnterprise: jest.fn(),
      assertCurrentUserResourcePermission: jest.fn(),
      mergeRelationNames: jest.fn((relations?: string[], required: string[] = []) =>
        [...new Set([...(relations ?? []), ...required])],
      ),
    };
    enterpriseRoleService = {
      getOrCreateEmployeeRole: jest.fn().mockResolvedValue({ id: employeeRoleId }),
      assertRoleBelongsToEnterprise: jest.fn().mockResolvedValue({ id: managerRoleId }),
    };
    firebaseService = {
      verifyUserExistsByEmail: jest.fn().mockResolvedValue(false),
      createUser: jest.fn().mockResolvedValue({ uid: 'firebase-uid' }),
      deleteUser: jest.fn().mockResolvedValue(undefined),
    };
    defaultScheduleRepository = {
      findById: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: UserRepository, useValue: userRepository },
        { provide: FirebaseService, useValue: firebaseService },
        { provide: EnterpriseAccessService, useValue: enterpriseAccessService },
        { provide: DefaultScheduleRepository, useValue: defaultScheduleRepository },
        { provide: EnterpriseRoleService, useValue: enterpriseRoleService },
      ],
    }).compile();

    service = testingModule.get(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('exige exactamente una empresa en la vinculación', async () => {
      await expect(service.create(buildCreateUserDto({ userEnterprises: [] }))).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El usuario debe estar vinculado a una única empresa.',
      });
      await expect(
        service.create(buildCreateUserDto({ userEnterprises: undefined })),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      await expect(
        service.create(
          buildCreateUserDto({
            userEnterprises: [
              { enterpriseId },
              { enterpriseId: 'otra' },
            ] as CreateUserDto['userEnterprises'],
          }),
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('exige un identificador de empresa resoluble', async () => {
      await expect(
        service.create(
          buildCreateUserDto({
            userEnterprises: [{}] as CreateUserDto['userEnterprises'],
          }),
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Debe especificar la empresa a la que vincular el usuario.',
      });
    });

    it('rechaza vincular a una empresa a la que el caller no tiene acceso', async () => {
      enterpriseAccessService.assertCanAccessEnterprise.mockImplementation(() => {
        const forbidden = new Error('No tiene acceso a la empresa indicada.') as Error & {
          status: number;
        };
        forbidden.status = HttpStatus.FORBIDDEN;
        throw forbidden;
      });

      await expect(service.create(buildCreateUserDto())).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
      });
      expect(userRepository.create).not.toHaveBeenCalled();
    });

    it('rechaza una plantilla de horario ajena o inexistente', async () => {
      defaultScheduleRepository.findById.mockResolvedValue(null);

      await expect(
        service.create(buildCreateUserDto({ defaultScheduleId: scheduleId })),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'La plantilla de horario no existe o no pertenece a esta empresa.',
      });

      defaultScheduleRepository.findById.mockResolvedValue({
        id: scheduleId,
        enterpriseId: 'otra-empresa',
      });

      await expect(
        service.create(buildCreateUserDto({ defaultScheduleId: scheduleId })),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('es idempotente si el usuario ya está vinculado y no envía horario', async () => {
      userRepository.findByEmail.mockResolvedValue(existingUser);
      userRepository.findUserEnterpriseByUserAndEnterprise.mockResolvedValue({ id: 'link-1' });
      userRepository.findById.mockResolvedValue(existingUser);

      await expect(service.create(buildCreateUserDto())).resolves.toEqual(existingUser);
      expect(userRepository.updateUserEnterpriseDefaultSchedule).not.toHaveBeenCalled();
      expect(userRepository.addUserToEnterprise).not.toHaveBeenCalled();
      expect(userRepository.findById).toHaveBeenCalledWith(userId, [
        'userEnterprises',
        'userEnterprises.enterprise',
        'userEnterprises.defaultSchedule',
      ]);
    });

    it('actualiza el horario del vínculo existente cuando se envía defaultScheduleId', async () => {
      userRepository.findByEmail.mockResolvedValue(existingUser);
      userRepository.findUserEnterpriseByUserAndEnterprise.mockResolvedValue({ id: 'link-1' });
      userRepository.findById.mockResolvedValue(existingUser);
      defaultScheduleRepository.findById.mockResolvedValue({
        id: scheduleId,
        enterpriseId,
      });

      await service.create(buildCreateUserDto({ defaultScheduleId: scheduleId }));

      expect(userRepository.updateUserEnterpriseDefaultSchedule).toHaveBeenCalledWith(
        userId,
        enterpriseId,
        scheduleId,
      );
    });

    it('vincula un usuario existente a una empresa nueva con card_id correlativo', async () => {
      const reloadedUser = { ...existingUser, name: 'Ana recargada' } as User;
      userRepository.findByEmail.mockResolvedValue(existingUser);
      userRepository.findUserEnterpriseByUserAndEnterprise.mockResolvedValue(null);
      userRepository.addUserToEnterprise.mockResolvedValue({ id: 'link-nuevo' });
      userRepository.findById.mockResolvedValue(reloadedUser);
      defaultScheduleRepository.findById.mockResolvedValue({
        id: scheduleId,
        enterpriseId,
      });

      const result = await service.create(
        buildCreateUserDto({
          defaultScheduleId: scheduleId,
          userEnterprises: [
            {
              enterprise: { id: enterpriseId },
              enterpriseRoleId: managerRoleId,
            },
          ] as CreateUserDto['userEnterprises'],
        }),
      );

      expect(result).toEqual(reloadedUser);
      expect(userRepository.getNextCardIdForEnterprise).toHaveBeenCalledWith(enterpriseId);
      expect(userRepository.addUserToEnterprise).toHaveBeenCalledWith({
        userId,
        enterpriseId,
        enterpriseRoleId: managerRoleId,
        cardId: 7,
        defaultScheduleId: scheduleId,
      });
      expect(enterpriseRoleService.assertRoleBelongsToEnterprise).toHaveBeenCalledWith(
        managerRoleId,
        enterpriseId,
      );
    });

    it('exige contraseña al crear un usuario nuevo', async () => {
      userRepository.findByEmail.mockResolvedValue(null);

      await expect(service.create(buildCreateUserDto({ password: '   ' }))).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'La contraseña es obligatoria para crear un nuevo usuario.',
      });
      await expect(service.create(buildCreateUserDto({ password: undefined }))).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('rechaza el alta si el email ya existe en Firebase', async () => {
      userRepository.findByEmail.mockResolvedValue(null);
      firebaseService.verifyUserExistsByEmail.mockResolvedValue(true);

      await expect(service.create(buildCreateUserDto())).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        message: 'Ya existe un usuario en Firebase con el email: luis@example.com',
      });
      expect(userRepository.create).not.toHaveBeenCalled();
    });

    it('crea el usuario en BD, lo vincula y lo registra en Firebase', async () => {
      userRepository.findByEmail.mockResolvedValue(null);
      userRepository.create.mockResolvedValue(createdUser);
      userRepository.addUserToEnterprise.mockResolvedValue({ id: 'link-nuevo' });

      const result = await service.create(
        buildCreateUserDto({
          status: UserStatusTypes.PENDING,
          defaultScheduleId: null,
        }),
      );

      expect(result).toEqual(createdUser);
      expect(userRepository.create).toHaveBeenCalledWith({
        name: 'Luis',
        email: 'luis@example.com',
        phone: '666666666',
        status: UserStatusTypes.PENDING,
      });
      expect(userRepository.addUserToEnterprise).toHaveBeenCalledWith({
        userId: createdUser.id,
        enterpriseId,
        enterpriseRoleId: employeeRoleId,
        cardId: 7,
        defaultScheduleId: null,
      });
      expect(enterpriseRoleService.getOrCreateEmployeeRole).toHaveBeenCalledWith(enterpriseId);
      expect(firebaseService.createUser).toHaveBeenCalledWith('luis@example.com', 'secret-password');
    });

    it('usa estado ACTIVE y omite plantilla cuando no se envían', async () => {
      userRepository.findByEmail.mockResolvedValue(null);
      userRepository.create.mockResolvedValue(createdUser);
      userRepository.addUserToEnterprise.mockResolvedValue({ id: 'link-nuevo' });
      firebaseService.createUser.mockResolvedValue(null);

      const createPayload = buildCreateUserDto();
      delete createPayload.status;
      delete createPayload.defaultScheduleId;

      await service.create(createPayload);

      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: UserStatusTypes.ACTIVE }),
      );
      expect(userRepository.addUserToEnterprise).toHaveBeenCalledWith(
        expect.objectContaining({ defaultScheduleId: null }),
      );
      expect(defaultScheduleRepository.findById).not.toHaveBeenCalled();
    });

    it('trata cadena vacía de horario como desasignación explícita', async () => {
      userRepository.findByEmail.mockResolvedValue(null);
      userRepository.create.mockResolvedValue(createdUser);
      userRepository.addUserToEnterprise.mockResolvedValue({ id: 'link-nuevo' });

      await service.create(buildCreateUserDto({ defaultScheduleId: '' }));

      expect(defaultScheduleRepository.findById).not.toHaveBeenCalled();
      expect(userRepository.addUserToEnterprise).toHaveBeenCalledWith(
        expect.objectContaining({ defaultScheduleId: null }),
      );
    });

    it('hace rollback de BD si falla Firebase y relanza el error', async () => {
      userRepository.findByEmail.mockResolvedValue(null);
      userRepository.create.mockResolvedValue(createdUser);
      userRepository.addUserToEnterprise.mockResolvedValue({ id: 'link-nuevo' });
      userRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });
      firebaseService.createUser.mockRejectedValue(new Error('firebase caído'));

      await expect(service.create(buildCreateUserDto())).rejects.toThrow('firebase caído');
      expect(userRepository.deleteById).toHaveBeenCalledWith(createdUser.id);
    });

    it('registra el fallo de rollback y relanza el error original', async () => {
      userRepository.findByEmail.mockResolvedValue(null);
      userRepository.create.mockResolvedValue(createdUser);
      userRepository.addUserToEnterprise.mockResolvedValue({ id: 'link-nuevo' });
      userRepository.deleteById.mockRejectedValue(new Error('rollback fallido'));
      firebaseService.createUser.mockRejectedValue(new Error('firebase caído'));

      await expect(service.create(buildCreateUserDto())).rejects.toThrow('firebase caído');
      expect(userRepository.deleteById).toHaveBeenCalledWith(createdUser.id);
    });
  });

  describe('findAll', () => {
    it('delega el listado paginado al repositorio', async () => {
      const paginated = { items: [updatedUser], total: 1, currentPage: 1, totalPages: 1 };
      userRepository.findAll.mockResolvedValue(paginated);
      const filter = { 'userEnterprises.enterpriseId': enterpriseId };

      await expect(
        service.findAll(1, 10, 'name', 'ASC', filter, ['userEnterprises']),
      ).resolves.toEqual(paginated);
      expect(userRepository.findAll).toHaveBeenCalledWith(
        1,
        10,
        'name',
        'ASC',
        filter,
        ['userEnterprises'],
      );
    });
  });

  describe('findById', () => {
    it('devuelve el usuario con las relaciones pedidas', async () => {
      userRepository.findById.mockResolvedValue(updatedUser);

      await expect(service.findById(userId, ['userEnterprises'])).resolves.toEqual(updatedUser);
      expect(userRepository.findById).toHaveBeenCalledWith(userId, ['userEnterprises']);
    });

    it('consulta sin relaciones cuando no se informan', async () => {
      userRepository.findById.mockResolvedValue(updatedUser);

      await expect(service.findById(userId)).resolves.toEqual(updatedUser);
      expect(userRepository.findById).toHaveBeenCalledWith(userId, ['userEnterprises']);
    });

    it('lanza 404 si el usuario no existe', async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(service.findById(userId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Usuario no encontrado',
      });
    });

    it('devuelve al compañero sin recortar si no trae vínculos', async () => {
      const colleagueWithoutLinks = {
        id: 'colleague-uuid',
        name: 'Compañero',
        email: 'companero@example.com',
        userEnterprises: [],
      } as User;
      userRepository.findById.mockResolvedValue(colleagueWithoutLinks);

      await expect(service.findById('colleague-uuid')).resolves.toEqual(colleagueWithoutLinks);
    });

    it('resuelve el tenant del compañero desde la empresa anidada', async () => {
      const colleagueUser = {
        id: 'colleague-uuid',
        name: 'Compañero',
        email: 'companero@example.com',
        userEnterprises: [{ enterprise: { id: enterpriseId } }],
      } as User;
      userRepository.findById.mockResolvedValue(colleagueUser);

      await expect(service.findById('colleague-uuid')).resolves.toEqual(colleagueUser);
    });

    it('oculta vínculos de otras empresas al consultar a un compañero', async () => {
      const colleagueUser = {
        id: 'colleague-uuid',
        name: 'Compañero',
        email: 'companero@example.com',
        userEnterprises: [
          { enterpriseId },
          { enterpriseId: 'empresa-y' },
        ],
      } as User;
      userRepository.findById.mockResolvedValue(colleagueUser);

      await expect(service.findById('colleague-uuid')).resolves.toEqual({
        ...colleagueUser,
        userEnterprises: [{ enterpriseId }],
      });
    });

    it('exige users.read con bypass del propio perfil', async () => {
      userRepository.findById.mockResolvedValue(updatedUser);

      await service.findById(userId);

      expect(enterpriseAccessService.assertCurrentUserResourcePermission).toHaveBeenCalledWith(
        updatedUser,
        'users',
        'read',
        { allowSelfBypass: true },
      );
    });
  });

  describe('findByEmail', () => {
    it('devuelve el usuario cuando existe', async () => {
      userRepository.findByEmail.mockResolvedValue(updatedUser);

      await expect(service.findByEmail('ana@example.com', ['userEnterprises'])).resolves.toEqual(
        updatedUser,
      );
      expect(userRepository.findByEmail).toHaveBeenCalledWith('ana@example.com', ['userEnterprises']);
    });

    it('devuelve null si no hay usuario y omite relaciones', async () => {
      userRepository.findByEmail.mockResolvedValue(null);

      await expect(service.findByEmail('nadie@example.com')).resolves.toBeNull();
    });
  });

  describe('updateById — rol en user_enterprise', () => {
    it('actualiza el rol del vínculo y no lo persiste como relación del usuario', async () => {
      await service.updateById(
        userId,
        {
          name: 'Ana',
          userEnterprises: [{ enterpriseRoleId: `  ${managerRoleId}  ` }],
        } as unknown as User,
        enterpriseId,
      );

      expect(enterpriseAccessService.assertUserBelongsToEnterprise).toHaveBeenCalledWith(
        userId,
        enterpriseId,
        expect.objectContaining({ operationContext: 'user.update' }),
      );
      expect(enterpriseRoleService.assertRoleBelongsToEnterprise).toHaveBeenCalledWith(
        managerRoleId,
        enterpriseId,
      );
      expect(userRepository.updateUserEnterpriseRole).toHaveBeenCalledWith(
        userId,
        enterpriseId,
        managerRoleId,
      );
      const patch = userRepository.updateById.mock.calls[0][1] as Record<string, unknown>;
      expect(patch.userEnterprises).toBeUndefined();
      expect(patch.name).toBe('Ana');
    });

    it('exige enterpriseId cuando se envía un rol', async () => {
      await expect(
        service.updateById(userId, {
          userEnterprises: [{ enterpriseRoleId: managerRoleId }],
        } as unknown as User),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message:
          'Se requiere el parámetro enterpriseId en la URL para modificar el rol del usuario en la empresa.',
      });
      expect(userRepository.updateUserEnterpriseRole).not.toHaveBeenCalled();
    });

    it('no actualiza el rol si llega vacío o en blanco', async () => {
      await service.updateById(
        userId,
        {
          name: 'Ana',
          userEnterprises: [{ enterpriseRoleId: '   ' }],
        } as unknown as User,
        enterpriseId,
      );

      expect(userRepository.updateUserEnterpriseRole).not.toHaveBeenCalled();
      expect(userRepository.updateById).toHaveBeenCalled();
    });

    it('no actualiza el rol si no es una cadena', async () => {
      await service.updateById(
        userId,
        {
          userEnterprises: [{ enterpriseRoleId: null }],
        } as unknown as User,
        enterpriseId,
      );

      expect(userRepository.updateUserEnterpriseRole).not.toHaveBeenCalled();
    });

    it('exige users.write sobre el objetivo sin bypass del propio perfil', async () => {
      await service.updateById(userId, { name: 'Ana' } as User, enterpriseId);

      expect(enterpriseAccessService.assertCurrentUserResourcePermission).toHaveBeenCalledWith(
        existingUser,
        'users',
        'write',
      );
      const permissionCall =
        enterpriseAccessService.assertCurrentUserResourcePermission.mock.calls[0];
      expect(permissionCall[3]).toBeUndefined();
    });
  });

  describe('updateById — horario y errores', () => {
    it('lanza 404 si el usuario no existe', async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(service.updateById(userId, { name: 'Ana' } as User)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Usuario no encontrado',
      });
    });

    it('actualiza el usuario sin comprobar empresa si no hay enterpriseId', async () => {
      await service.updateById(userId, { name: 'Ana' } as User);

      expect(enterpriseAccessService.assertUserBelongsToEnterprise).not.toHaveBeenCalled();
      expect(userRepository.updateById).toHaveBeenCalledWith(userId, { name: 'Ana' });
    });

    it('ignora users.role si el caller no es administrador global', async () => {
      await service.updateById(userId, {
        name: 'Ana',
        role: 'administrator',
      } as User);

      const patch = userRepository.updateById.mock.calls[0][1] as Record<string, unknown>;
      expect(patch.role).toBeUndefined();
      expect(patch.name).toBe('Ana');
    });

    it('permite a un administrador global persistir users.role', async () => {
      enterpriseAccessService.getCurrentAccessContextOrThrow.mockReturnValue({
        userId,
        isGlobalAdmin: true,
        allowedEnterpriseIds: [enterpriseId],
      });

      await service.updateById(userId, {
        name: 'Ana',
        role: 'administrator',
      } as User);

      expect(userRepository.updateById).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ name: 'Ana', role: 'administrator' }),
      );
    });

    it('exige enterpriseId para cambiar el horario por defecto', async () => {
      await expect(
        service.updateById(userId, { defaultScheduleId: scheduleId } as unknown as User),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message:
          'Se requiere el parámetro enterpriseId en la URL para modificar el horario por defecto del usuario.',
      });
    });

    it('desasigna el horario cuando llega null o cadena vacía', async () => {
      await service.updateById(
        userId,
        { defaultScheduleId: null } as unknown as User,
        enterpriseId,
      );
      await service.updateById(
        userId,
        { defaultScheduleId: '' } as unknown as User,
        enterpriseId,
      );
      await service.updateById(
        userId,
        { defaultScheduleId: undefined } as unknown as User,
        enterpriseId,
      );

      expect(userRepository.updateUserEnterpriseDefaultSchedule).toHaveBeenNthCalledWith(
        1,
        userId,
        enterpriseId,
        null,
      );
      expect(userRepository.updateUserEnterpriseDefaultSchedule).toHaveBeenNthCalledWith(
        2,
        userId,
        enterpriseId,
        null,
      );
      expect(userRepository.updateUserEnterpriseDefaultSchedule).toHaveBeenNthCalledWith(
        3,
        userId,
        enterpriseId,
        null,
      );
      expect(defaultScheduleRepository.findById).not.toHaveBeenCalled();
    });

    it('valida y asigna una plantilla de la empresa', async () => {
      defaultScheduleRepository.findById.mockResolvedValue({
        id: scheduleId,
        enterpriseId,
      });

      await service.updateById(
        userId,
        { defaultScheduleId: scheduleId } as unknown as User,
        enterpriseId,
      );

      expect(userRepository.updateUserEnterpriseDefaultSchedule).toHaveBeenCalledWith(
        userId,
        enterpriseId,
        scheduleId,
      );
    });

    it('relanza el error del repositorio', async () => {
      userRepository.updateById.mockRejectedValue(new Error('fallo de persistencia'));

      await expect(service.updateById(userId, { name: 'Ana' } as User)).rejects.toThrow(
        'fallo de persistencia',
      );
    });
  });

  describe('findByEnterpriseCardId', () => {
    it('exige enterpriseId, también cuando llega vacío', async () => {
      await expect(service.findByEnterpriseCardId('  ', 12)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Debe especificar la empresa para buscar por tarjeta.',
      });
      await expect(service.findByEnterpriseCardId('', 12)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      expect(userRepository.findByEnterpriseCardId).not.toHaveBeenCalled();
    });

    it('rechaza un card_id no positivo', async () => {
      await expect(service.findByEnterpriseCardId(enterpriseId, 0)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El identificador de tarjeta debe ser un número positivo.',
      });
      await expect(service.findByEnterpriseCardId(enterpriseId, Number.NaN)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      expect(userRepository.findByEnterpriseCardId).not.toHaveBeenCalled();
    });

    it('lanza 404 genérico si no hay usuario para esa tarjeta en la empresa', async () => {
      userRepository.findByEnterpriseCardId.mockResolvedValue(null);

      await expect(service.findByEnterpriseCardId(enterpriseId, 42)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Usuario no encontrado',
      });
      expect(userRepository.findByEnterpriseCardId).toHaveBeenCalledWith(enterpriseId, 42, undefined);
    });

    it('devuelve el usuario cuando el card_id existe en la empresa', async () => {
      userRepository.findByEnterpriseCardId.mockResolvedValue(updatedUser);

      await expect(
        service.findByEnterpriseCardId(enterpriseId, 42, ['userEnterprises']),
      ).resolves.toEqual(updatedUser);
      expect(userRepository.findByEnterpriseCardId).toHaveBeenCalledWith(
        enterpriseId,
        42,
        ['userEnterprises'],
      );
    });

    it('usa etiqueta vacía de relaciones cuando el array llega vacío', async () => {
      userRepository.findByEnterpriseCardId.mockResolvedValue(updatedUser);

      await expect(service.findByEnterpriseCardId(enterpriseId, 42, [])).resolves.toEqual(
        updatedUser,
      );
    });

    it('relanza errores inesperados del repositorio', async () => {
      userRepository.findByEnterpriseCardId.mockRejectedValue(new Error('timeout de consulta'));

      await expect(service.findByEnterpriseCardId(enterpriseId, 42)).rejects.toThrow(
        'timeout de consulta',
      );
    });

    it('registra un error que no es instancia de Error y lo relanza', async () => {
      userRepository.findByEnterpriseCardId.mockRejectedValue('fallo-sin-stack');

      await expect(service.findByEnterpriseCardId(enterpriseId, 42)).rejects.toBe('fallo-sin-stack');
    });
  });

  describe('unlinkUserFromEnterprise', () => {
    it('lanza 404 si el usuario no existe', async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(service.unlinkUserFromEnterprise(userId, enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Usuario no encontrado',
      });
    });

    it('solo elimina el vínculo cuando el usuario tiene más empresas', async () => {
      userRepository.findById.mockResolvedValue(existingUser);
      userRepository.countUserEnterprisesByUserId.mockResolvedValue(2);
      userRepository.removeUserFromEnterprise.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.unlinkUserFromEnterprise(userId, enterpriseId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
      expect(enterpriseAccessService.assertUserEnterpriseLinkExists).toHaveBeenCalledWith(
        userId,
        enterpriseId,
        { operationContext: 'user.unlink-from-enterprise' },
      );
      expect(userRepository.removeUserFromEnterprise).toHaveBeenCalledWith(userId, enterpriseId);
      expect(firebaseService.deleteUser).not.toHaveBeenCalled();
    });

    it('elimina por completo al usuario de su última empresa y de Firebase', async () => {
      userRepository.findById.mockResolvedValue(existingUser);
      userRepository.countUserEnterprisesByUserId.mockResolvedValue(1);
      firebaseService.verifyUserExistsByEmail.mockResolvedValue(true);
      userRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.unlinkUserFromEnterprise(userId, enterpriseId)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
      expect(firebaseService.deleteUser).toHaveBeenCalledWith(existingUser.email);
      expect(userRepository.deleteById).toHaveBeenCalledWith(userId);
    });

    it('omite Firebase si el usuario ya no existe allí', async () => {
      userRepository.findById.mockResolvedValue(existingUser);
      userRepository.countUserEnterprisesByUserId.mockResolvedValue(1);
      firebaseService.verifyUserExistsByEmail.mockResolvedValue(false);
      userRepository.deleteById.mockResolvedValue({ affected: 1, raw: [] });

      await service.unlinkUserFromEnterprise(userId, enterpriseId);

      expect(firebaseService.deleteUser).not.toHaveBeenCalled();
      expect(userRepository.deleteById).toHaveBeenCalledWith(userId);
    });

    it('lanza 404 si desaparece el usuario al eliminar por completo', async () => {
      userRepository.findById
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValueOnce(null);
      userRepository.countUserEnterprisesByUserId.mockResolvedValue(1);

      await expect(service.unlinkUserFromEnterprise(userId, enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Usuario no encontrado',
      });
    });

    it('relanza el error si falla el borrado completo', async () => {
      userRepository.findById.mockResolvedValue(existingUser);
      userRepository.countUserEnterprisesByUserId.mockResolvedValue(1);
      firebaseService.verifyUserExistsByEmail.mockResolvedValue(true);
      firebaseService.deleteUser.mockRejectedValue(new Error('firebase delete'));

      await expect(service.unlinkUserFromEnterprise(userId, enterpriseId)).rejects.toThrow(
        'firebase delete',
      );
    });
  });

  describe('addUserToEnterprise', () => {
    it('vincula resolviendo IDs directos y asigna el siguiente card_id', async () => {
      const createdLink = {
        id: 'link-1',
        userId,
        enterpriseId,
        enterpriseRoleId: employeeRoleId,
        cardId: 7,
      };
      userRepository.addUserToEnterprise.mockResolvedValue(createdLink);

      await expect(
        service.addUserToEnterprise({
          userId,
          enterpriseId,
        } as UserEnterprise),
      ).resolves.toEqual(createdLink);
      expect(userRepository.getNextCardIdForEnterprise).toHaveBeenCalledWith(enterpriseId);
      expect(userRepository.addUserToEnterprise).toHaveBeenCalledWith({
        userId,
        enterpriseId,
        enterpriseRoleId: employeeRoleId,
        cardId: 7,
      });
    });

    it('resuelve IDs anidados en user y enterprise', async () => {
      userRepository.addUserToEnterprise.mockResolvedValue({ id: 'link-2' });

      await service.addUserToEnterprise({
        user: { id: userId },
        enterprise: { id: enterpriseId },
        enterpriseRoleId: managerRoleId,
      } as UserEnterprise);

      expect(userRepository.addUserToEnterprise).toHaveBeenCalledWith({
        userId,
        enterpriseId,
        enterpriseRoleId: managerRoleId,
        cardId: 7,
      });
    });

    it('rechaza la vinculación si faltan userId o enterpriseId', async () => {
      await expect(service.addUserToEnterprise({} as UserEnterprise)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Se requieren userId y enterpriseId para vincular el usuario a la empresa.',
      });
      await expect(
        service.addUserToEnterprise({ userId } as UserEnterprise),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('relanza el error del repositorio al crear el vínculo', async () => {
      userRepository.addUserToEnterprise.mockRejectedValue(new Error('duplicado'));

      await expect(
        service.addUserToEnterprise({
          userId,
          enterpriseId,
        } as UserEnterprise),
      ).rejects.toThrow('duplicado');
    });
  });
});
