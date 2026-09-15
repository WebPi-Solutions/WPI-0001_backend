import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { AiRequestType } from 'src/entities/ai-request/ai-request.entity';
import { AiMode } from 'src/common/models/AiMode';

/**
 * Cuerpo para registrar una petición a la API de IA.
 * `enterpriseId` lo aporta el controlador vía query.
 */
export class CreateAiRequestDto {
  /**
   * Identificador que agrupa las peticiones del mismo procesamiento
   */
  @ApiProperty({
    description: 'UUID de correlación del procesamiento (se genera si no se informa)',
    required: false,
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsOptional()
  correlationId?: string;

  /**
   * Modo de IA con el que se realizó la petición.
   * Si no se informa, se persiste `standard`.
   */
  @ApiProperty({
    description: 'Modo de IA usado (`standard` u OCR, `premium` o PDF)',
    enum: AiMode,
    required: false,
    example: AiMode.STANDARD,
  })
  @IsEnum(AiMode)
  @IsOptional()
  aiMode?: AiMode;

  /**
   * Tokens de prompt
   */
  @ApiProperty({ description: 'Tokens de entrada empleados', example: 80 })
  @IsInt()
  @Min(0)
  promptTokens: number;

  /**
   * Tokens de completion
   */
  @ApiProperty({ description: 'Tokens de salida empleados', example: 20 })
  @IsInt()
  @Min(0)
  completionTokens: number;

  /**
   * Tokens totales
   */
  @ApiProperty({ description: 'Tokens totales empleados', example: 100 })
  @IsInt()
  @Min(0)
  totalTokens: number;

  /**
   * Tipo de petición
   */
  @ApiProperty({
    description: 'Tipo de petición a la API de IA',
    enum: AiRequestType,
    example: AiRequestType.GET_SPENT_ISSUER,
  })
  @IsEnum(AiRequestType)
  type: AiRequestType;

  /**
   * Prompt enviado al modelo
   */
  @ApiProperty({ description: 'Contenido enviado al modelo' })
  @IsString()
  @IsNotEmpty()
  message: string;

  /**
   * Respuesta estructurada del modelo
   */
  @ApiProperty({
    description: 'Respuesta JSON del modelo',
    required: false,
    nullable: true,
  })
  @IsObject()
  @IsOptional()
  response?: Record<string, unknown> | null;
}
