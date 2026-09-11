import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { User, UserRoleTypes } from 'src/entities/user/user.entity';
import { UserRepository } from 'src/entities/user/user-repository.service';
import { AccessContext } from './access-context';
import {
  EnterpriseAccessService,
  buildMissingEnterprisePermissionMessage,
} from './enterprise-access.service';
import { runWithEnterpriseAccessContext } from './enterprise-access.storage';

describe('EnterpriseAccessService', () => {
  let service: EnterpriseAccessService;
  let userRepository: {
    findUserEnterpriseByUserAndEnterprise: jest.Mock;
    findUserEnterpriseByIdAndEnterprise: jest.Mock;
  };

  const userId = 'user-uuid';
  const enterpriseId = 'enterprise-uuid';
  const userEnterpriseId = 'user-enterprise-uuid';
  const existingLink = {
    id: userEnterpriseId,
    userId,
    enterpriseId,
  };

  beforeEach(async () => {
    userRepository = {
      findUserEnterpriseByUserAndEnterprise: jest.fn(),
      findUserEnterpriseByIdAndEnterprise: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        EnterpriseAccessService,
        { provide: UserRepository, useValue: userRepository },
      ],
    }).compile();

    service = testingModule.get(EnterpriseAccessService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('assertUserBelongsToEnterprise', () => {
    it('no lanza error cuando el usuario está vinculado a la empresa', async () => {
      userRepository.findUserEnterpriseByUserAndEnterprise.mockResolvedValue(existingLink);

      await expect(
        service.assertUserBelongsToEnterprise(userId, enterpriseId, {
          operationContext: 'user.update',
          notFoundMessage: 'Usuario no encontrado en esta empresa.',
        }),
      ).resolves.toBeUndefined();
    });

    it('lanza 404 con el mensaje indicado cuando no existe el vínculo', async () => {
      userRepository.findUserEnterpriseByUserAndEnterprise.mockResolvedValue(null);

      await expect(
        service.assertUserBelongsToEnterprise(userId, enterpriseId, {
          operationContext: 'signing',
          notFoundMessage: 'Fichaje no encontrado',
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Fichaje no encontrado',
      });
    });

    it('lanza 404 sin contexto de operación cuando no se informa', async () => {
      userRepository.findUserEnterpriseByUserAndEnterprise.mockResolvedValue(null);

      await expect(
        service.assertUserBelongsToEnterprise(userId, enterpriseId, {
          notFoundMessage: 'Usuario no encontrado en esta empresa.',
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });
  });

  describe('assertUserEnterpriseLinkExists', () => {
    it('lanza 400 por defecto si se exige un vínculo que no existe', async () => {
      userRepository.findUserEnterpriseByUserAndEnterprise.mockResolvedValue(null);

      await expect(
        service.assertUserEnterpriseLinkExists(userId, enterpriseId, {
          operationContext: 'user.unlink',
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El usuario no está vinculado a esta empresa',
      });
    });

    it('usa el mensaje personalizado de solicitud incorrecta cuando se informa', async () => {
      userRepository.findUserEnterpriseByUserAndEnterprise.mockResolvedValue(null);

      await expect(
        service.assertUserEnterpriseLinkExists(userId, enterpriseId, {
          badRequestMessage: 'No hay vínculo que deshacer',
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'No hay vínculo que deshacer',
      });
    });

    it('resuelve cuando el vínculo sí existe', async () => {
      userRepository.findUserEnterpriseByUserAndEnterprise.mockResolvedValue(existingLink);

      await expect(
        service.assertUserEnterpriseLinkExists(userId, enterpriseId),
      ).resolves.toBeUndefined();
    });

    it('lanza 400 sin opciones cuando el vínculo no existe', async () => {
      userRepository.findUserEnterpriseByUserAndEnterprise.mockResolvedValue(null);

      await expect(
        service.assertUserEnterpriseLinkExists(userId, enterpriseId),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El usuario no está vinculado a esta empresa',
      });
    });
  });

  describe('assertUserEnterpriseBelongsToEnterprise', () => {
    it('devuelve el vínculo cuando pertenece a la empresa', async () => {
      userRepository.findUserEnterpriseByIdAndEnterprise.mockResolvedValue(existingLink);

      await expect(
        service.assertUserEnterpriseBelongsToEnterprise(userEnterpriseId, enterpriseId, {
          operationContext: 'work-schedule',
          notFoundMessage: 'Franja de horario no encontrada',
        }),
      ).resolves.toEqual({
        id: userEnterpriseId,
        userId,
        enterpriseId,
      });
    });

    it('lanza 404 cuando el vínculo no pertenece a la empresa', async () => {
      userRepository.findUserEnterpriseByIdAndEnterprise.mockResolvedValue(null);

      await expect(
        service.assertUserEnterpriseBelongsToEnterprise(userEnterpriseId, enterpriseId, {
          notFoundMessage: 'Franja de horario no encontrada',
        }),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('incluye el contexto de operación en el aviso si el vínculo no existe', async () => {
      userRepository.findUserEnterpriseByIdAndEnterprise.mockResolvedValue(null);

      await expect(
        service.assertUserEnterpriseBelongsToEnterprise(userEnterpriseId, enterpriseId, {
          operationContext: 'vacation.delete',
          notFoundMessage: 'Registro de vacaciones no encontrado',
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        message: 'Registro de vacaciones no encontrado',
      });
    });
  });

  describe('buildAccessContext', () => {
    it('incluye las empresas únicas del usuario y marca administrador global', () => {
      const adminUser = {
        id: userId,
        role: UserRoleTypes.ADMIN,
        userEnterprises: [
          { enterpriseId },
          { enterpriseId },
          { enterpriseId: 'otra-empresa' },
        ],
      } as User;

      expect(service.buildAccessContext(adminUser)).toEqual({
        userId,
        isGlobalAdmin: true,
        allowedEnterpriseIds: [enterpriseId, 'otra-empresa'],
        permissionsByEnterpriseId: {
          [enterpriseId]: {},
          'otra-empresa': {},
        },
      });
    });

    it('devuelve un set vacío si no hay vínculos y no es administrador', () => {
      const regularUser = {
        id: userId,
        role: UserRoleTypes.USER,
      } as User;

      expect(service.buildAccessContext(regularUser)).toEqual({
        userId,
        isGlobalAdmin: false,
        allowedEnterpriseIds: [],
        permissionsByEnterpriseId: {},
      });
    });

    it('ignora vínculos sin identificador de empresa', () => {
      const regularUser = {
        id: userId,
        role: UserRoleTypes.USER,
        userEnterprises: [{}],
      } as User;

      expect(service.buildAccessContext(regularUser)).toEqual({
        userId,
        isGlobalAdmin: false,
        allowedEnterpriseIds: [],
        permissionsByEnterpriseId: {},
      });
    });

    it('copia los permisos del rol de empresa en el mapa por tenant', () => {
      const regularUser = {
        id: userId,
        role: UserRoleTypes.USER,
        userEnterprises: [
          {
            enterpriseId,
            enterpriseRole: { permissions: { invoices: { read: true } } },
          },
        ],
      } as User;

      expect(service.buildAccessContext(regularUser).permissionsByEnterpriseId).toEqual({
        [enterpriseId]: { invoices: { read: true } },
      });
    });

    it('si hay dos vínculos de la misma empresa, el último rol pisa el mapa', () => {
      const regularUser = {
        id: userId,
        role: UserRoleTypes.USER,
        userEnterprises: [
          {
            enterpriseId,
            enterpriseRole: { permissions: { invoices: { read: true } } },
          },
          {
            enterpriseId,
            enterpriseRole: { permissions: { clients: { write: true } } },
          },
        ],
      } as User;

      expect(service.buildAccessContext(regularUser).permissionsByEnterpriseId).toEqual({
        [enterpriseId]: { clients: { write: true } },
      });
    });

    it('resuelve el id de empresa desde la relación anidada si falta enterpriseId', () => {
      const regularUser = {
        id: userId,
        role: UserRoleTypes.USER,
        userEnterprises: [{ enterprise: { id: enterpriseId } }],
      } as User;

      expect(service.buildAccessContext(regularUser)).toEqual({
        userId,
        isGlobalAdmin: false,
        allowedEnterpriseIds: [enterpriseId],
        permissionsByEnterpriseId: {
          [enterpriseId]: {},
        },
      });
    });
  });

  describe('getCurrentAccessContextOrThrow', () => {
    it('lanza 403 si el interceptor no estableció el contexto', () => {
      expect(() => service.getCurrentAccessContextOrThrow()).toThrow(ForbiddenException);
    });

    it('devuelve el contexto almacenado en la petición actual', () => {
      const accessContext: AccessContext = {
        userId,
        isGlobalAdmin: false,
        allowedEnterpriseIds: [enterpriseId],
      };

      runWithEnterpriseAccessContext(accessContext, () => {
        expect(service.getCurrentAccessContextOrThrow()).toEqual(accessContext);
      });
    });
  });

  describe('assertCanAccessEnterprise', () => {
    const regularAccessContext: AccessContext = {
      userId,
      isGlobalAdmin: false,
      allowedEnterpriseIds: [enterpriseId],
    };

    it('permite el acceso cuando la empresa está en el set del usuario', () => {
      expect(() =>
        service.assertCanAccessEnterprise(regularAccessContext, enterpriseId),
      ).not.toThrow();
    });

    it('lanza 403 si el usuario no pertenece a la empresa', () => {
      expect(() =>
        service.assertCanAccessEnterprise(regularAccessContext, 'otra-empresa'),
      ).toThrow(ForbiddenException);
    });

    it('omite el aislamiento si el usuario es administrador global', () => {
      const adminAccessContext: AccessContext = {
        userId,
        isGlobalAdmin: true,
        allowedEnterpriseIds: [],
      };

      expect(() =>
        service.assertCanAccessEnterprise(adminAccessContext, 'cualquier-empresa'),
      ).not.toThrow();
    });

    it('lanza 400 si falta el identificador de empresa', () => {
      try {
        service.assertCanAccessEnterprise(regularAccessContext, '');
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      }
    });
  });

  describe('assertEntityAccessible', () => {
    const regularAccessContext: AccessContext = {
      userId,
      isGlobalAdmin: false,
      allowedEnterpriseIds: [enterpriseId],
    };

    it('permite el recurso de una empresa autorizada', () => {
      expect(() =>
        service.assertEntityAccessible(regularAccessContext, enterpriseId, {
          notFoundMessage: 'Recurso no encontrado',
        }),
      ).not.toThrow();
    });

    it('lanza 404 si el tenant no es accesible para no revelar existencia', () => {
      try {
        service.assertEntityAccessible(regularAccessContext, 'otra-empresa', {
          notFoundMessage: 'Recurso no encontrado',
        });
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
        expect((error as HttpException).message).toBe('Recurso no encontrado');
      }
    });

    it('exige el permiso del catálogo cuando se informa requiredPermission', () => {
      const accessContext: AccessContext = {
        userId,
        isGlobalAdmin: false,
        allowedEnterpriseIds: [enterpriseId],
        permissionsByEnterpriseId: { [enterpriseId]: {} },
      };
      runWithEnterpriseAccessContext(accessContext, () => {
        expect(() =>
          service.assertCurrentEntityAccessible(enterpriseId, 'Recurso no encontrado', {
            resource: 'clients',
            action: 'read',
          }),
        ).toThrow(ForbiddenException);
      });
    });

    it('permite el recurso si el tenant es accesible y el rol concede la acción', () => {
      const accessContext: AccessContext = {
        userId,
        isGlobalAdmin: false,
        allowedEnterpriseIds: [enterpriseId],
        permissionsByEnterpriseId: {
          [enterpriseId]: { clients: { read: true } },
        },
      };
      runWithEnterpriseAccessContext(accessContext, () => {
        expect(() =>
          service.assertCurrentEntityAccessible(enterpriseId, 'Recurso no encontrado', {
            resource: 'clients',
            action: 'read',
          }),
        ).not.toThrow();
      });
    });

    it('no evalúa RBAC si falta el tenant de la entidad (ya respondió 404)', () => {
      const accessContext: AccessContext = {
        userId,
        isGlobalAdmin: false,
        allowedEnterpriseIds: [enterpriseId],
        permissionsByEnterpriseId: { [enterpriseId]: {} },
      };
      runWithEnterpriseAccessContext(accessContext, () => {
        expect(() =>
          service.assertCurrentEntityAccessible(undefined, 'Recurso no encontrado', {
            resource: 'clients',
            action: 'read',
          }),
        ).toThrow(HttpException);
      });
    });

    it('lanza 404 si la entidad no tiene empresa (mensaje con tenant desconocido)', () => {
      expect(() =>
        service.assertEntityAccessible(regularAccessContext, undefined, {
          notFoundMessage: 'Recurso no encontrado',
        }),
      ).toThrow(HttpException);
    });

    it('omite la comprobación para administradores globales', () => {
      const adminAccessContext: AccessContext = {
        userId,
        isGlobalAdmin: true,
        allowedEnterpriseIds: [],
      };

      expect(() =>
        service.assertEntityAccessible(adminAccessContext, 'otra-empresa', {
          notFoundMessage: 'Recurso no encontrado',
        }),
      ).not.toThrow();
    });
  });

  describe('assertUserRecordAccessible', () => {
    const regularAccessContext: AccessContext = {
      userId,
      isGlobalAdmin: false,
      allowedEnterpriseIds: [enterpriseId],
    };

    it('permite consultar el propio perfil', () => {
      expect(() =>
        service.assertUserRecordAccessible(
          regularAccessContext,
          { id: userId, userEnterprises: [] },
          'Usuario no encontrado',
        ),
      ).not.toThrow();
    });

    it('permite consultar a un compañero de empresa', () => {
      expect(() =>
        service.assertUserRecordAccessible(
          regularAccessContext,
          { id: 'otro-usuario', userEnterprises: [{ enterpriseId }] },
          'Usuario no encontrado',
        ),
      ).not.toThrow();
    });

    it('lanza 404 si no comparte empresa', () => {
      expect(() =>
        service.assertUserRecordAccessible(
          regularAccessContext,
          { id: 'otro-usuario', userEnterprises: [{ enterpriseId: 'otra-empresa' }] },
          'Usuario no encontrado',
        ),
      ).toThrow(HttpException);
    });

    it('lanza 404 si el usuario objetivo no trae vínculos de empresa', () => {
      expect(() =>
        service.assertUserRecordAccessible(
          regularAccessContext,
          { id: 'otro-usuario' },
          'Usuario no encontrado',
        ),
      ).toThrow(HttpException);
    });

    it('permite cualquier perfil a un administrador global', () => {
      expect(() =>
        service.assertUserRecordAccessible(
          { userId, isGlobalAdmin: true, allowedEnterpriseIds: [] },
          { id: 'otro-usuario', userEnterprises: [] },
          'Usuario no encontrado',
        ),
      ).not.toThrow();
    });
  });

  describe('assertCurrentUserRecordAccessible', () => {
    it('usa el contexto de la petición actual', () => {
      runWithEnterpriseAccessContext(
        { userId, isGlobalAdmin: false, allowedEnterpriseIds: [enterpriseId] },
        () => {
          expect(() =>
            service.assertCurrentUserRecordAccessible(
              { id: userId, userEnterprises: [] },
              'Usuario no encontrado',
            ),
          ).not.toThrow();
        },
      );
    });
  });

  describe('assertCanCreateEnterprise', () => {
    it('permite crear empresas a un administrador global', () => {
      expect(() =>
        service.assertCanCreateEnterprise({
          userId,
          isGlobalAdmin: true,
          allowedEnterpriseIds: [],
        }),
      ).not.toThrow();
    });

    it('lanza 403 si el usuario no es administrador global', () => {
      expect(() =>
        service.assertCanCreateEnterprise({
          userId,
          isGlobalAdmin: false,
          allowedEnterpriseIds: [enterpriseId],
        }),
      ).toThrow(ForbiddenException);
    });
  });

  describe('assertCanDeleteEnterprise', () => {
    it('permite eliminar empresas a un administrador global', () => {
      expect(() =>
        service.assertCanDeleteEnterprise({
          userId,
          isGlobalAdmin: true,
          allowedEnterpriseIds: [],
        }),
      ).not.toThrow();
    });

    it('lanza 403 si el usuario no es administrador global', () => {
      expect(() =>
        service.assertCanDeleteEnterprise({
          userId,
          isGlobalAdmin: false,
          allowedEnterpriseIds: [enterpriseId],
        }),
      ).toThrow(ForbiddenException);
    });
  });

  describe('assertCanPerformEnterprisePermission', () => {
    it('permite al administrador global cualquier acción', () => {
      expect(() =>
        service.assertCanPerformEnterprisePermission(
          { userId, isGlobalAdmin: true, allowedEnterpriseIds: [] },
          enterpriseId,
          'invoices',
          'delete',
        ),
      ).not.toThrow();
    });

    it('permite si el JSONB concede la acción o el comodín *', () => {
      expect(() =>
        service.assertCanPerformEnterprisePermission(
          {
            userId,
            isGlobalAdmin: false,
            allowedEnterpriseIds: [enterpriseId],
            permissionsByEnterpriseId: {
              [enterpriseId]: { invoices: { read: true } },
            },
          },
          enterpriseId,
          'invoices',
          'read',
        ),
      ).not.toThrow();
    });

    it('evalúa el permiso con el contexto de la petición actual', () => {
      runWithEnterpriseAccessContext(
        {
          userId,
          isGlobalAdmin: false,
          allowedEnterpriseIds: [enterpriseId],
          permissionsByEnterpriseId: {
            [enterpriseId]: { invoices: { read: true } },
          },
        },
        () => {
          expect(() =>
            service.assertCurrentPermission(enterpriseId, 'invoices', 'read'),
          ).not.toThrow();
        },
      );
    });

    it('lanza 403 si el rol no concede la acción (deny by default)', () => {
      expect(() =>
        service.assertCanPerformEnterprisePermission(
          {
            userId,
            isGlobalAdmin: false,
            allowedEnterpriseIds: [enterpriseId],
            permissionsByEnterpriseId: { [enterpriseId]: {} },
          },
          enterpriseId,
          'invoices',
          'write',
        ),
      ).toThrow(ForbiddenException);
      expect(() =>
        service.assertCanPerformEnterprisePermission(
          {
            userId,
            isGlobalAdmin: false,
            allowedEnterpriseIds: [enterpriseId],
            permissionsByEnterpriseId: { [enterpriseId]: {} },
          },
          enterpriseId,
          'invoices',
          'write',
        ),
      ).toThrow(buildMissingEnterprisePermissionMessage('invoices', 'write'));
    });

    it('deniega si el contexto no trae mapa de permisos', () => {
      expect(() =>
        service.assertCanPerformEnterprisePermission(
          {
            userId,
            isGlobalAdmin: false,
            allowedEnterpriseIds: [enterpriseId],
          },
          enterpriseId,
          'invoices',
          'read',
        ),
      ).toThrow(ForbiddenException);
    });
  });

  describe('assertCanPerformUserResourcePermission', () => {
    const colleagueUser = {
      id: 'colleague-uuid',
      userEnterprises: [{ enterpriseId }],
    };

    it('omite la comprobación para el administrador global y para el propio perfil en lectura', () => {
      expect(() =>
        service.assertCanPerformUserResourcePermission(
          { userId, isGlobalAdmin: true, allowedEnterpriseIds: [] },
          colleagueUser,
          'users',
          'delete',
        ),
      ).not.toThrow();
      expect(() =>
        service.assertCanPerformUserResourcePermission(
          {
            userId,
            isGlobalAdmin: false,
            allowedEnterpriseIds: [enterpriseId],
            permissionsByEnterpriseId: { [enterpriseId]: {} },
          },
          { id: userId, userEnterprises: [{ enterpriseId }] },
          'users',
          'read',
          { allowSelfBypass: true },
        ),
      ).not.toThrow();
    });

    it('permite si alguna empresa compartida concede el permiso', () => {
      expect(() =>
        service.assertCanPerformUserResourcePermission(
          {
            userId,
            isGlobalAdmin: false,
            allowedEnterpriseIds: [enterpriseId],
            permissionsByEnterpriseId: {
              [enterpriseId]: { users: { write: true } },
            },
          },
          colleagueUser,
          'users',
          'write',
        ),
      ).not.toThrow();
    });

    it('usa el contexto actual para exigir el permiso sobre un usuario', () => {
      runWithEnterpriseAccessContext(
        {
          userId,
          isGlobalAdmin: false,
          allowedEnterpriseIds: [enterpriseId],
          permissionsByEnterpriseId: { [enterpriseId]: {} },
        },
        () => {
          expect(() =>
            service.assertCurrentUserResourcePermission(
              { id: 'colleague-uuid', userEnterprises: [{ enterpriseId }] },
              'users',
              'read',
            ),
          ).toThrow(ForbiddenException);
        },
      );
    });

    it('lanza 403 si no hay concesión en ninguna empresa compartida', () => {
      expect(() =>
        service.assertCanPerformUserResourcePermission(
          {
            userId,
            isGlobalAdmin: false,
            allowedEnterpriseIds: [enterpriseId],
            permissionsByEnterpriseId: { [enterpriseId]: {} },
          },
          colleagueUser,
          'users',
          'write',
        ),
      ).toThrow(ForbiddenException);
      expect(() =>
        service.assertCanPerformUserResourcePermission(
          {
            userId,
            isGlobalAdmin: false,
            allowedEnterpriseIds: [enterpriseId],
            permissionsByEnterpriseId: { [enterpriseId]: {} },
          },
          colleagueUser,
          'users',
          'write',
        ),
      ).toThrow(buildMissingEnterprisePermissionMessage('users', 'write'));
    });

    it('deniega si comparte empresa pero el contexto no trae mapa de permisos', () => {
      expect(() =>
        service.assertCanPerformUserResourcePermission(
          {
            userId,
            isGlobalAdmin: false,
            allowedEnterpriseIds: [enterpriseId],
          },
          colleagueUser,
          'users',
          'read',
        ),
      ).toThrow(ForbiddenException);
    });

    it('trata como vacío un usuario sin userEnterprises y un contexto sin mapa', () => {
      expect(() =>
        service.assertCanPerformUserResourcePermission(
          {
            userId,
            isGlobalAdmin: false,
            allowedEnterpriseIds: [enterpriseId],
          },
          { id: 'colleague-uuid' },
          'users',
          'read',
        ),
      ).toThrow(ForbiddenException);
    });

    it('el propio perfil sigue exigiendo users.write si no hay allowSelfBypass', () => {
      expect(() =>
        service.assertCanPerformUserResourcePermission(
          {
            userId,
            isGlobalAdmin: false,
            allowedEnterpriseIds: [enterpriseId],
            permissionsByEnterpriseId: { [enterpriseId]: {} },
          },
          { id: userId, userEnterprises: [{ enterpriseId }] },
          'users',
          'write',
        ),
      ).toThrow(buildMissingEnterprisePermissionMessage('users', 'write'));
    });

    it('no concede por una empresa compartida distinta de aquella donde hay permiso', () => {
      const otherEnterpriseId = 'otra-empresa';
      expect(() =>
        service.assertCanPerformUserResourcePermission(
          {
            userId,
            isGlobalAdmin: false,
            allowedEnterpriseIds: [enterpriseId, otherEnterpriseId],
            permissionsByEnterpriseId: {
              [enterpriseId]: { users: { read: true } },
              [otherEnterpriseId]: {},
            },
          },
          {
            id: 'colleague-uuid',
            userEnterprises: [{ enterpriseId: otherEnterpriseId }],
          },
          'users',
          'read',
        ),
      ).toThrow(ForbiddenException);
    });
  });

  describe('buildMissingEnterprisePermissionMessage', () => {
    it('incluye el recurso y la acción denegados', () => {
      expect(buildMissingEnterprisePermissionMessage('users', 'read')).toBe(
        'No tiene permiso para realizar la acción users.read',
      );
    });
  });

  describe('mergeRelationNames', () => {
    it('une relaciones evitando duplicados', () => {
      expect(service.mergeRelationNames(['client', 'series'], ['client'])).toEqual([
        'client',
        'series',
      ]);
    });

    it('usa solo las relaciones obligatorias si no se informaron otras', () => {
      expect(service.mergeRelationNames(undefined, ['supplier'])).toEqual(['supplier']);
    });
  });
});
