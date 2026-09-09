import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { EnterpriseResponseDto } from 'src/entities/enterprise/dto/enterprise-response.dto';
import { AiRequestType } from '../ai-request.entity';

/**
 * DTO de salida para peticiones a la API de IA (`ai_requests`).
 */
export class AiRequestResponseDto {
  /**
   * Identificador único de la petición
   */
  @ApiProperty({ description: 'UUID de la petición de IA' })
  @Expose()
  id: string;

  /**
   * Empresa que origina la petición
   */
  @ApiProperty({ description: 'UUID de la empresa' })
  @Expose()
  enterpriseId: string;

  /**
   * Identificador de correlación del procesamiento
   */
  @ApiProperty({ description: 'UUID que agrupa las peticiones del mismo procesamiento' })
  @Expose()
  correlationId: string;

  /**
   * Tokens de entrada
   */
  @ApiProperty({ description: 'Tokens de prompt empleados' })
  @Expose()
  promptTokens: number;

  /**
   * Tokens de salida
   */
  @ApiProperty({ description: 'Tokens de completion empleados' })
  @Expose()
  completionTokens: number;

  /**
   * Tokens totales
   */
  @ApiProperty({ description: 'Tokens totales empleados' })
  @Expose()
  totalTokens: number;

  /**
   * Tipo de petición
   */
  @ApiProperty({ description: 'Tipo de petición', enum: AiRequestType })
  @Expose()
  type: AiRequestType;

  /**
   * Prompt enviado al modelo
   */
  @ApiProperty({ description: 'Contenido enviado al modelo' })
  @Expose()
  message: string;

  /**
   * Respuesta estructurada del modelo
   */
  @ApiProperty({
    description: 'Respuesta JSON del modelo',
    required: false,
    nullable: true,
  })
  @Expose()
  response: Record<string, unknown> | null;

  /**
   * Fecha de creación
   */
  @ApiProperty({ description: 'Fecha de creación' })
  @Expose()
  createdAt: Date;

  /**
   * Fecha de última actualización
   */
  @ApiProperty({ description: 'Fecha de última actualización' })
  @Expose()
  updatedAt: Date;

  /**
   * Empresa cargada (vista pública)
   */
  @ApiProperty({
    description: 'Empresa cargada (vista pública)',
    type: () => EnterpriseResponseDto,
    required: false,
  })
  @Expose()
  @Type(() => EnterpriseResponseDto)
  enterprise?: EnterpriseResponseDto;
}
