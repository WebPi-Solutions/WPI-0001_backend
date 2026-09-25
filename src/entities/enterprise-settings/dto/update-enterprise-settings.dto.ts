import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/** Datos permitidos para actualizar el valor de una configuración existente. */
export class UpdateEnterpriseSettingsDto {
  @ApiProperty({
    description: 'Nuevo valor de la configuración',
    example: 'Gracias por su confianza',
  })
  @IsString()
  value: string;
}
