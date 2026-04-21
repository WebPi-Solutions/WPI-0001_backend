import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Enterprise } from '../enterprise/enterprise.entity';

/**
 * Día festivo o no laborable por empresa (tabla holidays).
 */
@Entity('holidays')
export class Holiday {
  /**
   * Identificador único del festivo
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Empresa a la que aplica el festivo
   */
  @Column({ name: 'enterprise_id' })
  enterpriseId: string;

  /**
   * Etiqueta del festivo (por defecto «Festivo» en base de datos)
   */
  @Column({ default: 'Festivo' })
  name: string;

  /**
   * Fecha del calendario del festivo (columna `date` en PostgreSQL)
   */
  @Column({ name: 'date', type: 'date' })
  calendarDate: string;

  /**
   * Color del evento en el calendario (`#RRGGBB`)
   */
  @Column({ name: 'calendar_color', type: 'varchar', length: 7, default: '#00A76F' })
  calendarColor: string;

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
   * Empresa propietaria del calendario de festivos
   */
  @ManyToOne(() => Enterprise, enterprise => enterprise.holidays, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'enterprise_id' })
  enterprise: Enterprise;
}
