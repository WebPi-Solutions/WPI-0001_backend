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
   * Identificador del vínculo usuario–empresa que realiza el fichaje.
   * En un sistema multi-empresa, los fichajes pertenecen a una relación concreta (`user_enterprise`),
   * no al usuario global.
   */
  @Column({ name: 'user_enterprise_id' })
  userEnterpriseId: string;

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
   * Anulación lógica: true si el registro dejó de mostrarse en listados
   * (p. ej. tras «eliminar» desde la app; en base de datos no se borra la fila).
   */
  @Column({ name: 'cancelled', type: 'boolean', default: false })
  cancelled: boolean;

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
  @ManyToOne(() => UserEnterprise, (link) => link.signings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_enterprise_id' })
  userEnterprise: UserEnterprise;

  /**
   * Número de filas en `signings_updates` asociadas a este fichaje.
   * No es columna de base de datos: el repositorio lo calcula en las lecturas que devuelve la API.
   */
  updatesCount?: number;
}
