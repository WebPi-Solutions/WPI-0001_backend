import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { PaymentMethod } from 'src/common/enums';
import { Enterprise } from '../enterprise/enterprise.entity';
import { Invoice } from '../invoice/invoice.entity';
import { Quote } from '../quote/quote.entity';
import { RecurrentEarning } from '../recurrent-earning/recurrent-earning.entity';
import { Order } from '../order/order.entity';

/**
 * Tipo de cliente persistido en `clients.type`.
 * El valor `particular` sustituye al antiguo `individual`.
 */
export enum ClientType {
  COMPANY = 'company',
  PARTICULAR = 'particular',
}

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
   * Tipo de cliente (`company` o `particular`)
   */
  @Column({ nullable: true })
  type: string;

  /**
   * Número de cuenta bancaria del cliente
   */
  @Column({ name: 'account_number', nullable: true })
  accountNumber: string;

  /**
   * Método de pago preferido del cliente (enum PostgreSQL `payment_methods`).
   */
  @Column({
    name: 'payment_method',
    type: 'enum',
    enum: PaymentMethod,
    enumName: 'payment_methods',
    default: PaymentMethod.BANK_TRANSFER,
  })
  paymentMethod: PaymentMethod;

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

  /**
   * Relación con Pedidos - Todos los pedidos asociados con este cliente
   */
  @OneToMany(() => Order, (order) => order.client)
  orders: Order[];

  /**
   * Relación con Ingresos recurrentes - Todas las plantillas periódicas de este cliente
   */
  @OneToMany(() => RecurrentEarning, recurrentEarning => recurrentEarning.client)
  recurrentEarnings: RecurrentEarning[];
} 