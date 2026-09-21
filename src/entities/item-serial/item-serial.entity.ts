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
import { Item } from '../item/item.entity';
import { ItemSerialStatus } from 'src/common/enums';
import { SpentConceptSerial } from '../spent-concept-serial/spent-concept-serial.entity';
import { InvoiceConceptSerial } from '../invoice-concept-serial/invoice-concept-serial.entity';
import { StockMovement } from '../stock-movement/stock-movement.entity';

/**
 * Identidad canónica de una unidad física con número de serie (`item_serials`).
 * El aislamiento por empresa se resuelve a través del artículo → categoría.
 */
@Entity('item_serials')
@Unique('item_serials_item_id_serial_number_key', ['itemId', 'serialNumber'])
export class ItemSerial {
  /**
   * Identificador único del número de serie
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Artículo al que pertenece esta unidad
   */
  @Column({ name: 'item_id' })
  itemId: string;

  /**
   * Número de serie recortado (sin cambiar el casing)
   */
  @Column({ name: 'serial_number', type: 'varchar' })
  serialNumber: string;

  /**
   * Estado de inventario de la unidad
   */
  @Column({
    name: 'status',
    type: 'enum',
    enum: ItemSerialStatus,
    enumName: 'item_serial_status',
  })
  status: ItemSerialStatus;

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
   * Artículo de catálogo propietario
   */
  @ManyToOne(() => Item, (item) => item.itemSerials, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  /**
   * Instantáneas de compra asociadas a esta unidad
   */
  @OneToMany(
    () => SpentConceptSerial,
    (spentConceptSerial) => spentConceptSerial.itemSerial,
  )
  spentConceptSerials: SpentConceptSerial[];

  /**
   * Instantáneas de venta asociadas a esta unidad
   */
  @OneToMany(
    () => InvoiceConceptSerial,
    (invoiceConceptSerial) => invoiceConceptSerial.itemSerial,
  )
  invoiceConceptSerials: InvoiceConceptSerial[];

  /**
   * Movimientos de kardex de esta unidad
   */
  @OneToMany(() => StockMovement, (stockMovement) => stockMovement.itemSerial)
  stockMovements: StockMovement[];
}
