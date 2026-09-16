import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Quote } from '../quote/quote.entity';
import { Item } from '../item/item.entity';
import { quoteConceptNumericAmountTransformer } from './quote-concept-numeric.transformer';

/**
 * Línea de concepto de un presupuesto (`quote_concepts`).
 * Instantánea comercial: nombre, precios, IVA, EAN y vínculo opcional al artículo.
 * El aislamiento por empresa se resuelve a través de `quote.client.enterpriseId`.
 */
@Entity('quote_concepts')
@Unique('quote_concepts_quote_id_position_key', ['quoteId', 'position'])
export class QuoteConcept {
  /**
   * Identificador único de la línea
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Presupuesto al que pertenece la línea
   */
  @Column({ name: 'quote_id' })
  quoteId: string;

  /**
   * Artículo de catálogo de origen (nulo si la línea es texto libre)
   */
  @Column({ name: 'item_id', type: 'uuid', nullable: true })
  itemId: string | null;

  /**
   * Orden de la línea dentro del presupuesto (0-based)
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
    transformer: quoteConceptNumericAmountTransformer,
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
   * Presupuesto propietario
   */
  @ManyToOne(() => Quote, (quote) => quote.quoteConcepts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quote_id' })
  quote: Quote;

  /**
   * Artículo de origen. Si se borra el artículo, `item_id` queda a null y la instantánea permanece.
   */
  @ManyToOne(() => Item, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'item_id' })
  item: Item | null;
}
