import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Enterprise } from '../enterprise/enterprise.entity';
import { Spent } from '../spent/spent.entity';

/**
 * Entidad Proveedor que representa la tabla suppliers en la base de datos
 * Almacena información sobre proveedores asociados con empresas
 */
@Entity('suppliers')
export class Supplier {
  /**
   * Identificador único para el proveedor
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * ID de la empresa a la que pertenece este proveedor
   */
  @Column({ name: 'enterprise_id' })
  enterpriseId: string;

  /**
   * Nombre del proveedor
   */
  @Column()
  name: string;

  /**
   * NIF (Número de Identificación Fiscal) del proveedor
   */
  @Column()
  nif: string;

  /**
   * Dirección de correo electrónico del proveedor
   */
  @Column({ nullable: true })
  email: string;

  /**
   * Número de teléfono del proveedor
   */
  @Column({ nullable: true })
  phone: string;

  /**
   * Dirección física del proveedor
   */
  @Column({ nullable: true })
  address: string;

  /**
   * Tipo de proveedor
   */
  @Column({ nullable: true })
  type: string;

  /**
   * Número de cuenta bancaria del proveedor
   */
  @Column({ name: 'account_number', nullable: true })
  accountNumber: string;

  /**
   * Estado de recargo de equivalencia del proveedor
   */
  @Column({ name: 'equivalence_surcharge', nullable: true })
  equivalenceSurcharge: string;

  /**
   * Descripción adicional sobre el proveedor
   */
  @Column({ nullable: true })
  description: string;

  /**
   * Fecha en que se creó el proveedor en el sistema
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * Fecha en que se actualizó el proveedor en el sistema
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * Relación con Empresa - La empresa a la que pertenece este proveedor
   */
  @ManyToOne(() => Enterprise, enterprise => enterprise.suppliers)
  @JoinColumn({ name: 'enterprise_id' })
  enterprise: Enterprise;

  /**
   * Relación con Gastos - Todos los registros de gastos asociados con este proveedor
   */
  @OneToMany(() => Spent, spent => spent.supplier)
  spents: Spent[];
} 