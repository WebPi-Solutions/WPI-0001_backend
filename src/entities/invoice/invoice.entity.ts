import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Client } from '../client/client.entity';
import { InvoiceSeries } from '../invoice-series/invoice-series.entity';
import { Concept } from '../../models/Concept';
import { Quote } from '../quote/quote.entity';

export enum InvoiceStatus {
  DRAFT = 'draft',
  ISSUED = 'issued',
  PAID = 'paid',
  PARTIALLY_PAID = 'partially_paid',
  CANCELLED = 'cancelled',
}

/**
 * Entidad Factura que representa la tabla invoices en la base de datos
 * Almacena información sobre facturas emitidas a clientes
 */
@Entity('invoices')
export class Invoice {
  /**
   * Identificador único para la factura
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * ID del cliente asociado con esta factura
   */
  @Column({ name: 'client_id' })
  clientId: string;

  /**
   * ID de la serie de factura (opcional)
   */
  @Column({ name: 'series_id', nullable: true })
  seriesId: string;

  /**
   * ID de la cotización asociada a esta factura (opcional)
   */
  @Column({ name: 'quote_id', nullable: true })
  quoteId: string;

  /**
   * Número secuencial dentro de la serie
   */
  @Column({ name: 'series_number', nullable: true })
  seriesNumber: number;

  /**
   * Nombre de la factura
   */
  @Column()
  name: string;

  /**
   * Fecha en que se emitió la factura
   */
  @Column({ name: 'issued_date', type: 'date' })
  issuedDate: Date;

  /**
   * Fecha en que vence la factura para su cobro
   */
  @Column({ name: 'collection_date', type: 'date' })
  collectionDate: Date;

  /**
   * Array JSON que almacena los conceptos o ítems incluidos en esta factura
   */
  @Column({ type: 'jsonb', default: '[]' })
  concepts: Concept[];

  /**
   * Estado actual de la factura (ej., 'pagada', 'pendiente', etc.)
   */
  @Column()
  status: InvoiceStatus;

  /**
   * Nombre del cliente (guardado en variable a parte para preservar los datos de la factura aún cuando se modifica la entidad Client)
   */
  @Column({ name: 'client_name', nullable: true })
  clientName: string;

  /**
   * NIF del cliente (guardado en variable a parte para preservar los datos de la factura aún cuando se modifica la entidad Client)
   */
  @Column({ name: 'client_nif', nullable: true })
  clientNif: string;

  /**
   * Dirección del cliente (guardado en variable a parte para preservar los datos de la factura aún cuando se modifica la entidad Client)
   */
  @Column({ name: 'client_address', nullable: true })
  clientAddress: string;

  /**
   * Nombre del emisor (guardado en variable a parte para preservar los datos de la factura aún cuando se modifica la entidad Client)
   */
  @Column({ name: 'issuer_name', nullable: true })
  issuerName: string;

  /**
   * NIF del emisor (guardado en variable a parte para preservar los datos de la factura aún cuando se modifica la entidad Client)
   */
  @Column({ name: 'issuer_nif', nullable: true })
  issuerNif: string;

  /**
   * Dirección del emisor (guardado en variable a parte para preservar los datos de la factura aún cuando se modifica la entidad Client)
   */
  @Column({ name: 'issuer_address', nullable: true })
  issuerAddress: string;

  /**
   * Cuenta bancaria del emisor (guardado en variable a parte para preservar los datos de la factura aún cuando se modifica la entidad Client)
   */
  @Column({ name: 'issuer_bank_account', nullable: true })
  issuerBankAccount: string;

  /**
   * Fecha en que se creó la factura en el sistema
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * Fecha en que se actualizó la factura en el sistema
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * Relación con Cliente - El cliente asociado con esta factura
   */
  @ManyToOne(() => Client, client => client.invoices)
  @JoinColumn({ name: 'client_id' })
  client: Client;

  /**
   * Relación con Serie de Factura - La serie a la que pertenece esta factura
   */
  @ManyToOne(() => InvoiceSeries, series => series.invoices)
  @JoinColumn({ name: 'series_id' })
  series: InvoiceSeries;

  /**
   * Relación con Cotizaciones - La cotización de la que proviene esta factura
   */
  @ManyToOne(() => Quote, quote => quote.invoices)
  @JoinColumn({ name: 'quote_id' })
  quote: Quote;
}