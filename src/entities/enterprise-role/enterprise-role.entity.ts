import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Enterprise } from '../enterprise/enterprise.entity';
import { UserEnterprise } from '../user/user-enterprise.entity';
import { EnterpriseRolePermissions } from 'src/common/helpers/enterprise-permission/permission.catalog';

/**
 * Rol de una empresa (`enterprise_roles`) con mapa JSONB de permisos concedidos.
 */
@Entity('enterprise_roles')
@Unique('enterprise_roles_enterprise_id_role_key', ['enterpriseId', 'role'])
export class EnterpriseRole {
  /**
   * Identificador único del rol.
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Empresa propietaria del rol.
   */
  @Column({ name: 'enterprise_id' })
  enterpriseId: string;

  /**
   * Nombre del rol dentro de la empresa (p. ej. Administrador, Empleado).
   */
  @Column()
  role: string;

  /**
   * Concesiones (deny by default). El comodín `*` otorga acciones a todos los recursos.
   */
  @Column({ type: 'jsonb', default: {} })
  permissions: EnterpriseRolePermissions;

  /**
   * Fecha de creación.
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * Fecha de última actualización.
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * Usuarios de la empresa con este rol. No es columna; lo rellena el repositorio.
   */
  userCount?: number;

  /**
   * Empresa a la que pertenece el rol.
   */
  @ManyToOne(() => Enterprise, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'enterprise_id' })
  enterprise: Enterprise;

  /**
   * Vínculos usuario–empresa que usan este rol.
   */
  @OneToMany(() => UserEnterprise, (userEnterprise) => userEnterprise.enterpriseRole)
  userEnterprises: UserEnterprise[];
}
