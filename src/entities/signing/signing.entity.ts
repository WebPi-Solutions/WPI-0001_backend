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
 * Valores del tipo PostgreSQL `signing_actions` (entrada/salida de fichaje).
 * Definido junto a la entidad para mantener el contrato en un único módulo.
 */
export enum SigningAction {
  START = 'start',
  END = 'end',
}

/**
 * Registro de fichaje de un usuario (tabla signings).
 */
@Entity('signings')
export class Signing {
  /**
   * Identificador único del fichaje
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Usuario que ficha
   */
  @Column({ name: 'user_id' })
  userId: string;

  /**
   * Tipo de acción: inicio o fin de jornada/franja (columna `action`, tipo enum en PostgreSQL)
   */
  @Column({
    name: 'action',
    type: 'enum',
    enum: SigningAction,
    enumName: 'signing_actions',
  })
  action: SigningAction;

  /**
   * Momento efectivo del fichaje (editable; distinto de createdAt de auditoría)
   */
  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  moment: Date;

  /**
   * Duración en segundos asociada al fichaje (opcional, p. ej. al cerrar franja)
   */
  @Column({ name: 'duration_in_seconds', type: 'int', nullable: true })
  durationInSeconds: number | null;

  /**
   * Marca de creación del registro (auditoría, no debe alterarse en negocio)
   */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /**
   * Marca de última actualización
   */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  /**
   * Usuario que realiza el fichaje
   */
  @ManyToOne(() => User, user => user.signings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
