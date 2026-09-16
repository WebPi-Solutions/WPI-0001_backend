import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Enterprise } from '../enterprise/enterprise.entity';
import { Item } from '../item/item.entity';

/**
 * Categoría de artículos de una empresa (tabla `item_categories`).
 * El tenant se persiste en la columna física `enterprise_id`.
 */
@Entity('item_categories')
export class ItemCategory {
  /**
   * Identificador único de la categoría
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Empresa propietaria de la categoría (columna `enterprise_id`)
   */
  @Column({ name: 'enterprise_id' })
  enterpriseId: string;

  /**
   * Nombre de la categoría
   */
  @Column()
  name: string;

  /**
   * Descripción opcional de la categoría
   */
  @Column({ nullable: true })
  description: string;

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
   * Empresa a la que pertenece esta categoría
   */
  @ManyToOne(() => Enterprise, (enterprise) => enterprise.itemCategories)
  @JoinColumn({ name: 'enterprise_id' })
  enterprise: Enterprise;

  /**
   * Artículos agrupados en esta categoría
   */
  @OneToMany(() => Item, (item) => item.itemCategory)
  items: Item[];
}
