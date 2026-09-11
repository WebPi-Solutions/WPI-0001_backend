import { Test, TestingModule } from '@nestjs/testing';
import { REQUIRE_ENTERPRISE_PERMISSION_KEY } from 'src/common/decorators/enterprise-permission.decorator';
import { buildEnterprisePermissionCatalog } from 'src/common/helpers/enterprise-permission/permission.catalog';
import { CreateEnterpriseRoleDto } from 'src/entities/enterprise-role/dto/create-enterprise-role.dto';
import { EnterpriseRoleController } from './enterprise-role.controller';
import { EnterpriseRoleService } from './enterprise-role.service';

/**
 * Pruebas del controlador REST de roles de empresa.
 */
describe('EnterpriseRoleController', () => {
  let controller: EnterpriseRoleController;
  let enterpriseRoleService: {
    findAll: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
  };

  const enterpriseId = 'enterprise-uuid';
  const roleId = 'role-uuid';

  beforeEach(async () => {
    enterpriseRoleService = {
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      create: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
    };

    const testingModule: TestingModule = await Test.createTestingModule({
      controllers: [EnterpriseRoleController],
      providers: [{ provide: EnterpriseRoleService, useValue: enterpriseRoleService }],
    }).compile();

    controller = testingModule.get(EnterpriseRoleController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('devuelve el catálogo estático de recursos y acciones', () => {
    expect(controller.getPermissionCatalog()).toEqual(buildEnterprisePermissionCatalog());
  });

  it('delega el listado y el alta al servicio', async () => {
    await controller.findAll(enterpriseId);
    expect(enterpriseRoleService.findAll).toHaveBeenCalledWith(enterpriseId);

    const createDto: CreateEnterpriseRoleDto = { role: 'Contable' };
    await controller.create(enterpriseId, createDto);
    expect(enterpriseRoleService.create).toHaveBeenCalledWith(enterpriseId, createDto);
  });

  it('delega get, patch y delete por id', async () => {
    await controller.findById(roleId);
    expect(enterpriseRoleService.findById).toHaveBeenCalledWith(roleId);

    const patch: CreateEnterpriseRoleDto = { role: 'Nuevo' };
    await controller.updateById(roleId, patch);
    expect(enterpriseRoleService.updateById).toHaveBeenCalledWith(roleId, patch);

    await controller.deleteById(roleId);
    expect(enterpriseRoleService.deleteById).toHaveBeenCalledWith(roleId);
  });

  it('declara el permiso de catálogo en cada acción HTTP', () => {
    expect(
      Reflect.getMetadata(
        REQUIRE_ENTERPRISE_PERMISSION_KEY,
        EnterpriseRoleController.prototype.getPermissionCatalog,
      ),
    ).toEqual({ resource: 'enterpriseRoles', action: 'read' });
    expect(
      Reflect.getMetadata(
        REQUIRE_ENTERPRISE_PERMISSION_KEY,
        EnterpriseRoleController.prototype.create,
      ),
    ).toEqual({ resource: 'enterpriseRoles', action: 'write' });
    expect(
      Reflect.getMetadata(
        REQUIRE_ENTERPRISE_PERMISSION_KEY,
        EnterpriseRoleController.prototype.deleteById,
      ),
    ).toEqual({ resource: 'enterpriseRoles', action: 'delete' });
  });
});
