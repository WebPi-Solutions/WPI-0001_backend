import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Invoice } from '../invoice/invoice.entity';
import { Enterprise } from '../enterprise/enterprise.entity';
import { RecurrentEarning } from '../recurrent-earning/recurrent-earning.entity';

/**
 * Entidad Serie de Factura que representa la tabla invoice_series en la base de datos
 * Almacena información sobre series de facturas utilizadas para organizar facturas
 */
@Entity('invoice_series')
export class InvoiceSeries {
  /**
   * Identificador único para la serie de factura
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * ID de la empresa a la que pertenece esta serie de factura
   */
  @Column({ name: 'enterprise_id' })
  enterpriseId: string;

  /**
   * Identificador de serie (ej., A, B, C)
   */
  @Column()
  series: string;

  /**
   * Descripción de esta serie de factura
   */
  @Column({ nullable: true })
  description: string;

  /**
   * Fecha en que se creó la serie de factura
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * Fecha en que se actualizó la serie de factura por última vez
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * Relación con Empresas - La empresa que utiliza esta serie de factura
   */
  @ManyToOne(() => Enterprise, enterprise => enterprise.invoiceSeries)
  @JoinColumn({ name: 'enterprise_id' })
  enterprise: Enterprise;

  /**
   * Relación con Facturas - Todas las facturas asociadas con esta serie
   */
  @OneToMany(() => Invoice, invoice => invoice.series)
  invoices: Invoice[];

  /**
   * Relación con Ingresos recurrentes - Plantillas periódicas que usan esta serie
   */
  @OneToMany(() => RecurrentEarning, recurrentEarning => recurrentEarning.invoiceSeries)
  recurrentEarnings: RecurrentEarning[];
} 