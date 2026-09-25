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
import { Spent } from '../spent/spent.entity';

/** Categoría de gastos de una empresa (tabla `spent_categories`). */
@Entity('spent_categories')
export class SpentCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'enterprise_id' })
  enterpriseId: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Enterprise, (enterprise) => enterprise.spentCategories)
  @JoinColumn({ name: 'enterprise_id' })
  enterprise: Enterprise;

  @OneToMany(() => Spent, (spent) => spent.spentCategory)
  spents: Spent[];
}
