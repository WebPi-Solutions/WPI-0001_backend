import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { SigningAction } from 'src/entities/signing/signing.entity';

/**
 * Actualización parcial de un fichaje (no permite cambiar `userId` desde la API pública).
 */
export class UpdateSigningDto {
  @ApiProperty({
    description: 'Tipo de fichaje',
    enum: SigningAction,
    required: false,
  })
  @IsEnum(SigningAction)
  @IsOptional()
  action?: SigningAction;

  @ApiProperty({
    description: 'Momento efectivo del fichaje (ISO 8601)',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  moment?: string;

  @ApiProperty({ description: 'Duración en segundos', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationInSeconds?: number | null;
}
