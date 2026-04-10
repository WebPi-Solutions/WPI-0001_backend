import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { Enterprise } from '../enterprise/enterprise.entity';

/**
 * Entidad UsuarioEmpresa que representa la tabla user_enterprise en la base de datos
 * Esta es una tabla de unión que gestiona la relación muchos a muchos
 * entre usuarios y empresas con información adicional de rol
 */
@Entity('user_enterprise')
export class UserEnterprise {
  /**
   * ID de Usuario - Parte de la clave primaria compuesta
   */
  @PrimaryColumn({ name: 'user_id' })
  userId: string;

  /**
   * ID de Empresa - Parte de la clave primaria compuesta
   */
  @PrimaryColumn({ name: 'enterprise_id' })
  enterpriseId: string;

  /**
   * Rol del usuario en la empresa específica
   */
  @Column()
  role: string;

  /**
   * Fecha en que se creó la asociación
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * Fecha en que se actualizó la asociación
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * Relación con Usuario - El usuario en esta asociación
   */
  @ManyToOne(() => User, user => user.userEnterprises)
  @JoinColumn({ name: 'user_id' })
  user: User;

  /**
   * Relación con Empresa - La empresa en esta asociación
   */
  @ManyToOne(() => Enterprise, enterprise => enterprise.userEnterprises)
  @JoinColumn({ name: 'enterprise_id' })
  enterprise: Enterprise;
} 