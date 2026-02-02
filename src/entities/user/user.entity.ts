import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { UserEnterprise } from '../user/user-enterprise.entity';

export enum UserStatusTypes {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending'
}

export enum UserRoleTypes {
  USER = 'user',
  ADMIN = 'administrator',
}

/**
 * Entidad Usuario que representa la tabla users en la base de datos
 * Almacena información sobre usuarios del sistema
 */
@Entity('users')
export class User {
  /**
   * Identificador único para el usuario
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Nombre completo del usuario
   */
  @Column()
  name: string;

  /**
   * Dirección de correo electrónico del usuario
   */
  @Column()
  email: string;

  /**
   * Rol del usuario en el sistema
   */
  @Column({ type: 'varchar', default: UserRoleTypes.USER })
  role: UserRoleTypes;

  /**
   * Número de teléfono del usuario
   */
  @Column({ nullable: true })
  phone: string;

  /**
   * Estado del usuario en el sistema
   */
  @Column({ default: UserStatusTypes.ACTIVE })
  status: UserStatusTypes;

  /**
   * Fecha en que se creó el usuario en el sistema
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * Fecha en que se actualizó el usuario en el sistema
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * Relación con UsuarioEmpresa - Todas las asociaciones de empresas para este usuario
   */
  @OneToMany(() => UserEnterprise, userEnterprise => userEnterprise.user)
  userEnterprises: UserEnterprise[];
}