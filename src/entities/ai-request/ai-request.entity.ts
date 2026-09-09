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
import { Enterprise } from '../enterprise/enterprise.entity';

/**
 * Tipos de petición a la API de IA (enum PostgreSQL `ai_request_types`).
 */
export enum AiRequestType {
  GET_SPENT_ISSUER = 'get_spent_issuer',
  GET_SPENT_CONCEPTS = 'get_spent_concepts',
}

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
