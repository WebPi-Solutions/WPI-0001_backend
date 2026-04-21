import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEnterprise } from '../user/user-enterprise.entity';

/**
 * Día de vacaciones u otro permiso de un usuario (tabla vacations).
 */
@Entity('vacations')
export class Vacation {
  /**
   * Identificador único del registro
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Identificador del vínculo usuario–empresa que posee el permiso.
   * En multi-empresa, los permisos deben colgar del vínculo (`user_enterprise`).
   */
  @Column({ name: 'user_enterprise_id' })
  userEnterpriseId: string;

  /**
   * Descripción corta (por defecto «Vacaciones» en base de datos)
   */
  @Column({ default: 'Vacaciones' })
  name: string;

  /**
   * Fecha del calendario del permiso (columna `date` en PostgreSQL)
   */
  @Column({ name: 'date', type: 'date' })
  calendarDate: string;

  /**
   * Fecha y hora de creación del registro
   */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /**
   * Fecha y hora de última actualización
   */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  /**
   * Vínculo usuario–empresa asociado
   */
  @ManyToOne(() => UserEnterprise, (link) => link.vacations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_enterprise_id' })
  userEnterprise: UserEnterprise;
}
