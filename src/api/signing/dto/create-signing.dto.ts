import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { SigningAction } from 'src/entities/signing/signing.entity';

/**
 * Cuerpo para registrar un fichaje (`signings`).
 */
export class CreateSigningDto {
  @ApiProperty({ description: 'Usuario que ficha' })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: 'Tipo de fichaje',
    enum: SigningAction,
    example: SigningAction.START,
  })
  @IsEnum(SigningAction)
  @IsNotEmpty()
  action: SigningAction;

  @ApiProperty({
    description:
      'Momento efectivo del fichaje (ISO 8601). Si se omite, usa el valor por defecto de base de datos.',
    required: false,
    example: '2026-04-13T08:15:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  moment?: string;

  @ApiProperty({
    description: 'Duración en segundos (p. ej. al cerrar franja)',
    required: false,
    example: 28800,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationInSeconds?: number | null;
}
