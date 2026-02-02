import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Enterprise } from '../enterprise/enterprise.entity';
import { Invoice } from '../invoice/invoice.entity';
import { Quote } from '../quote/quote.entity';

/**
 * Entidad Cliente que representa la tabla clients en la base de datos
 * Almacena información sobre clientes asociados con empresas
 */
@Entity('clients')
export class Client {
  /**
   * Identificador único para el cliente
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * ID de la empresa a la que pertenece este cliente
   */
  @Column({ name: 'enterprise_id' })
  enterpriseId: string;

  /**
   * Nombre del cliente
   */
  @Column()
  name: string;

  /**
   * NIF (Número de Identificación Fiscal) del cliente
   */
  @Column()
  nif: string;

  /**
   * Dirección de correo electrónico del cliente
   */
  @Column({ nullable: true })
  email: string;

  /**
   * Número de teléfono del cliente
   */
  @Column({ nullable: true })
  phone: string;

  /**
   * Dirección física del cliente
   */
  @Column({ nullable: true })
  address: string;

  /**
   * Tipo de cliente
   */
  @Column({ nullable: true })
  type: string;

  /**
   * Número de cuenta bancaria del cliente
   */
  @Column({ name: 'account_number', nullable: true })
  accountNumber: string;

  /**
   * Estado de recargo de equivalencia del cliente
   */
  @Column({ name: 'equivalence_surcharge', nullable: true })
  equivalenceSurcharge: string;

  /**
   * Descripción adicional sobre el cliente
   */
  @Column({ nullable: true })
  description: string;

  /**
   * Fecha en que se creó el cliente en el sistema
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * Fecha en que se actualizó el cliente en el sistema
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * Relación con Empresa - La empresa a la que pertenece este cliente
   */
  @ManyToOne(() => Enterprise, enterprise => enterprise.clients)
  @JoinColumn({ name: 'enterprise_id' })
  enterprise: Enterprise;

  /**
   * Relación con Facturas - Todas las facturas asociadas con este cliente
   */
  @OneToMany(() => Invoice, invoice => invoice.client)
  invoices: Invoice[];

  /**
   * Relación con Cotizaciones - Todas las cotizaciones asociadas con este cliente
   */
  @OneToMany(() => Quote, quote => quote.client)
  quotes: Quote[];
} 