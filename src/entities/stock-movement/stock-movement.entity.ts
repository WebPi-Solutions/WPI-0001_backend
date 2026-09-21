import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Item } from '../item/item.entity';
import { ItemSerial } from '../item-serial/item-serial.entity';
import { InvoiceConcept } from '../invoice-concept/invoice-concept.entity';
import { SpentConcept } from '../spent-concept/spent-concept.entity';
import { StockDirection, StockType } from 'src/common/enums';

/**
 * Movimiento de kardex de un artículo (`stock_movements`).
 * El aislamiento por empresa se resuelve a través del artículo → categoría.
 */
@Entity('stock_movements')
export class StockMovement {
  /**
   * Identificador único del movimiento
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Artículo afectado
   */
  @Column({ name: 'item_id' })
  itemId: string;

  /**
   * Unidad con número de serie, nulo en artículos solo por cantidad
   */
  @Column({ name: 'item_serial_id', type: 'uuid', nullable: true })
  itemSerialId: string | null;

  /**
   * Línea de factura origen, nulo si el movimiento nace de un gasto
   */
  @Column({ name: 'invoice_concept_id', type: 'uuid', nullable: true })
  invoiceConceptId: string | null;

  /**
   * Línea de gasto origen, nulo si el movimiento nace de una factura
   */
  @Column({ name: 'spent_concept_id', type: 'uuid', nullable: true })
  spentConceptId: string | null;

  /**
   * Unidades movidas (siempre positivo; en series siempre 1)
   */
  @Column({ type: 'int' })
  quantity: number;

  /**
   * Dirección del movimiento
   */
  @Column({
    name: 'direction',
    type: 'enum',
    enum: StockDirection,
    enumName: 'stock_directions',
  })
  direction: StockDirection;

  /**
   * Tipo de movimiento
   */
  @Column({
    name: 'type',
    type: 'enum',
    enum: StockType,
    enumName: 'stock_types',
  })
  type: StockType;

  /**
   * Momento del movimiento (fecha del documento)
   */
  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;

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
   * Artículo afectado
   */
  @ManyToOne(() => Item, (item) => item.stockMovements)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  /**
   * Unidad serializada, si aplica
   */
  @ManyToOne(() => ItemSerial, (itemSerial) => itemSerial.stockMovements, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'item_serial_id' })
  itemSerial: ItemSerial | null;

  /**
   * Línea de factura origen
   */
  @ManyToOne(() => InvoiceConcept, { nullable: true })
  @JoinColumn({ name: 'invoice_concept_id' })
  invoiceConcept: InvoiceConcept | null;

  /**
   * Línea de gasto origen
   */
  @ManyToOne(() => SpentConcept, { nullable: true })
  @JoinColumn({ name: 'spent_concept_id' })
  spentConcept: SpentConcept | null;
}
