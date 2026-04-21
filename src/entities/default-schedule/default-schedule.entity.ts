import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Enterprise } from '../enterprise/enterprise.entity';
import { UserEnterprise } from '../user/user-enterprise.entity';

/**
 * Plantilla de horario laboral por defecto asociada a una empresa (tabla default_schedules).
 * El campo JSON `schedule` almacena la definición recurrente del calendario laboral.
 */
@Entity('default_schedules')
export class DefaultSchedule {
  /**
   * Identificador único de la plantilla
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Empresa propietaria de la plantilla
   */
  @Column({ name: 'enterprise_id' })
  enterpriseId: string;

  /**
   * Nombre descriptivo de la plantilla
   */
  @Column()
  name: string;

  /**
   * Texto libre opcional para identificar o contextualizar la plantilla.
   * En PostgreSQL se persiste como `varchar` sin límite de longitud (equivalente a texto ilimitado).
   */
  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  /**
   * Definición del horario en formato JSON (días, franjas, etc.)
   */
  @Column({ type: 'jsonb' })
  schedule: Record<string, unknown>;

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
   * Empresa a la que pertenece esta plantilla
   */
  @ManyToOne(() => Enterprise, enterprise => enterprise.defaultSchedules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'enterprise_id' })
  enterprise: Enterprise;

  /**
   * Vínculos usuario–empresa que usan esta plantilla como horario por defecto en esa empresa.
   */
  @OneToMany(() => UserEnterprise, userEnterprise => userEnterprise.defaultSchedule)
  userEnterpriseLinks: UserEnterprise[];
}

