import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { SigningAction } from 'src/entities/signing/signing.entity';
import { UserEnterpriseResponseDto } from 'src/entities/user/dto/user-response.dto';

/**
 * DTO de salida para filas de histórico `signings_updates`.
 */
export class SigningUpdateResponseDto {
  @ApiProperty({ description: 'UUID del registro de histórico' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'UUID del vínculo usuario–empresa' })
  @Expose()
  userEnterpriseId: string;

  @ApiProperty({ description: 'UUID del fichaje afectado' })
  @Expose()
  signingsId: string;

  @ApiProperty({ description: 'Momento previo al cambio' })
  @Expose()
  previousMoment: Date;

  @ApiProperty({ description: 'Momento tras el cambio' })
  @Expose()
  updatedMoment: Date;

  @ApiProperty({ description: 'Acción previa', enum: SigningAction })
  @Expose()
  previousAction: SigningAction;

  @ApiProperty({ description: 'Acción nueva', enum: SigningAction })
  @Expose()
  updatedAction: SigningAction;

  @ApiProperty({ description: 'Fecha de creación del registro de histórico' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: 'Fecha de última actualización' })
  @Expose()
  updatedAt: Date;

  @ApiProperty({
    description: 'Vínculo cargado (si la consulta lo incluye)',
    type: () => UserEnterpriseResponseDto,
    required: false,
  })
  @Expose()
  @Type(() => UserEnterpriseResponseDto)
  userEnterprise?: UserEnterpriseResponseDto;
}
