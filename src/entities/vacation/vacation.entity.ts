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
   * Usuario al que pertenece el permiso
   */
  @Column({ name: 'user_id' })
  userId: string;

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
   * Usuario asociado
   */
  @ManyToOne(() => User, user => user.vacations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
