import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../user/user.entity';

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
   * Usuario al que pertenece la franja
   */
  @Column({ name: 'user_id' })
  userId: string;

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
   * Usuario asociado
   */
  @ManyToOne(() => User, user => user.workSchedules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
