import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import {
  ADMINISTRATOR_ROLE_PERMISSIONS,
  EMPLOYEE_ROLE_PERMISSIONS,
  ENTERPRISE_ROLE_NAME_ADMINISTRATOR,
  ENTERPRISE_ROLE_NAME_EMPLOYEE,
} from 'src/common/helpers/enterprise-permission/permission.catalog';
import { CreateEnterpriseRoleDto } from 'src/entities/enterprise-role/dto/create-enterprise-role.dto';
import { EnterpriseRole } from 'src/entities/enterprise-role/enterprise-role.entity';
import { EnterpriseRoleRepository } from 'src/entities/enterprise-role/enterprise-role-repository.service';
import { EnterpriseRoleService } from './enterprise-role.service';

/**
 * Pruebas de reglas de negocio de roles de empresa.
 */
describe('EnterpriseRoleService', () => {
  let service: EnterpriseRoleService;
  let enterpriseRoleRepository: {
    findByEnterpriseId: jest.Mock;
    findById: jest.Mock;
    findByEnterpriseIdAndRoleName: jest.Mock;
    create: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };
  let enterpriseAccessService: {
    assertCurrentEntityAccessible: jest.Mock;
    assertCurrentPermission: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const roleId = 'role-uuid';
  const employeeRole = {
    id: roleId,
    enterpriseId,
    role: ENTERPRISE_ROLE_NAME_EMPLOYEE,
    permissions: EMPLOYEE_ROLE_PERMISSIONS,
  } as EnterpriseRole;
  const administratorRole = {
    id: 'admin-role-uuid',
    enterpriseId,
    role: ENTERPRISE_ROLE_NAME_ADMINISTRATOR,
    permissions: ADMINISTRATOR_ROLE_PERMISSIONS,
  } as EnterpriseRole;
  const customRole = {
    id: 'custom-role-uuid',
    enterpriseId,
    role: 'Contable',
    permissions: { invoices: { read: true } },
  } as EnterpriseRole;

  beforeEach(async () => {
    enterpriseRoleRepository = {
      findByEnterpriseId: jest.fn().mockResolvedValue([administratorRole, employeeRole]),
      findById: jest.fn().mockResolvedValue(employeeRole),
      findByEnterpriseIdAndRoleName: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((payload: Partial<EnterpriseRole>) =>
        Promise.resolve({ id: 'created-role', ...payload } as EnterpriseRole),
      ),
      updateById: jest.fn().mockImplementation((id: string, patch: Partial<EnterpriseRole>) =>
        Promise.resolve({ ...employeeRole, ...patch, id } as EnterpriseRole),
      ),
      deleteById: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
    };
    enterpriseAccessService = {
      assertCurrentEntityAccessible: jest.fn(),
      assertCurrentPermission: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        EnterpriseRoleService,
        { provide: EnterpriseRoleRepository, useValue: enterpriseRoleRepository },
        { provide: EnterpriseAccessService, useValue: enterpriseAccessService },
      ],
    }).compile();

    service = testingModule.get(EnterpriseRoleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('seedDefaultRolesForEnterprise', () => {
    it('crea Administrador y Empleado si no existen', async () => {
      await service.seedDefaultRolesForEnterprise(enterpriseId);

      expect(enterpriseRoleRepository.create).toHaveBeenCalledTimes(2);
      expect(enterpriseRoleRepository.create).toHaveBeenCalledWith({
        enterpriseId,
        role: ENTERPRISE_ROLE_NAME_ADMINISTRATOR,
        permissions: ADMINISTRATOR_ROLE_PERMISSIONS,
      });
      expect(enterpriseRoleRepository.create).toHaveBeenCalledWith({
        enterpriseId,
        role: ENTERPRISE_ROLE_NAME_EMPLOYEE,
        permissions: EMPLOYEE_ROLE_PERMISSIONS,
      });
    });

    it('no recrea un rol que ya existe', async () => {
      enterpriseRoleRepository.findByEnterpriseIdAndRoleName
        .mockResolvedValueOnce(administratorRole)
        .mockResolvedValueOnce(employeeRole);

      await service.seedDefaultRolesForEnterprise(enterpriseId);

      expect(enterpriseRoleRepository.create).not.toHaveBeenCalled();
    });
  });

  it('reutiliza Administrador y Empleado existentes', async () => {
    enterpriseRoleRepository.findByEnterpriseIdAndRoleName
      .mockResolvedValueOnce(administratorRole)
      .mockResolvedValueOnce(employeeRole);

    await expect(service.getOrCreateAdministratorRole(enterpriseId)).resolves.toEqual(
      administratorRole,
    );
    await expect(service.getOrCreateEmployeeRole(enterpriseId)).resolves.toEqual(employeeRole);
  });

  describe('findAll / findById / create', () => {
    it('lista los roles de la empresa tras comprobar el permiso', async () => {
      await expect(service.findAll(enterpriseId)).resolves.toEqual([
        administratorRole,
        employeeRole,
      ]);
      expect(enterpriseAccessService.assertCurrentEntityAccessible).toHaveBeenCalledWith(
        enterpriseId,
        'Roles no encontrados',
        { resource: 'enterpriseRoles', action: 'read' },
      );
    });

    it('lanza 404 si el rol no existe', async () => {
      enterpriseRoleRepository.findById.mockResolvedValue(null);

      await expect(service.findById(roleId)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });

    it('devuelve el rol si pertenece a una empresa accesible', async () => {
      await expect(service.findById(roleId)).resolves.toEqual(employeeRole);
    });

    it('crea un rol validando nombre y permisos', async () => {
      const createDto: CreateEnterpriseRoleDto = {
        role: 'Contabilidad',
        permissions: { invoices: { read: true, write: true } },
      };

      await expect(service.create(enterpriseId, createDto)).resolves.toMatchObject({
        role: 'Contabilidad',
        permissions: { invoices: { read: true, write: true } },
      });
    });

    it('revoca escritura o borrado al crear si no se envía lectura', async () => {
      await expect(
        service.create(enterpriseId, {
          role: 'Editor',
          permissions: { invoices: { write: true } },
        }),
      ).resolves.toMatchObject({
        role: 'Editor',
        permissions: {},
      });

      await expect(
        service.create(enterpriseId, {
          role: 'Auditor',
          permissions: { clients: { delete: true, read: false } },
        }),
      ).resolves.toMatchObject({
        role: 'Auditor',
        permissions: { clients: { read: false } },
      });
    });

    it('rechaza un nombre vacío o duplicado', async () => {
      await expect(
        service.create(enterpriseId, { role: '   ' } as CreateEnterpriseRoleDto),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });

      enterpriseRoleRepository.findByEnterpriseIdAndRoleName.mockResolvedValue(employeeRole);
      await expect(
        service.create(enterpriseId, { role: 'empleado' }),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    });

    it('rechaza un JSONB de permisos inválido', async () => {
      await expect(
        service.create(enterpriseId, {
          role: 'Inventado',
          permissions: { desconocido: { read: true } },
        } as CreateEnterpriseRoleDto),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });
  });

  describe('updateById / deleteById', () => {
    it('no permite renombrar el Administrador ni cambiarle los permisos', async () => {
      enterpriseRoleRepository.findById.mockResolvedValue(administratorRole);

      await expect(
        service.updateById(administratorRole.id, { role: 'Otro' }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'No se puede renombrar el rol Administrador',
      });
      await expect(
        service.updateById(administratorRole.id, { permissions: {} }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El rol Administrador no puede modificar los permisos',
      });
      await expect(
        service.updateById(administratorRole.id, {
          permissions: ADMINISTRATOR_ROLE_PERMISSIONS,
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'El rol Administrador no puede modificar los permisos',
      });
      expect(enterpriseRoleRepository.updateById).not.toHaveBeenCalled();
    });

    it('permite un PATCH del Administrador que no toca los permisos', async () => {
      enterpriseRoleRepository.findById.mockResolvedValue(administratorRole);

      await expect(
        service.updateById(administratorRole.id, {
          role: ENTERPRISE_ROLE_NAME_ADMINISTRATOR,
        }),
      ).resolves.toMatchObject({
        role: ENTERPRISE_ROLE_NAME_ADMINISTRATOR,
        permissions: ADMINISTRATOR_ROLE_PERMISSIONS,
      });
    });

    it('rechaza un nombre vacío al actualizar', async () => {
      await expect(service.updateById(roleId, { role: '   ' })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('actualiza solo el nombre si no se envían permisos', async () => {
      await expect(service.updateById(roleId, { role: 'Contable' })).resolves.toMatchObject({
        role: 'Contable',
        permissions: EMPLOYEE_ROLE_PERMISSIONS,
      });
    });

    it('actualiza nombre y permisos de un rol no administrador', async () => {
      await expect(
        service.updateById(roleId, {
          role: 'Contable',
          permissions: { invoices: { read: true } },
        }),
      ).resolves.toMatchObject({ role: 'Contable' });
    });

    it('revoca escritura o borrado al actualizar si se elimina la lectura', async () => {
      await expect(
        service.updateById(roleId, {
          permissions: { invoices: { write: true } },
        }),
      ).resolves.toMatchObject({
        permissions: {},
      });

      await expect(
        service.updateById(roleId, {
          permissions: { clients: { delete: true, read: false } },
        }),
      ).resolves.toMatchObject({
        permissions: { clients: { read: false } },
      });
    });

    it('rechaza un nombre duplicado al renombrar', async () => {
      enterpriseRoleRepository.findByEnterpriseIdAndRoleName.mockResolvedValue({
        id: 'otro-rol',
        role: 'Contable',
      });

      await expect(service.updateById(roleId, { role: 'Contable' })).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });
    });

    it('no elimina los roles Administrador ni Empleado', async () => {
      enterpriseRoleRepository.findById.mockResolvedValue(administratorRole);
      await expect(service.deleteById(administratorRole.id)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Los roles Administrador y Empleado no son eliminables',
      });

      enterpriseRoleRepository.findById.mockResolvedValue(employeeRole);
      await expect(service.deleteById(employeeRole.id)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Los roles Administrador y Empleado no son eliminables',
      });
      expect(enterpriseRoleRepository.deleteById).not.toHaveBeenCalled();
    });

    it('elimina un rol que no es Administrador ni Empleado', async () => {
      enterpriseRoleRepository.findById.mockResolvedValue(customRole);

      await expect(service.deleteById(customRole.id)).resolves.toEqual({
        affected: 1,
        raw: [],
      });
      expect(enterpriseRoleRepository.deleteById).toHaveBeenCalledWith(customRole.id);
    });
  });

  describe('assertRoleBelongsToEnterprise', () => {
    it('devuelve el rol si coincide la empresa', async () => {
      await expect(service.assertRoleBelongsToEnterprise(roleId, enterpriseId)).resolves.toEqual(
        employeeRole,
      );
    });

    it('lanza 400 si el rol es de otra empresa o no existe', async () => {
      enterpriseRoleRepository.findById.mockResolvedValue({
        ...employeeRole,
        enterpriseId: 'otra',
      });
      await expect(service.assertRoleBelongsToEnterprise(roleId, enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });

      enterpriseRoleRepository.findById.mockResolvedValue(null);
      await expect(service.assertRoleBelongsToEnterprise(roleId, enterpriseId)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });
  });
});
