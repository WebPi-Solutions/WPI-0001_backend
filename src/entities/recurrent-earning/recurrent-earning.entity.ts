import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Concept } from '../../models/Concept';
import { Client } from '../client/client.entity';
import { Enterprise } from '../enterprise/enterprise.entity';
import { Invoice } from '../invoice/invoice.entity';
import { InvoiceSeries } from '../invoice-series/invoice-series.entity';

/**
 * Periodicidad del ingreso recurrente (tipo PostgreSQL `recurrent_earnings_type`).
 */
export enum RecurrentEarningType {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

/**
 * Entidad Ingreso recurrente que representa la tabla recurrent_earnings.
 * Almacena la plantilla de facturación periódica asociada a un cliente y una serie.
 */
@Entity('recurrent_earnings')
export class RecurrentEarning {
  /**
   * Identificador único del ingreso recurrente.
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * ID de la empresa propietaria del ingreso recurrente.
   */
  @Column({ name: 'enterprise_id' })
  enterpriseId: string;

  /**
   * ID de la serie de factura usada al generar cada factura periódica.
   */
  @Column({ name: 'invoice_serie_id' })
  invoiceSerieId: string;

  /**
   * ID del cliente al que se factura de forma recurrente.
   */
  @Column({ name: 'client_id' })
  clientId: string;

  /**
   * Periodicidad del ingreso recurrente (mensual o anual). Por defecto mensual.
   */
  @ApiProperty({
    description: 'Periodicidad del ingreso recurrente',
    enum: RecurrentEarningType,
    default: RecurrentEarningType.MONTHLY,
    example: RecurrentEarningType.MONTHLY,
  })
  @Column({
    name: 'type',
    type: 'enum',
    enum: RecurrentEarningType,
    enumName: 'recurrent_earnings_type',
    default: RecurrentEarningType.MONTHLY,
  })
  type: RecurrentEarningType;

  /**
   * Nombre descriptivo del ingreso recurrente.
   */
  @Column()
  name: string;

  /**
   * Conceptos o ítems que se copiarán a cada factura generada.
   */
  @Column({ type: 'jsonb', default: '[]' })
  concepts: Concept[];

  /**
   * Fecha de creación del ingreso recurrente en el sistema.
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * Fecha de última actualización del ingreso recurrente.
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * Empresa propietaria de este ingreso recurrente.
   */
  @ManyToOne(() => Enterprise, enterprise => enterprise.recurrentEarnings)
  @JoinColumn({ name: 'enterprise_id' })
  enterprise: Enterprise;

  /**
   * Serie de factura asociada a este ingreso recurrente.
   */
  @ManyToOne(() => InvoiceSeries, invoiceSeries => invoiceSeries.recurrentEarnings)
  @JoinColumn({ name: 'invoice_serie_id' })
  invoiceSeries: InvoiceSeries;

  /**
   * Cliente al que se factura de forma recurrente.
   */
  @ManyToOne(() => Client, client => client.recurrentEarnings)
  @JoinColumn({ name: 'client_id' })
  client: Client;

  /**
   * Facturas generadas a partir de este ingreso recurrente.
   */
  @OneToMany(() => Invoice, invoice => invoice.recurrentEarning)
  invoices: Invoice[];
}
