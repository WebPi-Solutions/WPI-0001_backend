import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EnterpriseRole } from './enterprise-role.entity';

/**
 * Persistencia de roles de empresa.
 */
@Injectable()
export class EnterpriseRoleRepository {
  private readonly logger = new Logger(EnterpriseRoleRepository.name);

  constructor(
    @InjectRepository(EnterpriseRole)
    private readonly enterpriseRoleRepository: Repository<EnterpriseRole>,
  ) {}

  /**
   * Persiste un rol (alta o actualización completa de la entidad).
   *
   * @param enterpriseRole - Rol a guardar
   * @returns Rol persistido
   */
  async create(enterpriseRole: Partial<EnterpriseRole>): Promise<EnterpriseRole> {
    const persistedRole = await this.enterpriseRoleRepository.save(enterpriseRole);
    persistedRole.userCount = persistedRole.userCount ?? 0;
    return persistedRole;
  }

  /**
   * Lista los roles de una empresa e incluye el recuento de usuarios asignados.
   *
   * @param enterpriseId - UUID de la empresa
   * @returns Roles de esa empresa
   */
  async findByEnterpriseId(enterpriseId: string): Promise<EnterpriseRole[]> {
    const enterpriseRoles = await this.enterpriseRoleRepository.find({
      where: { enterpriseId },
      order: { role: 'ASC' },
    });
    return this.attachUserCounts(enterpriseRoles);
  }

  /**
   * Busca un rol por id e incluye el recuento de usuarios asignados.
   *
   * @param id - UUID del rol
   * @returns Rol o `null`
   */
  async findById(id: string): Promise<EnterpriseRole | null> {
    const enterpriseRole = await this.enterpriseRoleRepository.findOne({ where: { id } });
    if (!enterpriseRole) {
      return null;
    }
    const [roleWithUserCount] = await this.attachUserCounts([enterpriseRole]);
    return roleWithUserCount;
  }

  /**
   * Busca un rol por empresa y nombre.
   *
   * @param enterpriseId - UUID de la empresa
   * @param roleName - Nombre exacto del rol
   * @returns Rol o `null`
   */
  findByEnterpriseIdAndRoleName(
    enterpriseId: string,
    roleName: string,
  ): Promise<EnterpriseRole | null> {
    return this.enterpriseRoleRepository.findOne({
      where: { enterpriseId, role: roleName },
    });
  }

  /**
   * Actualiza un rol existente.
   *
   * @param id - UUID del rol
   * @param patch - Campos a fusionar
   * @returns Rol actualizado
   */
  async updateById(
    id: string,
    patch: Partial<EnterpriseRole>,
  ): Promise<EnterpriseRole> {
    const existingRole = await this.findById(id);
    if (!existingRole) {
      this.logger.warn(`No existe el rol de empresa ${id}`);
      throw new HttpException('Rol no encontrado', HttpStatus.NOT_FOUND);
    }
    await this.enterpriseRoleRepository.save({ ...existingRole, ...patch, id });
    return this.findById(id) as Promise<EnterpriseRole>;
  }

  /**
   * Elimina un rol por id.
   *
   * @param id - UUID del rol
   * @returns Resultado de TypeORM
   */
  async deleteById(id: string) {
    const existingRole = await this.findById(id);
    if (!existingRole) {
      this.logger.warn(`No existe el rol de empresa ${id} para borrar`);
      throw new HttpException('Rol no encontrado', HttpStatus.NOT_FOUND);
    }
    return this.enterpriseRoleRepository.delete({ id });
  }

  /**
   * Rellena `userCount` con los vínculos `user_enterprise` de cada rol.
   *
   * @param enterpriseRoles - Roles ya cargados
   * @returns Los mismos roles con el contador
   */
  private async attachUserCounts(
    enterpriseRoles: EnterpriseRole[],
  ): Promise<EnterpriseRole[]> {
    if (enterpriseRoles.length === 0) {
      return enterpriseRoles;
    }
    const roleIds = enterpriseRoles.map((enterpriseRole) => enterpriseRole.id);
    const countRows = await this.enterpriseRoleRepository
      .createQueryBuilder('enterpriseRole')
      .leftJoin('enterpriseRole.userEnterprises', 'userEnterprise')
      .select('enterpriseRole.id', 'roleId')
      .addSelect('COUNT(userEnterprise.id)', 'userCount')
      .where('enterpriseRole.id IN (:...roleIds)', { roleIds })
      .groupBy('enterpriseRole.id')
      .getRawMany<{ roleId: string; userCount: string }>();
    const userCountByRoleId = new Map(
      countRows.map((countRow) => [countRow.roleId, Number(countRow.userCount) || 0]),
    );
    for (const enterpriseRole of enterpriseRoles) {
      enterpriseRole.userCount = userCountByRoleId.get(enterpriseRole.id) ?? 0;
    }
    return enterpriseRoles;
  }
}
