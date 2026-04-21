import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEmail, IsOptional, IsEnum, IsArray, ValidateNested, IsUUID, ValidateIf } from 'class-validator';
import { UserStatusTypes } from '../user.entity';
import { UserEnterprise } from '../user-enterprise.entity';
import { Type } from 'class-transformer';

export class CreateUserDto {
  @ApiProperty({ description: 'Nombre del usuario', required: true, example: 'Juan Pérez' })
  @IsString()
  @IsNotEmpty()
  name: string;
  
  @ApiProperty({ description: 'Correo electrónico del usuario', required: true, example: 'juan.perez@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Teléfono del usuario', required: false, example: '666666666' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ description: 'Estado del usuario', default: UserStatusTypes.ACTIVE, enum: UserStatusTypes, example: UserStatusTypes.ACTIVE })
  @IsEnum(UserStatusTypes)
  @IsOptional()
  status?: UserStatusTypes;

  @ApiProperty({ description: 'Empresas del usuario', required: true, example: [{ id: '1', name: 'Empresa 1' }] })
  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => UserEnterprise)
  userEnterprises: UserEnterprise[];

  @ApiProperty({ description: 'Contraseña del usuario (obligatoria solo para usuarios nuevos)', required: false, example: '123456' })
  @IsString()
  @IsOptional()
  password?: string;

  /**
   * UUID de la plantilla de horario por defecto para el vínculo con la empresa indicada (`user_enterprise.default_schedule_id`).
   * Opcional; si se omite o es nulo, ese vínculo no tendrá plantilla asignada.
   */
  @ApiPropertyOptional({
    description:
      'UUID opcional de plantilla de horario para el vínculo usuario–empresa (columna default_schedule_id en user_enterprise).',
    format: 'uuid',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsUUID()
  defaultScheduleId?: string | null;
}