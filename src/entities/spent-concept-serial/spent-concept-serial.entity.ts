import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { SpentConcept } from '../spent-concept/spent-concept.entity';

/**
 * Número de serie asociado a una línea de gasto (`spent_concept_serials`).
 * El aislamiento por empresa se resuelve a través de la línea → gasto → proveedor.
 */
@Entity('spent_concept_serials')
@Unique('spent_concept_serials_spent_concept_id_serial_number_key', [
  'spentConceptId',
  'serialNumber',
])
export class SpentConceptSerial {
  /**
   * Identificador único del número de serie
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Línea de gasto a la que pertenece este número de serie
   */
  @Column({ name: 'spent_concept_id' })
  spentConceptId: string;

  /**
   * Número de serie capturado en la línea
   */
  @Column({ name: 'serial_number', type: 'varchar' })
  serialNumber: string;

  /**
   * Fecha de creación del registro
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * Fecha de última actualización del registro
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * Línea de gasto propietaria
   */
  @ManyToOne(
    () => SpentConcept,
    (spentConcept) => spentConcept.serials,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'spent_concept_id' })
  spentConcept: SpentConcept;
}
