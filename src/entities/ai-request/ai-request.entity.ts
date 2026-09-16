import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AiMode, AiRequestType } from 'src/common/enums';
import { Enterprise } from '../enterprise/enterprise.entity';

/**
 * Entidad que representa una petición a la API de IA (`ai_requests`).
 * Cada fila corresponde a una llamada (emisor o conceptos), no a un PDF completo.
 */
@Entity('ai_requests')
export class AiRequest {
  /**
   * Identificador único de la petición
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Empresa que origina la petición
   */
  @Column({ name: 'enterprise_id' })
  enterpriseId: string;

  /**
   * Modo de IA usado en esta petición (`standard` u OCR, `premium` o PDF).
   */
  @ApiProperty({
    description: 'Modo de IA con el que se realizó la petición',
    enum: AiMode,
    example: AiMode.STANDARD,
  })
  @Column({
    name: 'ai_mode',
    type: 'enum',
    enum: AiMode,
    enumName: 'ai_modes',
    default: AiMode.STANDARD,
  })
  aiMode: AiMode;

  /**
   * Identificador que agrupa las peticiones del mismo procesamiento (p. ej. un PDF)
   */
  @Column({ name: 'correlation_id', type: 'uuid' })
  correlationId: string;

  /**
   * Tokens de entrada (prompt) empleados en la petición
   */
  @Column({ name: 'prompt_tokens', type: 'int' })
  promptTokens: number;

  /**
   * Tokens de salida (completion) empleados en la petición
   */
  @Column({ name: 'completion_tokens', type: 'int' })
  completionTokens: number;

  /**
   * Tokens totales empleados en la petición
   */
  @Column({ name: 'total_tokens', type: 'int' })
  totalTokens: number;

  /**
   * Tipo de extracción realizada
   */
  @ApiProperty({
    description: 'Tipo de petición a la API de IA',
    enum: AiRequestType,
    example: AiRequestType.GET_SPENT_ISSUER,
  })
  @Column({
    name: 'type',
    type: 'enum',
    enum: AiRequestType,
    enumName: 'ai_request_types',
  })
  type: AiRequestType;

  /**
   * Contenido enviado al modelo (prompt de usuario)
   */
  @Column({ type: 'text' })
  message: string;

  /**
   * Respuesta estructurada del modelo, si la petición terminó correctamente
   */
  @Column({ type: 'jsonb', nullable: true })
  response: Record<string, unknown> | null;

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
   * Empresa propietaria de la petición
   */
  @ManyToOne(() => Enterprise, enterprise => enterprise.aiRequests, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'enterprise_id' })
  enterprise: Enterprise;
}
