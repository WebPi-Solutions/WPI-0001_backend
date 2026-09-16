import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Invoice } from '../invoice/invoice.entity';
import { Item } from '../item/item.entity';
import { InvoiceConceptSerial } from '../invoice-concept-serial/invoice-concept-serial.entity';
import { invoiceConceptNumericAmountTransformer } from './invoice-concept-numeric.transformer';

/**
 * Línea de concepto de una factura (`invoice_concepts`).
 * Instantánea fiscal: nombre, precios, IVA, EAN y vínculo opcional al artículo.
 * El aislamiento por empresa se resuelve a través de `invoice.client.enterpriseId`.
 */
@Entity('invoice_concepts')
@Unique('invoice_concepts_invoice_id_position_key', ['invoiceId', 'position'])
export class InvoiceConcept {
  /**
   * Identificador único de la línea
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Factura a la que pertenece la línea
   */
  @Column({ name: 'invoice_id' })
  invoiceId: string;

  /**
   * Artículo de catálogo de origen (nulo si la línea es texto libre)
   */
  @Column({ name: 'item_id', type: 'uuid', nullable: true })
  itemId: string | null;

  /**
   * Orden de la línea dentro de la factura (0-based)
   */
  @Column({ name: 'position', type: 'int' })
  position: number;

  /**
   * Descripción congelada en la línea
   */
  @Column({ name: 'name', type: 'varchar' })
  name: string;

  /**
   * Precio base unitario congelado. Columna `base_price`.
   */
  @Column({
    name: 'base_price',
    type: 'numeric',
    nullable: false,
    default: 0,
    transformer: invoiceConceptNumericAmountTransformer,
  })
  basePrice: number;

  /**
   * Porcentaje de IVA aplicado a la línea
   */
  @Column({ type: 'int', nullable: false, default: 21 })
  vat: number;

  /**
   * Porcentaje de IRPF aplicado a la línea
   */
  @Column({ type: 'int', nullable: false, default: 0 })
  irpf: number;

  /**
   * Unidades de la línea
   */
  @Column({ type: 'int', nullable: false, default: 1 })
  quantity: number;

  /**
   * EAN congelado (del artículo o informado a mano)
   */
  @Column({ name: 'ean', type: 'varchar', nullable: true })
  ean: string | null;

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
   * Factura propietaria
   */
  @ManyToOne(() => Invoice, (invoice) => invoice.invoiceConcepts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  /**
   * Artículo de origen. Si se borra el artículo, `item_id` queda a null y la instantánea permanece.
   */
  @ManyToOne(() => Item, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'item_id' })
  item: Item | null;

  /**
   * Números de serie asociados a esta línea
   */
  @OneToMany(
    () => InvoiceConceptSerial,
    (invoiceConceptSerial) => invoiceConceptSerial.invoiceConcept,
  )
  serials: InvoiceConceptSerial[];
}
