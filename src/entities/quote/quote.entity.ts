import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { QuoteStatus } from 'src/common/enums';
import { Client } from '../client/client.entity';
import { Invoice } from '../invoice/invoice.entity';
import { Order } from '../order/order.entity';
import { QuoteConcept } from '../quote-concept/quote-concept.entity';

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
  @Column({ nullable: true })
  name: string | null;

  /**
   * Fecha en que se emitió la cotización
   */
  @Column({ name: 'issued_date', type: 'date' })
  issuedDate: Date;

  /**
   * Fecha en que se convirtió en factura
   */
  @Column({ name: 'formalization_date', type: 'date', nullable: true })
  formalizationDate: Date | null;

  /**
   * Estado actual de la cotización (`draft`, `issued`, `ordered`, `converted`, `rejected`)
   */
  @Column()
  status: QuoteStatus;

  /**
   * Observaciones de la cotización
   */
  @Column({ nullable: true })
  observations: string | null;

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

  /**
   * Relación con Pedidos - Los pedidos generados a partir de esta cotización
   */
  @OneToMany(() => Order, (order) => order.quote)
  orders: Order[];

  /**
   * Líneas de concepto persistidas en `quote_concepts`
   */
  @OneToMany(() => QuoteConcept, (quoteConcept) => quoteConcept.quote)
  quoteConcepts: QuoteConcept[];
}
