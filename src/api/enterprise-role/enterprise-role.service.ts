import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DeleteResult } from 'typeorm';
import { CreateEnterpriseRoleDto } from 'src/entities/enterprise-role/dto/create-enterprise-role.dto';
import { EnterpriseRole } from 'src/entities/enterprise-role/enterprise-role.entity';
import { EnterpriseRoleRepository } from 'src/entities/enterprise-role/enterprise-role-repository.service';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import {
  ADMINISTRATOR_ROLE_PERMISSIONS,
  EMPLOYEE_ROLE_PERMISSIONS,
  ENTERPRISE_ROLE_NAME_ADMINISTRATOR,
  ENTERPRISE_ROLE_NAME_EMPLOYEE,
  EnterpriseRolePermissions,
  isProtectedDefaultEnterpriseRoleName,
} from 'src/common/helpers/enterprise-permission/permission.catalog';
import {
  revokeMutationsWhenReadIsNotGranted,
  validateEnterpriseRolePermissionsPayload,
} from 'src/common/helpers/enterprise-permission/permission.evaluator';

/**
 * Reglas de negocio de roles de empresa: semilla, validación del JSONB y CRUD.
 */
@Injectable()
export class EnterpriseRoleService {
  private readonly logger = new Logger(EnterpriseRoleService.name);

  constructor(
    private readonly enterpriseRoleRepository: EnterpriseRoleRepository,
    private readonly enterpriseAccessService: EnterpriseAccessService,
  ) {}

  /**
   * Crea los roles base Administrador (`*`) y Empleado (`{}`) si aún no existen.
   *
   * @param enterpriseId - Empresa recién creada
   */
  async seedDefaultRolesForEnterprise(enterpriseId: string): Promise<void> {
    this.logger.log(`Sembrando roles base para la empresa ${enterpriseId}`);
    await this.ensureNamedRole(
      enterpriseId,
      ENTERPRISE_ROLE_NAME_ADMINISTRATOR,
      ADMINISTRATOR_ROLE_PERMISSIONS,
    );
    await this.ensureNamedRole(
      enterpriseId,
      ENTERPRISE_ROLE_NAME_EMPLOYEE,
      EMPLOYEE_ROLE_PERMISSIONS,
    );
  }

  /**
   * Devuelve el rol Administrador de la empresa (lo crea si faltara).
   *
   * @param enterpriseId - UUID de la empresa
   * @returns Rol administrador
   */
  async getOrCreateAdministratorRole(enterpriseId: string): Promise<EnterpriseRole> {
    return this.ensureNamedRole(
      enterpriseId,
      ENTERPRISE_ROLE_NAME_ADMINISTRATOR,
      ADMINISTRATOR_ROLE_PERMISSIONS,
    );
  }

  /**
   * Devuelve el rol Empleado de la empresa (lo crea si faltara).
   *
   * @param enterpriseId - UUID de la empresa
   * @returns Rol Empleado
   */
  async getOrCreateEmployeeRole(enterpriseId: string): Promise<EnterpriseRole> {
    return this.ensureNamedRole(
      enterpriseId,
      ENTERPRISE_ROLE_NAME_EMPLOYEE,
      EMPLOYEE_ROLE_PERMISSIONS,
    );
  }

  /**
   * Lista los roles de una empresa.
   *
   * @param enterpriseId - UUID de la empresa
   * @returns Roles de la empresa
   */
  async findAll(enterpriseId: string): Promise<EnterpriseRole[]> {
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      enterpriseId,
      'Roles no encontrados',
      { resource: 'enterpriseRoles', action: 'read' },
    );
    return this.enterpriseRoleRepository.findByEnterpriseId(enterpriseId);
  }

  /**
   * Obtiene un rol por id (404 si es de otra empresa).
   *
   * @param id - UUID del rol
   * @returns Rol
   */
  async findById(id: string): Promise<EnterpriseRole> {
    const enterpriseRole = await this.enterpriseRoleRepository.findById(id);
    if (!enterpriseRole) {
      throw new HttpException('Rol no encontrado', HttpStatus.NOT_FOUND);
    }
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      enterpriseRole.enterpriseId,
      'Rol no encontrado',
      { resource: 'enterpriseRoles', action: 'read' },
    );
    return enterpriseRole;
  }

  /**
   * Crea un rol en la empresa del query.
   *
   * @param enterpriseId - Empresa del query
   * @param createDto - Nombre y permisos
   * @returns Rol creado
   */
  async create(
    enterpriseId: string,
    createDto: CreateEnterpriseRoleDto,
  ): Promise<EnterpriseRole> {
    this.enterpriseAccessService.assertCurrentEntityAccessible(
      enterpriseId,
      'No se puede crear el rol',
      { resource: 'enterpriseRoles', action: 'write' },
    );
    const roleName = createDto.role.trim();
    if (!roleName) {
      throw new HttpException('El nombre del rol es obligatorio', HttpStatus.BAD_REQUEST);
    }
    const permissions = this.parseAndValidatePermissions(createDto.permissions);
    const existingRole =
      await this.enterpriseRoleRepository.findByEnterpriseIdAndRoleName(
        enterpriseId,
        roleName,
      );
    if (existingRole) {
      throw new HttpException(
        'Ya existe un rol con ese nombre en la empresa',
        HttpStatus.CONFLICT,
      );
    }
    return this.enterpriseRoleRepository.create({
      enterpriseId,
      role: roleName,
      permissions,
    });
  }

  /**
   * Actualiza nombre y/o permisos de un rol.
   * El Administrador no se puede renombrar ni cambiar de permisos.
   *
   * @param id - UUID del rol
   * @param patch - Campos a cambiar
   * @returns Rol actualizado
   */
  async updateById(
    id: string,
    patch: Partial<CreateEnterpriseRoleDto>,
  ): Promise<EnterpriseRole> {
    const existingRole = await this.findById(id);
    this.enterpriseAccessService.assertCurrentPermission(
      existingRole.enterpriseId,
      'enterpriseRoles',
      'write',
    );

    const nextRoleName =
      typeof patch.role === 'string' ? patch.role.trim() : existingRole.role;
    if (!nextRoleName) {
      throw new HttpException('El nombre del rol es obligatorio', HttpStatus.BAD_REQUEST);
    }

    if (nextRoleName !== existingRole.role) {
      const collision =
        await this.enterpriseRoleRepository.findByEnterpriseIdAndRoleName(
          existingRole.enterpriseId,
          nextRoleName,
        );
      if (collision && collision.id !== existingRole.id) {
        throw new HttpException(
          'Ya existe un rol con ese nombre en la empresa',
          HttpStatus.CONFLICT,
        );
      }
    }

    this.assertAdministratorRoleConstraints(existingRole.role, nextRoleName, patch);

    let nextPermissions = existingRole.permissions;
    if (Object.prototype.hasOwnProperty.call(patch, 'permissions')) {
      nextPermissions = this.parseAndValidatePermissions(patch.permissions);
    }

    return this.enterpriseRoleRepository.updateById(id, {
      role: nextRoleName,
      permissions: nextPermissions,
    });
  }

  /**
   * Elimina un rol. Los roles por defecto Administrador y Empleado no son eliminables.
   *
   * @param id - UUID del rol
   * @returns Resultado del delete
   */
  async deleteById(id: string): Promise<DeleteResult> {
    const existingRole = await this.findById(id);
    this.enterpriseAccessService.assertCurrentPermission(
      existingRole.enterpriseId,
      'enterpriseRoles',
      'delete',
    );
    this.assertDefaultRoleIsDeletable(existingRole.role);
    return this.enterpriseRoleRepository.deleteById(id);
  }

  /**
   * Comprueba que un rol existe y pertenece a la empresa indicada.
   *
   * @param enterpriseRoleId - UUID del rol
   * @param enterpriseId - Empresa esperada
   * @returns Rol
   */
  async assertRoleBelongsToEnterprise(
    enterpriseRoleId: string,
    enterpriseId: string,
  ): Promise<EnterpriseRole> {
    const enterpriseRole = await this.enterpriseRoleRepository.findById(enterpriseRoleId);
    if (!enterpriseRole || enterpriseRole.enterpriseId !== enterpriseId) {
      throw new HttpException(
        'El rol no pertenece a esta empresa',
        HttpStatus.BAD_REQUEST,
      );
    }
    return enterpriseRole;
  }

  /**
   * Crea el rol con ese nombre si no existe.
   *
   * @param enterpriseId - Empresa
   * @param roleName - Nombre
   * @param permissions - JSONB inicial
   * @returns Rol existente o recién creado
   */
  private async ensureNamedRole(
    enterpriseId: string,
    roleName: string,
    permissions: EnterpriseRolePermissions,
  ): Promise<EnterpriseRole> {
    const existingRole =
      await this.enterpriseRoleRepository.findByEnterpriseIdAndRoleName(
        enterpriseId,
        roleName,
      );
    if (existingRole) {
      return existingRole;
    }
    return this.enterpriseRoleRepository.create({
      enterpriseId,
      role: roleName,
      permissions,
    });
  }

  /**
   * Impide borrar los roles sembrados Administrador y Empleado.
   *
   * @param roleName - Nombre del rol a eliminar
   */
  private assertDefaultRoleIsDeletable(roleName: string): void {
    if (!isProtectedDefaultEnterpriseRoleName(roleName)) {
      return;
    }
    this.logger.warn(`Intento de borrar el rol protegido «${roleName}»`);
    throw new HttpException(
      'Los roles Administrador y Empleado no son eliminables',
      HttpStatus.BAD_REQUEST,
    );
  }

  /**
   * Impide renombrar el Administrador o cambiarle los permisos.
   *
   * @param currentRoleName - Nombre persistido
   * @param nextRoleName - Nombre solicitado
   * @param patch - Cuerpo del PATCH
   */
  private assertAdministratorRoleConstraints(
    currentRoleName: string,
    nextRoleName: string,
    patch: Partial<CreateEnterpriseRoleDto>,
  ): void {
    if (currentRoleName !== ENTERPRISE_ROLE_NAME_ADMINISTRATOR) {
      return;
    }
    if (nextRoleName !== ENTERPRISE_ROLE_NAME_ADMINISTRATOR) {
      throw new HttpException(
        'No se puede renombrar el rol Administrador',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'permissions')) {
      this.logger.warn('Intento de modificar los permisos del rol Administrador');
      throw new HttpException(
        'El rol Administrador no puede modificar los permisos',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Valida el JSONB de permisos. Sin `read`, se quitan `write` y `delete`.
   *
   * @param permissions - Payload opcional
   * @returns Mapa válido (vacío si no se envió)
   */
  private parseAndValidatePermissions(
    permissions: EnterpriseRolePermissions | undefined,
  ): EnterpriseRolePermissions {
    const validationError = validateEnterpriseRolePermissionsPayload(permissions);
    if (validationError) {
      throw new HttpException(validationError, HttpStatus.BAD_REQUEST);
    }
    return revokeMutationsWhenReadIsNotGranted(permissions ?? {});
  }
}
