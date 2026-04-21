import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEnterprise } from '../user/user-enterprise.entity';
import { Signing, SigningAction } from './signing.entity';

/**
 * Fila de histórico en `signings_updates`: un parche manual sobre un fichaje (antes / después).
 */
@Entity('signings_updates')
export class SigningUpdate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_enterprise_id' })
  userEnterpriseId: string;

  @ManyToOne(() => UserEnterprise, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_enterprise_id' })
  userEnterprise: UserEnterprise;

  @Column({ name: 'signings_id' })
  signingsId: string;

  @ManyToOne(() => Signing, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'signings_id' })
  signing: Signing;

  @Column({ name: 'previous_moment', type: 'timestamptz' })
  previousMoment: Date;

  @Column({ name: 'updated_moment', type: 'timestamptz' })
  updatedMoment: Date;

  @Column({
    name: 'previous_action',
    type: 'enum',
    enum: SigningAction,
    enumName: 'signing_actions',
  })
  previousAction: SigningAction;

  @Column({
    name: 'updated_action',
    type: 'enum',
    enum: SigningAction,
    enumName: 'signing_actions',
  })
  updatedAction: SigningAction;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
