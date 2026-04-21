import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Client } from '../client/client.entity';
import { Concept } from '../../models/Concept';
import { Invoice } from '../invoice/invoice.entity';

export enum QuoteStatus {
  DRAFT = 'draft',
  ISSUED = 'issued',
  CONVERTED = 'converted',
  REJECTED = 'rejected'
}

/**
 * Entidad Cotización que representa la tabla quotes en la base de datos
 * Almacena información sobre cotizaciones emitidas a clientes
 */
@Entity('quotes')
export class Quote {
  /**
   * Identificador único para la cotización
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * ID del cliente asociado con esta cotización
   */
  @Column({ name: 'client_id' })
  clientId: string;

  /**
   * Nombre de la cotización
   */
  @Column()
  name: string;

  /**
   * Fecha en que se emitió la cotización
   */
  @Column({ name: 'issued_date', type: 'date' })
  issuedDate: Date;

  /**
   * Fecha en que se convirtió en factura
   */
  @Column({ name: 'formalization_date', type: 'date' })
  formalizationDate: Date;

  /**
   * Array JSON que almacena los conceptos o ítems incluidos en esta cotización
   */
  @Column({ type: 'jsonb', default: '[]' })
  concepts: Concept[];

  /**
   * Estado actual de la cotización (ej., 'pendiente', 'convertida', 'rechazada')
   */
  @Column()
  status: QuoteStatus;

  /**
   * Nombre del cliente (guardado en variable a parte para preservar los datos de la cotización aún cuando se modifica la entidad Client)
   */
  @Column({ name: 'client_name', nullable: true })
  clientName: string;

  /**
   * NIF del cliente (guardado en variable a parte para preservar los datos de la cotización aún cuando se modifica la entidad Client)
   */
  @Column({ name: 'client_nif', nullable: true })
  clientNif: string;

  /**
   * Dirección del cliente (guardado en variable a parte para preservar los datos de la cotización aún cuando se modifica la entidad Client)
   */
  @Column({ name: 'client_address', nullable: true })
  clientAddress: string;

  /**
   * Nombre del emisor (guardado en variable a parte para preservar los datos de la cotización aún cuando se modifica la entidad Client)
   */
  @Column({ name: 'issuer_name', nullable: true })
  issuerName: string;

  /**
   * NIF del emisor (guardado en variable a parte para preservar los datos de la cotización aún cuando se modifica la entidad Client)
   */
  @Column({ name: 'issuer_nif', nullable: true })
  issuerNif: string;

  /**
   * Dirección del emisor (guardado en variable a parte para preservar los datos de la cotización aún cuando se modifica la entidad Client)
   */
  @Column({ name: 'issuer_address', nullable: true })
  issuerAddress: string;

  /**
   * Fecha en que se creó la cotización en el sistema
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * Fecha en que se actualizó la cotización en el sistema
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * Relación con Cliente - El cliente asociado con esta cotización
   */
  @ManyToOne(() => Client, client => client.quotes)
  @JoinColumn({ name: 'client_id' })
  client: Client;

  /**
   * Relación con Facturas - Las facturas asociadas con esta cotización
   */
  @OneToMany(() => Invoice, invoice => invoice.quote)
  invoices: Invoice[];
}