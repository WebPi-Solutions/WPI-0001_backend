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
 * Franja de trabajo efectiva de un usuario (tabla schedules).
 * Representa un intervalo concreto entre `startsAt` y `endsAt` con zona horaria.
 */
@Entity('schedules')
export class WorkSchedule {
  /**
   * Identificador único de la franja
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Identificador del vínculo usuario–empresa propietario de la franja.
   * En multi-empresa, las franjas deben colgar del vínculo (`user_enterprise`).
   */
  @Column({ name: 'user_enterprise_id' })
  userEnterpriseId: string;

  /**
   * Inicio del periodo trabajado (timestamptz)
   */
  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  /**
   * Fin del periodo trabajado (timestamptz)
   */
  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt: Date;

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
  @ManyToOne(() => UserEnterprise, (link) => link.workSchedules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_enterprise_id' })
  userEnterprise: UserEnterprise;
}
