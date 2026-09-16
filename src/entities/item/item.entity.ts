import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ItemCategory } from '../item-category/item-category.entity';
import { itemNumericAmountTransformer } from './item-numeric.transformer';

/**
 * Artículo persistido en la tabla `items`.
 * El aislamiento por empresa se resuelve a través de su categoría.
 */
@Entity('items')
export class Item {
  /**
   * Identificador único del artículo
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Categoría a la que pertenece el artículo
   */
  @Column({ name: 'item_category_id' })
  itemCategoryId: string;

  /**
   * Nombre del artículo
   */
  @Column()
  name: string;

  /**
   * Descripción opcional del artículo
   */
  @Column({ nullable: true })
  description: string;

  /**
   * Precio de venta al público. Columna `price_pvp`, NOT NULL con default 0.
   */
  @Column({
    name: 'price_pvp',
    type: 'numeric',
    nullable: false,
    default: 0,
    transformer: itemNumericAmountTransformer,
  })
  pricePvp: number;

  /**
   * Último precio de compra. Columna `last_purchase_price`, NOT NULL con default 0.
   */
  @Column({
    name: 'last_purchase_price',
    type: 'numeric',
    nullable: false,
    default: 0,
    transformer: itemNumericAmountTransformer,
  })
  lastPurchasePrice: number;

  /**
   * Indica si el artículo se gestiona con número de serie.
   * Columna `serial_number`, NOT NULL con default false.
   */
  @Column({
    name: 'serial_number',
    type: 'boolean',
    nullable: false,
    default: false,
  })
  serialNumber: boolean;

  /**
   * Código EAN opcional del artículo. Columna `ean`, nullable.
   */
  @Column({ name: 'ean', type: 'varchar', nullable: true })
  ean: string | null;

  /**
   * Indica si el artículo gestiona stock.
   * Columna `stock`, NOT NULL con default false.
   */
  @Column({
    name: 'stock',
    type: 'boolean',
    nullable: false,
    default: false,
  })
  stock: boolean;

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
   * Categoría que agrupa este artículo
   */
  @ManyToOne(() => ItemCategory, (itemCategory) => itemCategory.items)
  @JoinColumn({ name: 'item_category_id' })
  itemCategory: ItemCategory;
}
