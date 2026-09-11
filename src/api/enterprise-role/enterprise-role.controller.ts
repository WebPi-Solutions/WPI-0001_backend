import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MapResponse } from 'src/common/decorators/map-response.decorator';
import { RequireEnterpriseId } from 'src/common/decorators/enterprise-access.decorator';
import { RequirePermission } from 'src/common/decorators/enterprise-permission.decorator';
import { CreateEnterpriseRoleDto } from 'src/entities/enterprise-role/dto/create-enterprise-role.dto';
import { EnterpriseRoleResponseDto } from 'src/entities/enterprise-role/dto/enterprise-role-response.dto';
import { buildEnterprisePermissionCatalog } from 'src/common/helpers/enterprise-permission/permission.catalog';
import { EnterpriseRoleService } from './enterprise-role.service';

/**
 * Endpoints REST de roles de empresa y catálogo de permisos.
 */
@ApiTags('Roles de empresa')
@Controller('enterprise-roles')
export class EnterpriseRoleController {
  constructor(private readonly enterpriseRoleService: EnterpriseRoleService) {}

  /**
   * Devuelve el catálogo de recursos y acciones (código). No incluye concesiones de un rol.
   *
   * @returns Catálogo estático
   */
  @Get('catalog')
  @RequireEnterpriseId()
  @RequirePermission('enterpriseRoles', 'read')
  @ApiOperation({ summary: 'Obtener el catálogo de permisos reconocidos por el API' })
  @ApiResponse({ status: 200, description: 'Catálogo de recursos y acciones.' })
  getPermissionCatalog() {
    return buildEnterprisePermissionCatalog();
  }

  /**
   * Lista los roles de la empresa.
   *
   * @param enterpriseId - Empresa del query
   * @returns Roles
   */
  @Get()
  @RequireEnterpriseId()
  @RequirePermission('enterpriseRoles', 'read')
  @MapResponse(EnterpriseRoleResponseDto)
  @ApiOperation({ summary: 'Listar roles de la empresa' })
  @ApiOkResponse({ type: EnterpriseRoleResponseDto, isArray: true })
  @ApiResponse({ status: 403, description: 'Sin permiso o empresa ajena.' })
  findAll(@Query('enterpriseId') enterpriseId: string) {
    return this.enterpriseRoleService.findAll(enterpriseId);
  }

  /**
   * Crea un rol en la empresa del query.
   *
   * @param enterpriseId - Empresa
   * @param createDto - Nombre y permisos
   * @returns Rol creado
   */
  @Post()
  @RequireEnterpriseId()
  @RequirePermission('enterpriseRoles', 'write')
  @MapResponse(EnterpriseRoleResponseDto)
  @ApiOperation({ summary: 'Crear un rol de empresa' })
  @ApiOkResponse({ type: EnterpriseRoleResponseDto })
  @ApiResponse({ status: 400, description: 'Permisos o nombre inválidos.' })
  @ApiResponse({ status: 409, description: 'Nombre de rol duplicado.' })
  create(
    @Query('enterpriseId') enterpriseId: string,
    @Body() createDto: CreateEnterpriseRoleDto,
  ) {
    return this.enterpriseRoleService.create(enterpriseId, createDto);
  }

  /**
   * Obtiene un rol por id.
   *
   * @param id - UUID del rol
   * @returns Rol
   */
  @Get(':id')
  @RequirePermission('enterpriseRoles', 'read')
  @MapResponse(EnterpriseRoleResponseDto)
  @ApiOperation({ summary: 'Obtener un rol de empresa por id' })
  @ApiOkResponse({ type: EnterpriseRoleResponseDto })
  @ApiResponse({ status: 404, description: 'Rol no encontrado o de otra empresa.' })
  findById(@Param('id') id: string) {
    return this.enterpriseRoleService.findById(id);
  }

  /**
   * Actualiza un rol.
   *
   * @param id - UUID del rol
   * @param patch - Nombre y/o permisos
   * @returns Rol actualizado
   */
  @Patch(':id')
  @RequirePermission('enterpriseRoles', 'write')
  @MapResponse(EnterpriseRoleResponseDto)
  @ApiOperation({ summary: 'Actualizar un rol de empresa' })
  @ApiOkResponse({ type: EnterpriseRoleResponseDto })
  @ApiResponse({
    status: 400,
    description: 'El Administrador no puede cambiar de permisos ni de nombre.',
  })
  updateById(@Param('id') id: string, @Body() patch: CreateEnterpriseRoleDto) {
    return this.enterpriseRoleService.updateById(id, patch);
  }

  /**
   * Elimina un rol. Los roles por defecto Administrador y Empleado no son eliminables.
   *
   * @param id - UUID del rol
   * @returns Resultado
   */
  @Delete(':id')
  @RequirePermission('enterpriseRoles', 'delete')
  @ApiOperation({ summary: 'Eliminar un rol de empresa' })
  @ApiResponse({ status: 200, description: 'Rol eliminado.' })
  @ApiResponse({
    status: 400,
    description: 'Los roles Administrador y Empleado no son eliminables.',
  })
  deleteById(@Param('id') id: string) {
    return this.enterpriseRoleService.deleteById(id);
  }
}
