import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { SpentStatus } from 'src/common/enums';
import { Supplier } from '../supplier/supplier.entity';
import { SpentConcept } from '../spent-concept/spent-concept.entity';

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
   * Código opcional del gasto (referencia interna o de la factura del proveedor)
   */
  @Column({ nullable: true })
  code: string | null;

  /**
   * Nombre del gasto
   */
  @Column({ nullable: true })
  name: string | null;

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
   * Estado actual del gasto (pendiente, pagado, pago parcial o cancelado)
   */
  @Column()
  status: SpentStatus;
  
  /**
   * Flag para indicar si el gasto tiene un archivo adjunto
   */
  @Column({ name: 'file', default: false })
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

  /**
   * Líneas de concepto persistidas en `spent_concepts`
   */
  @OneToMany(() => SpentConcept, (spentConcept) => spentConcept.spent)
  spentConcepts: SpentConcept[];
}
