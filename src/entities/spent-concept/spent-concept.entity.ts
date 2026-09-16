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
import { Spent } from '../spent/spent.entity';
import { Item } from '../item/item.entity';
import { SpentConceptSerial } from '../spent-concept-serial/spent-concept-serial.entity';
import { spentConceptNumericAmountTransformer } from './spent-concept-numeric.transformer';

/**
 * Línea de concepto de un gasto (`spent_concepts`).
 * Instantánea: nombre, precios, IVA, EAN y vínculo opcional al artículo.
 * El aislamiento por empresa se resuelve a través de `spent.supplier.enterpriseId`.
 */
@Entity('spent_concepts')
@Unique('spent_concepts_spent_id_position_key', ['spentId', 'position'])
export class SpentConcept {
  /**
   * Identificador único de la línea
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Gasto al que pertenece la línea
   */
  @Column({ name: 'spent_id' })
  spentId: string;

  /**
   * Artículo de catálogo de origen (nulo si la línea es texto libre)
   */
  @Column({ name: 'item_id', type: 'uuid', nullable: true })
  itemId: string | null;

  /**
   * Orden de la línea dentro del gasto (0-based)
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
    transformer: spentConceptNumericAmountTransformer,
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
   * Gasto propietario
   */
  @ManyToOne(() => Spent, (spent) => spent.spentConcepts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'spent_id' })
  spent: Spent;

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
    () => SpentConceptSerial,
    (spentConceptSerial) => spentConceptSerial.spentConcept,
  )
  serials: SpentConceptSerial[];
}
