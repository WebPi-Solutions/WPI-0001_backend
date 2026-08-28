import { ApiHideProperty } from '@nestjs/swagger';
import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Client } from '../client/client.entity';
import { UserEnterprise } from '../user/user-enterprise.entity';
import { Supplier } from '../supplier/supplier.entity';
import { InvoiceSeries } from '../invoice-series/invoice-series.entity';
import { DefaultSchedule } from '../default-schedule/default-schedule.entity';
import { Holiday } from '../holiday/holiday.entity';
import { RecurrentEarning } from '../recurrent-earning/recurrent-earning.entity';

/**
 * Entidad Empresa que representa la tabla enterprises en la base de datos
 * Almacena información sobre empresas en el sistema
 */
@Entity('enterprises')
export class Enterprise {
  /**
   * Identificador único para la empresa
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Nombre de la empresa
   */
  @Column()
  name: string;

  /**
   * Dirección de correo electrónico de la empresa
   */
  @Column()
  email: string;

  /**
   * NIF (Número de Identificación Fiscal) de la empresa
   */
  @Column()
  nif: string;

  /**
   * Número de teléfono de la empresa
   */
  @Column({ nullable: true })
  phone: string;

  /**
   * Dirección física de la empresa
   */
  @Column({ nullable: true })
  address: string;

  /**
   * Cuenta bancaria de la empresa
   */
  @Column({ nullable: true, name: 'bank_account' })
  bankAccount: string;

  /**
   * Nombre del archivo del logo de la empresa en Dropbox
   */
  @Column({ nullable: true })
  logo: string;

  /**
   * Identificador del cliente en Stripe (solo uso interno; no exponer al frontend).
   */
  @ApiHideProperty()
  @Column({ name: 'stripe_id', nullable: true })
  stripeId: string | null;

  /**
   * Fecha en que se creó la empresa en el sistema
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * Fecha en que se actualizó la empresa en el sistema
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * Relación con Clientes - Todos los clientes asociados a esta empresa
   */
  @OneToMany(() => Client, client => client.enterprise)
  clients: Client[];

  /**
   * Relación con Proveedores - Todos los proveedores asociados a esta empresa
   */
  @OneToMany(() => Supplier, supplier => supplier.enterprise)
  suppliers: Supplier[];

  /**
   * Relación con UsuarioEmpresa - Todas las asociaciones de usuarios con esta empresa
   */
  @OneToMany(() => UserEnterprise, userEnterprise => userEnterprise.enterprise)
  userEnterprises: UserEnterprise[];

  /**
   * Relación con Series de Factura - Todas las series de factura asociadas a esta empresa
   */
  @OneToMany(() => InvoiceSeries, invoiceSeries => invoiceSeries.enterprise)
  invoiceSeries: InvoiceSeries[];

  /**
   * Plantillas de horario por defecto definidas para la empresa (fichajes)
   */
  @OneToMany(() => DefaultSchedule, defaultSchedule => defaultSchedule.enterprise)
  defaultSchedules: DefaultSchedule[];

  /**
   * Festivos y días no laborables de la empresa (fichajes)
   */
  @OneToMany(() => Holiday, holiday => holiday.enterprise)
  holidays: Holiday[];

  /**
   * Relación con Ingresos recurrentes - Plantillas de facturación periódica de la empresa
   */
  @OneToMany(() => RecurrentEarning, recurrentEarning => recurrentEarning.enterprise)
  recurrentEarnings: RecurrentEarning[];
} 