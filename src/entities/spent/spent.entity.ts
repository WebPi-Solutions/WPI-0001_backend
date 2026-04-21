import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Supplier } from '../supplier/supplier.entity';
import { SpentConcept } from 'src/models/Concept';

/**
 * Entidad Gasto que representa la tabla spents en la base de datos
 * Almacena información sobre gastos asociados con proveedores
 */
@Entity('spents')
export class Spent {
  /**
   * Identificador único para el registro de gasto
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * ID del proveedor asociado con este gasto
   */
  @Column({ name: 'supplier_id' })
  supplierId: string;

  /**
   * Nombre del gasto
   */
  @Column()
  name: string;

  /**
   * Fecha en que se emitió el gasto
   */
  @Column({ name: 'issued_date', type: 'date' })
  issuedDate: Date;

  /**
   * Fecha en que vence el gasto para su cobro
   */
  @Column({ name: 'collection_date', type: 'date' })
  collectionDate: Date;

  /**
   * Fecha en que se declaró el gasto
   */
  @Column({ name: 'declaration_date', type: 'date' })
  declarationDate: Date;

  /**
   * Array JSON que almacena los conceptos o ítems incluidos en este gasto
   * Cada concepto incluye un campo percentage para indicar el % imputable a la empresa
   */
  @Column({ type: 'jsonb', default: '[]' })
  concepts: SpentConcept[];

  /**
   * Estado actual del gasto (ej., 'pagado', 'pendiente', etc.)
   */
  @Column()
  status: string;
  
  /**
   * Flag para indicar si el gasto tiene un archivo adjunto
   */
  @Column({ nullable: true, name: 'file' })
  file: boolean;

  /**
   * Fecha en que se creó el registro de gasto en el sistema
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * Fecha en que se actualizó el registro de gasto en el sistema
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * Relación con Proveedor - El proveedor asociado con este gasto
   */
  @ManyToOne(() => Supplier, supplier => supplier.spents)
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;
} 