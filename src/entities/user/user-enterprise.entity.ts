import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, RelationId, Unique, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { Enterprise } from '../enterprise/enterprise.entity';
import { DefaultSchedule } from '../default-schedule/default-schedule.entity';
import { Signing } from '../signing/signing.entity';
import { Vacation } from '../vacation/vacation.entity';
import { WorkSchedule } from '../work-schedule/work-schedule.entity';

/**
 * Entidad UsuarioEmpresa que representa la tabla user_enterprise en la base de datos
 * Esta es una tabla de unión que gestiona la relación muchos a muchos
 * entre usuarios y empresas con información adicional de rol
 */
@Entity('user_enterprise')
@Unique('user_enterprise_enterprise_id_card_id_key', ['enterpriseId', 'cardId'])
export class UserEnterprise {
  /**
   * Identificador único del vínculo usuario–empresa.
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * ID de Usuario.
   */
  @Column({ name: 'user_id' })
  userId: string;

  /**
   * ID de Empresa.
   */
  @Column({ name: 'enterprise_id' })
  enterpriseId: string;

  /**
   * Rol del usuario en la empresa específica
   */
  @Column()
  role: string;

  /**
   * Identificador de tarjeta o credencial NFC en el ámbito de esta empresa (fichajes).
   * Correlativo por empresa; único junto con enterprise_id en base de datos.
   */
  @Column({ name: 'card_id', type: 'int' })
  cardId: number;

  /**
   * Plantilla de horario por defecto del usuario **en esta empresa** (FK opcional hacia `default_schedules`).
   * Misma semántica que `card_id`: un valor por vínculo usuario–empresa.
   */
  @ManyToOne(() => DefaultSchedule, defaultSchedule => defaultSchedule.userEnterpriseLinks, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'default_schedule_id' })
  defaultSchedule: DefaultSchedule | null;

  /**
   * UUID de la plantilla (útil en JSON sin expandir `defaultSchedule`).
   */
  @RelationId((link: UserEnterprise) => link.defaultSchedule)
  defaultScheduleId: string | null;

  /**
   * Fecha en que se creó la asociación
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * Fecha en que se actualizó la asociación
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * Relación con Usuario - El usuario en esta asociación
   */
  @ManyToOne(() => User, user => user.userEnterprises)
  @JoinColumn({ name: 'user_id' })
  user: User;

  /**
   * Relación con Empresa - La empresa en esta asociación
   */
  @ManyToOne(() => Enterprise, enterprise => enterprise.userEnterprises)
  @JoinColumn({ name: 'enterprise_id' })
  enterprise: Enterprise;

  /**
   * Fichajes registrados en el ámbito de este vínculo usuario–empresa.
   */
  @OneToMany(() => Signing, (signing) => signing.userEnterprise)
  signings: Signing[];

  /**
   * Permisos/vacaciones registrados en el ámbito de este vínculo usuario–empresa.
   */
  @OneToMany(() => Vacation, (vacation) => vacation.userEnterprise)
  vacations: Vacation[];

  /**
   * Franjas de trabajo registradas en el ámbito de este vínculo usuario–empresa.
   */
  @OneToMany(() => WorkSchedule, (workSchedule) => workSchedule.userEnterprise)
  workSchedules: WorkSchedule[];
} 