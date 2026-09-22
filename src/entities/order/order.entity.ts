import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { DEFAULT_ORDER_STATUS, OrderStatus } from 'src/common/enums';
import { Client } from '../client/client.entity';
import { Quote } from '../quote/quote.entity';
import { OrderConcept } from '../order-concept/order-concept.entity';

/**
 * Entidad Pedido que representa la tabla `orders` en la base de datos.
 * El tenant se resuelve a través del cliente; el presupuesto de origen es obligatorio.
 */
@Entity('orders')
export class Order {
  /**
   * Identificador único del pedido
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * ID del cliente asociado a este pedido
   */
  @Column({ name: 'client_id' })
  clientId: string;

  /**
   * ID del presupuesto del que proviene este pedido
   */
  @Column({ name: 'quote_id' })
  quoteId: string;

  /**
   * Nombre o referencia del pedido
   */
  @Column({ nullable: true })
  name: string | null;

  /**
   * Fecha del pedido
   */
  @Column({ type: 'date' })
  date: Date;

  /**
   * Estado actual del pedido (`awaiting_receipt`, `received`, `invoiced`)
   */
  @Column({
    type: 'enum',
    enum: OrderStatus,
    enumName: 'order_status',
    default: DEFAULT_ORDER_STATUS,
  })
  status: OrderStatus;

  /**
   * Nombre del cliente congelado en el pedido
   */
  @Column({ name: 'client_name', nullable: true })
  clientName: string;

  /**
   * NIF del cliente congelado en el pedido
   */
  @Column({ name: 'client_nif', nullable: true })
  clientNif: string;

  /**
   * Dirección del cliente congelada en el pedido
   */
  @Column({ name: 'client_address', nullable: true })
  clientAddress: string;

  /**
   * Nombre del emisor congelado en el pedido
   */
  @Column({ name: 'issuer_name', nullable: true })
  issuerName: string;

  /**
   * NIF del emisor congelado en el pedido
   */
  @Column({ name: 'issuer_nif', nullable: true })
  issuerNif: string;

  /**
   * Dirección del emisor congelada en el pedido
   */
  @Column({ name: 'issuer_address', nullable: true })
  issuerAddress: string;

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
   * Cliente asociado al pedido
   */
  @ManyToOne(() => Client, (client) => client.orders)
  @JoinColumn({ name: 'client_id' })
  client: Client;

  /**
   * Presupuesto de origen del pedido
   */
  @ManyToOne(() => Quote, (quote) => quote.orders)
  @JoinColumn({ name: 'quote_id' })
  quote: Quote;

  /**
   * Líneas de concepto persistidas en `order_concepts`
   */
  @OneToMany(() => OrderConcept, (orderConcept) => orderConcept.order)
  orderConcepts: OrderConcept[];
}
