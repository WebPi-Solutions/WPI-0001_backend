import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Enterprise } from '../enterprise/enterprise.entity';

/**
 * Configuración de una empresa almacenada como clave y valor.
 */
@Entity('enterprise_settings')
export class EnterpriseSettings {
  /** Identificador único de la configuración. */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Identificador de la empresa propietaria. */
  @Column({ name: 'enterprise_id' })
  enterpriseId: string;

  /** Indica si el valor puede modificarse desde la configuración de empresa. */
  @Column()
  editable: boolean;

  /** Clave de configuración. */
  @Column({ name: 'key' })
  key: string;

  /** Valor textual de configuración. */
  @Column({ name: 'value' })
  value: string;

  /** Fecha de creación. */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /** Fecha de última actualización. */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /** Empresa propietaria de la configuración. */
  @ManyToOne(() => Enterprise, (enterprise) => enterprise.settings, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'enterprise_id' })
  enterprise: Enterprise;
}
