import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { SigningAction } from 'src/entities/signing/signing.entity';
import { UserEnterpriseResponseDto } from 'src/entities/user/dto/user-response.dto';

/**
 * DTO de salida para fichajes (`signings`).
 */
export class SigningResponseDto {
  @ApiProperty({ description: 'UUID del fichaje' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'UUID del vínculo usuario–empresa' })
  @Expose()
  userEnterpriseId: string;

  @ApiProperty({ description: 'Tipo de acción', enum: SigningAction })
  @Expose()
  action: SigningAction;

  @ApiProperty({ description: 'Momento efectivo del fichaje' })
  @Expose()
  moment: Date;

  @ApiProperty({
    description: 'Duración en segundos (opcional)',
    required: false,
    nullable: true,
  })
  @Expose()
  durationInSeconds: number | null;

  @ApiProperty({ description: 'Si el fichaje está anulado lógicamente' })
  @Expose()
  cancelled: boolean;

  @ApiProperty({ description: 'Fecha de creación (auditoría)' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: 'Fecha de última actualización' })
  @Expose()
  updatedAt: Date;

  @ApiProperty({
    description: 'Vínculo usuario–empresa con empresa en vista pública',
    type: () => UserEnterpriseResponseDto,
    required: false,
  })
  @Expose()
  @Type(() => UserEnterpriseResponseDto)
  userEnterprise?: UserEnterpriseResponseDto;
}
